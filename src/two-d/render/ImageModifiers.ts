import { ColorMatrixFilter, Rectangle, Sprite, Texture } from 'pixi.js';
import { recolorTexture, withTextureCanvas } from './PaletteRemap.ts';
import type { PaletteMapping, RecolorProbe, RemapCanvas } from './PaletteRemap.ts';
import type { Texture2D } from './Types2D.ts';

/** A parsed `image~MOD(args)` path, usable by any MWG game content format. */
export interface ImageModifier {
	readonly name: string;
	readonly args: readonly string[];
}

export interface ParsedImagePath {
	readonly path: string;
	readonly modifiers: readonly ImageModifier[];
}

/** Split top-level modifiers while keeping nested `~` paths inside arguments.
 * @example
 * ```ts
 * import { parseImagePath } from '@datamoc/mw_games/two-d/render';
 * const parsed = parseImagePath('hero.png~FL(horizontal)~GS');
 * ```
 */
export function parseImagePath(value: string): ParsedImagePath {
	value = value.replace(/^"|"$/g, '');
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] === '(') depth += 1;
		else if (value[index] === ')') depth = Math.max(0, depth - 1);
		else if (value[index] === '~' && depth === 0) {
			parts.push(value.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(value.slice(start));
	const path = (parts.shift() ?? '').trim();
	const modifiers: ImageModifier[] = [];
	for (const source of parts) {
		const match = /^([A-Za-z][A-Za-z0-9_-]*)(?:\((.*)\))?$/.exec(source.trim());
		if (!match) continue;
		modifiers.push({
			name: match[1].toUpperCase(),
			args: match[2] === undefined ? [] : match[2].split(',').map((arg) => arg.trim()),
		});
	}
	return { path, modifiers };
}

/** Return one named modifier from a parsed image path.
 * @example
 * ```ts
 * import { imageModifier, parseImagePath } from '@datamoc/mw_games/two-d/render';
 * const flip = imageModifier(parseImagePath('hero.png~FL(horizontal)'), 'FL');
 * ```
 */
export function imageModifier(path: ParsedImagePath, name: string): ImageModifier | undefined {
	return path.modifiers.find((entry) => entry.name === name.toUpperCase());
}

/**
 * Build the Pixi 5x4 colour-matrix for a Wesnoth `CS(r,g,b)` shift.
 *
 * @example
 * ```ts
 * import { colorShiftMatrix } from '@datamoc/mw_games/two-d/render';
 * const matrix = colorShiftMatrix(-20, 0, 30);
 * console.log(matrix.length); // 20
 * ```
 */
export function colorShiftMatrix(red: number, green: number, blue: number): ColorMatrixFilter['matrix'] {
	return [
		1,
		0,
		0,
		0,
		red / 255,
		0,
		1,
		0,
		0,
		green / 255,
		0,
		0,
		1,
		0,
		blue / 255,
		0,
		0,
		0,
		1,
		0,
	] as unknown as ColorMatrixFilter['matrix'];
}

/**
 * Build the matrix for `~R`/`~G`/`~B(percent)`: scales one or more channels by a percentage
 * (100 = unchanged), leaving any channel not passed at 100%.
 *
 * @example
 * ```ts
 * import { channelScaleMatrix } from '@datamoc/mw_games/two-d/render';
 * const matrix = channelScaleMatrix({ red: 150 }); // ~R(150), a 50% brighter red channel
 * console.log(matrix[0]); // 1.5
 * ```
 */
export function channelScaleMatrix(scale: {
	red?: number;
	green?: number;
	blue?: number;
}): ColorMatrixFilter['matrix'] {
	const r = (scale.red ?? 100) / 100;
	const g = (scale.green ?? 100) / 100;
	const b = (scale.blue ?? 100) / 100;
	return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0] as unknown as ColorMatrixFilter['matrix'];
}

/**
 * Build the matrix for `~BLEND(color,ratio)`: lerps every pixel `ratio` of the way towards
 * `color` (0xRRGGBB), the same shape `TintedSprite.lerpTint` gives an additive-capable sprite,
 * expressed here as a plain colour matrix so a bare Pixi `Sprite` can use it too.
 *
 * @example
 * ```ts
 * import { blendMatrix } from '@datamoc/mw_games/two-d/render';
 * const matrix = blendMatrix(0xff0000, 0.5); // half-way to red
 * ```
 */
