import { Texture } from 'pixi.js';

/** A source palette colour and the colour it should become, both `0xRRGGBB`. */
export interface PaletteMapping {
	readonly from: readonly number[];
	readonly to: readonly number[];
}

/** The three-stop gradient a team colour (or any palette range) is built from. */
export interface PaletteRange {
	readonly min: number;
	readonly mid: number;
	readonly max: number;
}

function hexToRgb(hex: number): readonly [number, number, number] {
	return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function rgbToHex(r: number, g: number, b: number): number {
	return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function lerpColor(from: number, to: number, t: number): number {
	const [r1, g1, b1] = hexToRgb(from);
	const [r2, g2, b2] = hexToRgb(to);
	return rgbToHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t));
}

/**
 * Builds a `PaletteMapping` that replaces every colour of `reference` with the matching stop
 * of a three-colour gradient (`range.min` through `range.mid` to `range.max`), the shape a
 * team colour or any other `[color_range]`-style remap is defined by. `reference` is assumed
 * ordered from lightest to darkest; each entry's position in that order, not its own value,
 * decides where along `min -> mid -> max` it lands, so recolouring never depends on knowing
 * what the reference colours actually are.
 *
 * @example
 * ```ts
 * import { paletteRangeMapping, recolorTexture } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const texture: Texture2D;
 * declare const magentaReference: readonly number[]; // a game's own reference palette, lightest first
 *
 * const redTeam = paletteRangeMapping(magentaReference, { min: 0xffe0e0, mid: 0xc00000, max: 0x400000 });
 * const recolored = recolorTexture(texture, redTeam);
 * ```
 */
export function paletteRangeMapping(reference: readonly number[], range: PaletteRange): PaletteMapping {
	const to = reference.map((_, index) => {
		if (reference.length <= 1) return range.mid;
		const t = index / (reference.length - 1);
		return t <= 0.5 ? lerpColor(range.min, range.mid, t * 2) : lerpColor(range.mid, range.max, (t - 0.5) * 2);
	});
	return { from: reference, to };
}

/**
 * The renderer-free core of a palette remap: every opaque pixel is repainted with the `to`
 * colour of whichever `from` entry it is nearest to in RGB space, alpha and fully transparent
 * pixels left untouched. Exported on its own so the remap logic is unit-testable without a
 * canvas or a texture.
 *
 * @example
 * ```ts
 * import { remapPixels } from '@datamoc/mw_games/two-d/render';
 *
 * const pixels = new Uint8ClampedArray([255, 0, 255, 255]); // one opaque magenta pixel
 * const out = remapPixels(pixels, { from: [0xff00ff], to: [0xff0000] });
 * console.log([...out]); // [255, 0, 0, 255]
 * ```
 */
export function remapPixels(pixels: Uint8ClampedArray, mapping: PaletteMapping): Uint8ClampedArray {
	const from = mapping.from.map(hexToRgb);
	const out = new Uint8ClampedArray(pixels.length);
	for (let index = 0; index < pixels.length; index += 4) {
		const alpha = pixels[index + 3];
		if (alpha === 0 || from.length === 0) {
			out[index] = pixels[index];
			out[index + 1] = pixels[index + 1];
			out[index + 2] = pixels[index + 2];
			out[index + 3] = alpha;
			continue;
		}
		const r = pixels[index];
		const g = pixels[index + 1];
		const b = pixels[index + 2];
		let nearest = 0;
		let nearestDistance = Infinity;
		for (let paletteIndex = 0; paletteIndex < from.length; paletteIndex += 1) {
			const [fr, fg, fb] = from[paletteIndex];
			const dr = r - fr;
			const dg = g - fg;
			const db = b - fb;
			const distance = dr * dr + dg * dg + db * db;
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearest = paletteIndex;
			}
		}
		const [tr, tg, tb] = hexToRgb(mapping.to[nearest] ?? mapping.from[nearest]);
		out[index] = tr;
		out[index + 1] = tg;
		out[index + 2] = tb;
		out[index + 3] = alpha;
	}
	return out;
}

/** The subset of `CanvasRenderingContext2D` a palette remap needs, so a test can fake it. */
export interface RemapCanvasContext {
	drawImage(image: unknown, dx: number, dy: number): void;
	getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
	putImageData(imageData: { data: Uint8ClampedArray; width: number; height: number }, dx: number, dy: number): void;
}

export interface RemapCanvas {
	width: number;
	height: number;
	getContext(kind: '2d'): RemapCanvasContext | null;
}

export interface RecolorProbe {
	createCanvas?(width: number, height: number): RemapCanvas | null;
}

/**
 * Opens a canvas the size of `texture`, draws it in, and hands the 2D context to `paint` to
 * make whatever further edits it needs (a palette remap, a composited overlay, a rewritten
 * alpha channel); the result becomes the returned `Texture`. Shared by every texture-level
 * image modifier (`recolorTexture` here, `~BLIT`/`~MASK` in `ImageModifiers.ts`) so each one
 * only has to write its own pixel or compositing logic, not the canvas bookkeeping. Returns
 * `texture` unchanged if there is no usable 2D canvas.
 */
export function withTextureCanvas(
	texture: Texture,
	probe: RecolorProbe,
	paint: (context: RemapCanvasContext, width: number, height: number) => void,
): Texture {
	const width = texture.width;
	const height = texture.height;
	if (width <= 0 || height <= 0 || !texture.source) return texture;

	const canvas =
		probe.createCanvas?.(width, height) ??
		(typeof document === 'undefined' ? null : (document.createElement('canvas') as unknown as RemapCanvas));
	if (!canvas) return texture;
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) return texture;

	context.drawImage(texture.source.resource, 0, 0);
	paint(context, width, height);
	return Texture.from(canvas as unknown as HTMLCanvasElement);
}

/**
 * Recolours a texture by palette remap: draws it to a canvas, runs `remapPixels` over the raw
 * pixel data, and returns a new `Texture` wrapping the result. The source texture is never
 * mutated, so the same base art recolours per team without extra copies kept around by the
 * caller. Needs a real 2D canvas context (unlike `remapPixels` itself), so pass `probe` in a
 * test or host integration with no DOM; omitting it uses `document.createElement('canvas')`.
 *
 * @example
 * ```ts
 * import { paletteRangeMapping, recolorTexture } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const texture: Texture2D;
 * const mapping = paletteRangeMapping([0xffffff, 0x808080, 0x000000], { min: 0xffe0e0, mid: 0xc00000, max: 0x400000 });
 * const redTeam = recolorTexture(texture, mapping);
 * ```
 */
export function recolorTexture(texture: Texture, mapping: PaletteMapping, probe: RecolorProbe = {}): Texture {
	return withTextureCanvas(texture, probe, (context, width, height) => {
		const imageData = context.getImageData(0, 0, width, height);
		const remapped = remapPixels(imageData.data, mapping);
		context.putImageData({ data: remapped, width, height }, 0, 0);
	});
}
