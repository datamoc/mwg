import { Texture } from 'pixi.js';

/** A source palette colour and the colour it should become, both `0xRRGGBB`. */
export interface PaletteMapping {
	readonly from: readonly number[];
	readonly to: readonly number[];
}

/**
 * How a pixel that is not an exact `from` colour is treated. `'exact'` (the default for
 * `remapPixels`/`recolorTexture`) leaves it untouched - the correct behaviour for a discrete
 * swap like `~RC`/`~PAL`, and for a `paletteRangeMapping` over a reference palette, where the
 * pixels that are not in the palette are the ones the artists deliberately left alone (shading,
 * outlines, anti-aliased edges). `'nearest'` repaints every opaque pixel with whichever `from`
 * entry it is closest to, which is what a palette that covers the whole image wants - a dense
 * generated ramp where every pixel is meant to be recoloured. Using `'nearest'` with a sparse
 * `from` list (an `~RC` pair or two, a three-colour reference palette) repaints the entire image
 * toward whichever entry happens to be closest, which is the bug this mode exists to prevent.
 */
export type PaletteRemapMode = 'exact' | 'nearest';

/**
 * The three-stop gradient a team colour (or any palette range) is built from. `mid` is the
 * shade the reference's own anchor colour becomes, `min` the one at the dark end of the range
 * and `max` the one at the bright end.
 */
export interface PaletteRange {
	readonly min: number;
	readonly mid: number;
	readonly max: number;
}