export function blendMatrix(color: number, ratio: number): ColorMatrixFilter['matrix'] {
	const keep = 1 - ratio;
	const r = ((color >> 16) & 0xff) / 255;
	const g = ((color >> 8) & 0xff) / 255;
	const b = (color & 0xff) / 255;
	return [
		keep, 0, 0, 0, r * ratio,
		0, keep, 0, 0, g * ratio,
		0, 0, keep, 0, b * ratio,
		0, 0, 0, 1, 0,
	] as unknown as ColorMatrixFilter['matrix'];
}

/** One `~CHAN` output-channel source: a named input channel, or a constant 0/1. */
export type ChannelSource = 'R' | 'G' | 'B' | 'A' | '0' | '1';

/**
 * Build the matrix for `~CHAN(r,g,b,a)`: each output channel is fed by whichever named input
 * channel (or constant black/white) is given for it, missing trailing entries left as the
 * output channel's own identity source (`R,G,B,A`).
 *
 * @example
 * ```ts
 * import { channelSwapMatrix } from '@datamoc/mw_games/two-d/render';
 * const matrix = channelSwapMatrix(['B', 'G', 'R']); // swap the red and blue channels
 * ```
 */
export function channelSwapMatrix(sources: readonly ChannelSource[]): ColorMatrixFilter['matrix'] {
	const defaults: ChannelSource[] = ['R', 'G', 'B', 'A'];
	const rows = defaults.map((identity, index) => sources[index] ?? identity);
	const row = (source: ChannelSource): readonly [number, number, number, number, number] => {
		switch (source) {
			case 'R':
				return [1, 0, 0, 0, 0];
			case 'G':
				return [0, 1, 0, 0, 0];
			case 'B':
				return [0, 0, 1, 0, 0];
			case 'A':
				return [0, 0, 0, 1, 0];
			case '0':
				return [0, 0, 0, 0, 0];
			case '1':
				return [0, 0, 0, 0, 1];
		}
	};
	return rows.flatMap((source) => row(source)) as unknown as ColorMatrixFilter['matrix'];
}

function parsePercentOrRatio(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	const percent = trimmed.endsWith('%');
	const num = Number(percent ? trimmed.slice(0, -1) : trimmed);
	if (!Number.isFinite(num)) return undefined;
	return percent || num > 1 ? num / 100 : num;
}