function hexToRgb(hex: number): readonly [number, number, number] {
	return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** a colour's brightness, as the integer average of its channels - the engine's own ruler */
function brightnessOf(color: number): number {
	const [r, g, b] = hexToRgb(color);
	return Math.floor((r + g + b) / 3);
}

/**
 * One channel of `ratio * a + (1 - ratio) * b`, truncated rather than rounded, because that is
 * the arithmetic a palette range's shades are defined in: rounding instead of truncating puts
 * every shade up to a whole step brighter, and the difference shows wherever art is painted
 * from the shades. No clamp goes on top of it, and none is needed: a ratio never leaves 0..1
 * and both ends are channels, so a value between them is already a channel.
 */
function blendedChannel(a: number, b: number, ratio: number): number {
	return Math.trunc(ratio * a + (1 - ratio) * b);
}

/** `ratio` of the way from `b` to `a`, per channel, as a packed `0xRRGGBB` */
function blend(a: number, b: number, ratio: number): number {
	const [ar, ag, ab] = hexToRgb(a);
	const [br, bg, bb] = hexToRgb(b);
	return (blendedChannel(ar, br, ratio) << 16) | (blendedChannel(ag, bg, ratio) << 8) | blendedChannel(ab, bb, ratio);
}

/**
 * Builds a `PaletteMapping` that recolours every entry of `reference` into a shade of the
 * `min -> mid -> max` gradient, the shape a team colour or any other `[color_range]`-style
 * remap is defined by. `reference` is the exact list of colours the art was painted with, so
 * pixels outside it - anti-aliased edges, shading, outlines - are left alone by an `'exact'`
 * remap, which is the mode this pairs with.
 *
 * The reference's *first* entry is its anchor, and it is the one colour whose shade is fixed by
 * the range alone: it becomes `mid`. Every other entry is placed by its own brightness rather
 * than by its position, so the *rest* of the list needs no order - a darker entry blends towards
 * `min` and a brighter one towards `max`, each in proportion to how its average compares with
 * the anchor's. That is what lets one mapping reproduce art as shaded as the reference it was
 * painted from, and what the first entry has to be: the base shade the art was built around.
 *
 * Brightness and the blend are computed the way the engine they mirror does, a floored integer
 * average and a truncated blend, which is what makes the shades equal the engine's byte for byte
 * rather than merely close. The engine's own black-and-white special cases fall out of the two
 * branches here rather than being spelled out: an anchor with an average of 0 has no ratio to
 * divide by, so every entry takes the brighter branch and `mid` is the top of the scale instead
 * of the middle of it, and a white anchor is at least as bright as everything, so every entry
 * takes the darker one.
 *
 * @example
 * ```ts
 * import { paletteRangeMapping, recolorTexture } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const texture: Texture2D;
 * declare const magentaReference: readonly number[]; // the exact colours the art was painted with
 *
 * const redTeam = paletteRangeMapping(magentaReference, { min: 0x000000, mid: 0xff0000, max: 0xffffff });
 * const recolored = recolorTexture(texture, redTeam); // 'exact': only those pixels are repainted
 * ```
 */
export function paletteRangeMapping(reference: readonly number[], range: PaletteRange): PaletteMapping {
	const anchor = reference.length > 0 ? brightnessOf(reference[0]) : 255;

	const to = reference.map((color) => {
		const brightness = brightnessOf(color);
		if (anchor !== 0 && brightness <= anchor) return blend(range.mid, range.min, brightness / anchor);
		return blend(range.mid, range.max, (255 - brightness) / (255 - anchor));
	});

	return { from: reference, to };
}

/**
 * The renderer-free core of a palette remap. In `'exact'` mode (the default) a pixel is
 * repainted only when it exactly matches one of `mapping.from`; every other pixel, including
 * one close but not identical to a `from` colour, passes through unchanged. In `'nearest'` mode
 * every opaque pixel is repainted with the `to` colour of whichever `from` entry it is nearest
 * to in RGB space. Alpha and fully transparent pixels are always left untouched. Exported on
 * its own so the remap logic is unit-testable without a canvas or a texture.
 *
 * @example
 * ```ts
 * import { remapPixels } from '@datamoc/mw_games/two-d/render';
 *
 * const pixels = new Uint8ClampedArray([255, 0, 255, 255, 10, 10, 10, 255]); // magenta, then dark grey
 * const out = remapPixels(pixels, { from: [0xff00ff], to: [0xff0000] }); // 'exact' by default
 * console.log([...out.slice(0, 4)]); // [255, 0, 0, 255] - the exact match repainted
 * console.log([...out.slice(4, 8)]); // [10, 10, 10, 255] - not a match, left alone
 * ```
 */
export function remapPixels(
	pixels: Uint8ClampedArray,
	mapping: PaletteMapping,
	mode: PaletteRemapMode = 'exact',
): Uint8ClampedArray {
	const from = mapping.from.map(hexToRgb);
	const out = new Uint8ClampedArray(pixels.length);
	for (let index = 0; index < pixels.length; index += 4) {
		const alpha = pixels[index + 3];
		const r = pixels[index];
		const g = pixels[index + 1];
		const b = pixels[index + 2];

		out[index] = r;
		out[index + 1] = g;
		out[index + 2] = b;
		out[index + 3] = alpha;
		if (alpha === 0 || from.length === 0) continue;

		if (mode === 'exact') {
			const match = from.findIndex(([fr, fg, fb]) => fr === r && fg === g && fb === b);
			if (match < 0) continue;
			const [tr, tg, tb] = hexToRgb(mapping.to[match] ?? mapping.from[match]);
			out[index] = tr;
			out[index + 1] = tg;
			out[index + 2] = tb;
			continue;
		}

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
 * image modifier (`recolorTexture` here, `~BLIT`/`~MASK`/`~BLEND` in `ImageModifiers.ts`) so
 * each one only has to write its own pixel or compositing logic, not the canvas bookkeeping.
 * Returns `texture` unchanged if there is no usable 2D canvas.
 *
 * @example
 * ```ts
 * import { withTextureCanvas } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const texture: Texture2D;
 *
 * // a minimal custom modifier: invert every pixel's RGB, alpha untouched
 * const inverted = withTextureCanvas(texture, {}, (context, width, height) => {
 * 	const { data } = context.getImageData(0, 0, width, height);
 * 	for (let i = 0; i < data.length; i += 4) {
 * 		data[i] = 255 - data[i];
 * 		data[i + 1] = 255 - data[i + 1];
 * 		data[i + 2] = 255 - data[i + 2];
 * 	}
 * 	context.putImageData({ data, width, height }, 0, 0);
 * });
 * ```
 */
export function withTextureCanvas(
	texture: Texture,
	probe: RecolorProbe,
	paint: (context: RemapCanvasContext, width: number, height: number) => void,
): Texture {
	const width = texture.width;
	const height = texture.height;
	if (width <= 0 || height <= 0 || !texture.source) return texture;

	const usingRealCanvas = !probe.createCanvas;
	const canvas =
		probe.createCanvas?.(width, height) ??
		(typeof document === 'undefined' ? null : (document.createElement('canvas') as unknown as RemapCanvas));
	if (!canvas) return texture;
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) return texture;

	//a real `CanvasRenderingContext2D.putImageData` throws on a plain `{data,width,height}` -
	//it needs an actual `ImageData` - so every pixel-level modifier can write the plain object
	//`RemapCanvasContext` declares and this is the one place that makes it real
	const paintContext: RemapCanvasContext = usingRealCanvas
		? {
				drawImage: context.drawImage.bind(context),
				getImageData: context.getImageData.bind(context),
				putImageData: (imageData, dx, dy) =>
					context.putImageData(
						new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height),
						dx,
						dy,
					),
			}
		: context;

	context.drawImage(texture.source.resource, 0, 0);
	paint(paintContext, width, height);
	return Texture.from(canvas as unknown as HTMLCanvasElement);
}

/**
 * Recolours a texture by palette remap: draws it to a canvas, runs `remapPixels` over the raw
 * pixel data, and returns a new `Texture` wrapping the result. The source texture is never
 * mutated, so the same base art recolours per team without extra copies kept around by the
 * caller. Needs a real 2D canvas context (unlike `remapPixels` itself), so pass `probe` in a
 * test or host integration with no DOM; omitting it uses `document.createElement('canvas')`.
 *
 * `mode` defaults to `'exact'`, correct for a discrete swap (`~RC`/`~PAL`'s short, specific
 * `from` list); a `paletteRangeMapping` gradient, meant to cover the whole reference palette a
 * team's art is drawn against, wants `'nearest'` instead - see `PaletteRemapMode`'s own doc for
 * why the wrong choice silently recolours far more of the image than intended.
 *
 * @example
 * ```ts
 * import { paletteRangeMapping, recolorTexture } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const texture: Texture2D;
 * const mapping = paletteRangeMapping([0xffffff, 0x808080, 0x000000], { min: 0xffe0e0, mid: 0xc00000, max: 0x400000 });
 * const redTeam = recolorTexture(texture, mapping, {}, 'nearest');
 * ```
 */
export function recolorTexture(
	texture: Texture,
	mapping: PaletteMapping,
	probe: RecolorProbe = {},
	mode: PaletteRemapMode = 'exact',
): Texture {
	return withTextureCanvas(texture, probe, (context, width, height) => {
		const imageData = context.getImageData(0, 0, width, height);
		const remapped = remapPixels(imageData.data, mapping, mode);
		context.putImageData({ data: remapped, width, height }, 0, 0);
	});
}