function parseHexColor(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const num = Number.parseInt(value.replace(/^#/, ''), 16);
	return Number.isFinite(num) ? num : undefined;
}

/** Apply the renderer-neutral subset supported by the Pixi backend. */
/**
 * @example
 * ```ts
 * import { Sprite } from 'pixi.js';
 * import { applyImageModifiers, parseImagePath } from '@datamoc/mw_games/two-d/render';
 * applyImageModifiers(new Sprite(), parseImagePath('hero.png~FL(horizontal)'));
 * ```
 */
export function applyImageModifiers(sprite: Sprite, parsed: ParsedImagePath, scale = 1): void {
	const flip = imageModifier(parsed, 'FL');
	if (flip && (flip.args.length === 0 || flip.args.some((arg) => /horiz|horizontal|x/i.test(arg))))
		sprite.scale.x *= -1;
	if (flip?.args.some((arg) => /vert|vertical|y/i.test(arg))) sprite.scale.y *= -1;
	const size = imageModifier(parsed, 'SCALE');
	if (size) {
		const width = Number(size.args[0]);
		const height = Number(size.args[1] ?? size.args[0]);
		if (Number.isFinite(width) && width > 0) sprite.width = width * scale;
		if (Number.isFinite(height) && height > 0) sprite.height = height * scale;
	}
	if (imageModifier(parsed, 'GS')) {
		const filter = new ColorMatrixFilter();
		filter.greyscale(1, false);
		sprite.filters = [...(sprite.filters ?? []), filter];
	}
	const shift = imageModifier(parsed, 'CS');
	if (shift) {
		const values = shift.args.slice(0, 3).map(Number);
		if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
			const filter = new ColorMatrixFilter();
			filter.matrix = colorShiftMatrix(values[0], values[1], values[2]);
			sprite.filters = [...(sprite.filters ?? []), filter];
		}
	}
	const rScale = imageModifier(parsed, 'R');
	const gScale = imageModifier(parsed, 'G');
	const bScale = imageModifier(parsed, 'B');
	if (rScale || gScale || bScale) {
		const red = rScale ? Number(rScale.args[0]) : undefined;
		const green = gScale ? Number(gScale.args[0]) : undefined;
		const blue = bScale ? Number(bScale.args[0]) : undefined;
		const filter = new ColorMatrixFilter();
		filter.matrix = channelScaleMatrix({
			red: Number.isFinite(red) ? red : undefined,
			green: Number.isFinite(green) ? green : undefined,
			blue: Number.isFinite(blue) ? blue : undefined,
		});
		sprite.filters = [...(sprite.filters ?? []), filter];
	}
	const blend = imageModifier(parsed, 'BLEND');
	if (blend) {
		const color = parseHexColor(blend.args[0]);
		const ratio = parsePercentOrRatio(blend.args[1]);
		if (color !== undefined && ratio !== undefined) {
			const filter = new ColorMatrixFilter();
			filter.matrix = blendMatrix(color, Math.min(1, Math.max(0, ratio)));
			sprite.filters = [...(sprite.filters ?? []), filter];
		}
	}
	const chan = imageModifier(parsed, 'CHAN');
	if (chan && chan.args.length > 0) {
		const sources = chan.args.map((arg) => arg.trim().toUpperCase()) as ChannelSource[];
		const filter = new ColorMatrixFilter();
		filter.matrix = channelSwapMatrix(sources);
		sprite.filters = [...(sprite.filters ?? []), filter];
	}
	const opacity = imageModifier(parsed, 'O');
	if (opacity) {
		const ratio = parsePercentOrRatio(opacity.args[0]);
		if (ratio !== undefined) sprite.alpha *= Math.min(1, Math.max(0, ratio));
	}
	const rotate = imageModifier(parsed, 'ROTATE');
	if (rotate) {
		const degrees = Number(rotate.args[0]);
		if (Number.isFinite(degrees)) sprite.rotation += (degrees * Math.PI) / 180;
	}
}

/** Make a cropped view without mutating the shared source texture. */
/**
 * @example
 * ```ts
 * import { Texture } from 'pixi.js';
 * import { croppedTexture, parseImagePath } from '@datamoc/mw_games/two-d/render';
 * const cropped = croppedTexture(Texture.EMPTY, parseImagePath('atlas.png~CROP(0,0,16,16)'));
 * ```
 */
export function croppedTexture(texture: Texture, parsed: ParsedImagePath): Texture {
	const crop = imageModifier(parsed, 'CROP');
	if (!crop || crop.args.length < 4 || !texture.source) return texture;
	const values = crop.args.slice(0, 4).map(Number);
	if (values.some((value) => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) return texture;
	const x = Math.max(0, values[0]);
	const y = Math.max(0, values[1]);
	const width = Math.min(values[2], Math.max(0, texture.width - x));
	const height = Math.min(values[3], Math.max(0, texture.height - y));
	return width > 0 && height > 0
		? new Texture({ source: texture.source, frame: new Rectangle(x, y, width, height) })
		: texture;
}

function parseColorPairs(args: readonly string[]): PaletteMapping {
	const from: number[] = [];
	const to: number[] = [];
	for (const arg of args) {
		const [source, target] = arg.split('>');
		const sourceColor = parseHexColor(source);
		const targetColor = parseHexColor(target);
		if (sourceColor !== undefined && targetColor !== undefined) {
			from.push(sourceColor);
			to.push(targetColor);
		}
	}
	return { from, to };
}

function parseColorList(value: string | undefined): readonly number[] {
	if (value === undefined) return [];
	return value
		.split(';')
		.map((entry) => parseHexColor(entry))
		.filter((color): color is number => color !== undefined);
}

/** Resolves a nested `~BLIT`/`~MASK` image path to a texture already loaded by the caller. */
export interface ImageTextureProbe extends RecolorProbe {
	resolveTexture?(path: string): Texture2D | undefined;
}

/**
 * Applies the modifiers that need real pixel access or a sibling texture rather than a sprite
 * property or a Pixi filter: `~RC` (exact palette swap, `src>dst` hex pairs), `~PAL` (the same
 * swap from two `;`-separated colour lists), `~BLIT` (composite another image on top at an
 * offset) and `~MASK` (take alpha from another image at an offset, keeping this image's own
 * colour). `~BLIT`/`~MASK` need `probe.resolveTexture` to find the sibling image; without it
 * they are skipped rather than treated as an error, since a caller that only wants `~RC`/`~PAL`
 * has no sibling image to resolve. The nested path's own modifiers (a `~BLIT` argument can
 * itself carry `~FL`, as in `~BLIT(claws.png~FL(horiz),4,4)`) are `resolveTexture`'s job to have
 * already applied - this function composites whatever texture it is handed, unparsed.
 *
 * @example
 * ```ts
 * import { Texture } from 'pixi.js';
 * import { applyTextureModifiers, parseImagePath } from '@datamoc/mw_games/two-d/render';
 * const recolored = applyTextureModifiers(Texture.EMPTY, parseImagePath('unit.png~RC(ff00ff>ff0000)'));
 * ```
 */
export function applyTextureModifiers(
	texture: Texture,
	parsed: ParsedImagePath,
	probe: ImageTextureProbe = {},
): Texture {
	let result = texture;

	const rc = imageModifier(parsed, 'RC');
	if (rc && rc.args.length > 0) {
		const mapping = parseColorPairs(rc.args);
		if (mapping.from.length > 0) result = recolorTexture(result, mapping, probe);
	}

	const pal = imageModifier(parsed, 'PAL');
	if (pal) {
		const from = parseColorList(pal.args[0]);
		const to = parseColorList(pal.args[1]);
		if (from.length > 0 && from.length === to.length) result = recolorTexture(result, { from, to }, probe);
	}

	const blit = imageModifier(parsed, 'BLIT');
	if (blit && blit.args.length > 0 && probe.resolveTexture) {
		const overlay = probe.resolveTexture(parseImagePath(blit.args[0]).path);
		if (overlay) {
			const x = Number(blit.args[1] ?? 0) || 0;
			const y = Number(blit.args[2] ?? 0) || 0;
			result = withTextureCanvas(result, probe, (context) => {
				context.drawImage(overlay.source.resource, x, y);
			});
		}
	}

	const mask = imageModifier(parsed, 'MASK');
	if (mask && mask.args.length > 0 && probe.resolveTexture) {
		const overlay = probe.resolveTexture(parseImagePath(mask.args[0]).path);
		if (overlay) {
			const x = Number(mask.args[1] ?? 0) || 0;
			const y = Number(mask.args[2] ?? 0) || 0;
			result = withTextureCanvas(result, probe, (context, width, height) => {
				const base = context.getImageData(0, 0, width, height);
				const maskCanvas =
					probe.createCanvas?.(overlay.width, overlay.height) ??
					(typeof document === 'undefined' ? null : (document.createElement('canvas') as unknown as RemapCanvas));
				if (!maskCanvas) return;
				maskCanvas.width = overlay.width;
				maskCanvas.height = overlay.height;
				const maskContext = maskCanvas.getContext('2d');
				if (!maskContext) return;
				maskContext.drawImage(overlay.source.resource, 0, 0);
				const maskData = maskContext.getImageData(0, 0, overlay.width, overlay.height);
				const masked = maskPixels(base.data, width, height, maskData.data, overlay.width, overlay.height, x, y);
				context.putImageData({ data: masked, width, height }, 0, 0);
			});
		}
	}

	return result;
}

/**
 * The renderer-free core of `~MASK`: `base`'s alpha channel is multiplied by `mask`'s alpha at
 * the given offset (a pixel the mask does not cover keeps zero alpha), `base`'s own colour
 * left untouched. Exported so the masking logic is testable without a canvas.
 *
 * @example
 * ```ts
 * import { maskPixels } from '@datamoc/mw_games/two-d/render';
 * const base = new Uint8ClampedArray([10, 20, 30, 255]); // one opaque pixel
 * const mask = new Uint8ClampedArray([0, 0, 0, 128]); // half-alpha mask, same 1x1 size
 * const out = maskPixels(base, 1, 1, mask, 1, 1, 0, 0);
 * console.log([...out]); // [10, 20, 30, 128]
 * ```
 */
export function maskPixels(
	base: Uint8ClampedArray,
	baseWidth: number,
	baseHeight: number,
	mask: Uint8ClampedArray,
	maskWidth: number,
	maskHeight: number,
	offsetX: number,
	offsetY: number,
): Uint8ClampedArray {
	const out = new Uint8ClampedArray(base.length);
	for (let y = 0; y < baseHeight; y += 1) {
		for (let x = 0; x < baseWidth; x += 1) {
			const baseIndex = (y * baseWidth + x) * 4;
			const maskX = x - offsetX;
			const maskY = y - offsetY;
			const inMask = maskX >= 0 && maskX < maskWidth && maskY >= 0 && maskY < maskHeight;
			const maskAlpha = inMask ? mask[(maskY * maskWidth + maskX) * 4 + 3] : 0;
			out[baseIndex] = base[baseIndex];
			out[baseIndex + 1] = base[baseIndex + 1];
			out[baseIndex + 2] = base[baseIndex + 2];
			out[baseIndex + 3] = Math.round((base[baseIndex + 3] * maskAlpha) / 255);
		}
	}
	return out;
}
