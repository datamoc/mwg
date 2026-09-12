import { ColorMatrixFilter, Rectangle, Sprite, Texture } from 'pixi.js';
import { clamp } from '../../core/Math.ts';
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
 * The sampling `~ROTATE(degrees, mode)` asks for, from its second argument: `linear` (or
 * `smooth`, since either word is what an author reaches for) interpolates, anything else -
 * including nothing at all - takes the fast nearest-neighbour path. Exported beside the other
 * path parsers for the same reason they are: a game that renders `~ROTATE` through its own
 * canvas pipeline still wants the same two names to mean the same two things.
 *
 * @example
 * ```ts
 * import { parseImagePath, imageModifier, parseRotateMode } from '@datamoc/mw_games/two-d/render';
 *
 * const rotate = imageModifier(parseImagePath('tile.png~ROTATE(60,linear)'), 'ROTATE');
 * parseRotateMode(rotate?.args[1]); // 'linear'
 * parseRotateMode(undefined); // 'nearest'
 * ```
 */
export function parseRotateMode(argument: string | undefined): RotateMode {
	return argument !== undefined && /^(linear|smooth)$/i.test(argument) ? 'linear' : 'nearest';
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
 * A live, per-frame colour-matrix approximation of a blend towards `color` (0xRRGGBB) by
 * `ratio`, the same shape `TintedSprite.lerpTint` gives an additive-capable sprite, expressed
 * here as a plain matrix so a bare Pixi `Sprite` can use it too. This is *not* what
 * `applyTextureModifiers` uses for `~BLEND` itself (that bakes an exact per-pixel blend once,
 * via `blendPixels`, rather than attaching a runtime filter) - kept as its own export for a
 * game that wants a cheap, adjustable-at-runtime approximation instead of a baked texture, the
 * tradeoff `~CS`'s `colorShiftMatrix` already makes for an additive shift.
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
		keep,
		0,
		0,
		0,
		r * ratio,
		0,
		keep,
		0,
		0,
		g * ratio,
		0,
		0,
		keep,
		0,
		b * ratio,
		0,
		0,
		0,
		1,
		0,
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

/**
 * Attaches `matrix` to `sprite` as a `ColorMatrixFilter`, so a caller using
 * `colorShiftMatrix`/`channelScaleMatrix`/`blendMatrix`/`channelSwapMatrix` never has to name
 * `pixi.js` itself just to construct the one filter class those matrices are shaped for
 * (item 309) - the same reasoning `two-d/pixi-interop.ts` gives for the rest of the interop
 * boundary. Replaces `sprite.filters` outright, the same trade-off `applyImageModifiers`'s
 * `~GS` already accepts (see its own fix, item 288): a caller layering its own filter keeps
 * that filter's job, not this one's.
 *
 * @example
 * ```ts
 * import { Sprite } from 'pixi.js';
 * import { blendMatrix, spriteColorMatrix } from '@datamoc/mw_games/two-d/render';
 *
 * const sprite = new Sprite();
 * spriteColorMatrix(sprite, blendMatrix(0xff0000, 0.5)); // half-blended red, no pixi.js import needed for the filter itself
 * ```
 */
export function spriteColorMatrix(sprite: Sprite, matrix: ColorMatrixFilter['matrix']): void {
	const filter = new ColorMatrixFilter();
	filter.matrix = matrix;
	sprite.filters = [filter];
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
	//~BLEND and ~ROTATE are NOT handled here: Wesnoth's ~BLEND is a per-pixel colour blend and
	//its ~ROTATE rotates the source pixels and expands the surface, neither of which a sprite
	//transform or a colour matrix can express exactly (a colour matrix's linear approximation of
	//a blend is close but not the same operation; a sprite's own `rotation` turns the display
	//object, not the art, which differs for terrain that must still tile after rotating). Both
	//are in `applyTextureModifiers` instead, next to the other pixel-level modifiers.
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
}

/**
 * The two-step recipe `applyImageModifiers`'s own doc comment names but leaves a caller to
 * drive by hand (item 310): bakes `applyTextureModifiers`'s exact pixel-level result
 * (`~RC`/`~PAL`/`~BLIT`/`~MASK`/`~BLEND`/`~ROTATE`) into `sprite.texture` first, then applies
 * the sprite-property/filter modifiers (`~FL`/`~SCALE`/`~GS`/`~CS`/`~R`/`~G`/`~B`/`~O`/`~CHAN`)
 * on top - the same split those two functions already have, run together so a caller with a
 * `~BLEND`/`~ROTATE` path never gets `applyImageModifiers`'s silent no-op for them. `probe` is
 * `applyTextureModifiers`'s own, needed only when the path uses `~BLIT`/`~MASK`/`~RC`/`~PAL`
 * with a named colour.
 *
 * @example
 * ```ts
 * import { Sprite, Texture } from 'pixi.js';
 * import { applyAllImageModifiers, parseImagePath } from '@datamoc/mw_games/two-d/render';
 *
 * const sprite = new Sprite(Texture.EMPTY);
 * applyAllImageModifiers(sprite, parseImagePath('hero.png~BLEND(ff0000,50%)~FL(horizontal)'));
 * // sprite.texture carries the exact per-pixel blend; sprite.scale.x is flipped
 * ```
 */
export function applyAllImageModifiers(
	sprite: Sprite,
	parsed: ParsedImagePath,
	probe: ImageTextureProbe = {},
	scale = 1,
): void {
	sprite.texture = applyTextureModifiers(sprite.texture, parsed, probe);
	applyImageModifiers(sprite, parsed, scale);
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

/** hex first (`#c0ffee`, `c0ffee`), a caller's `resolveColor` (named colours) otherwise */
function resolveColor(value: string, resolve?: (name: string) => number | undefined): number | undefined {
	const trimmed = value.trim();
	return parseHexColor(trimmed) ?? resolve?.(trimmed);
}

/**
 * `~RC(src>dst,src>dst,...)`'s pairs, each side hex (`#c0ffee`, `c0ffee`) or, when `resolve` is
 * given, a named colour (`~RC(magenta>red)`) it resolves. A pair whose either side is neither
 * hex nor resolvable is dropped rather than aborting the whole list.
 *
 * @example
 * ```ts
 * import { parseColorPairs, parseImagePath, imageModifier } from '@datamoc/mw_games/two-d/render';
 *
 * const rc = imageModifier(parseImagePath('unit.png~RC(magenta>ff0000)'), 'RC')!;
 * const mapping = parseColorPairs(rc.args, (name) => (name === 'magenta' ? 0xff00ff : undefined));
 * console.log(mapping); // { from: [0xff00ff], to: [0xff0000] }
 * ```
 */
export function parseColorPairs(
	args: readonly string[],
	resolve?: (name: string) => number | undefined,
): PaletteMapping {
	const from: number[] = [];
	const to: number[] = [];
	for (const arg of args) {
		const [source, target] = arg.split('>');
		if (source === undefined || target === undefined) continue;
		const sourceColor = resolveColor(source, resolve);
		const targetColor = resolveColor(target, resolve);
		if (sourceColor !== undefined && targetColor !== undefined) {
			from.push(sourceColor);
			to.push(targetColor);
		}
	}
	return { from, to };
}

/**
 * `~PAL(a,b,c>x,y,z)`'s two comma-separated colour lists, one per side of a single `>`. The
 * modifier's own args have already been comma-split by `parseImagePath` before this runs (the
 * same naive split every modifier's argument list goes through), so `a,b,c>x,y,z` arrives as
 * the four separate tokens `['a', 'b', 'c>x', 'y', 'z']` - rejoining them with `,` recovers the
 * original text before this does its own split on `>` and then `,`, rather than assuming the
 * list boundary landed on an argument boundary the way a naive `args[0]`/`args[1]` read would.
 *
 * @example
 * ```ts
 * import { parsePaletteLists, parseImagePath, imageModifier } from '@datamoc/mw_games/two-d/render';
 *
 * const pal = imageModifier(parseImagePath('unit.png~PAL(ff0000,00ff00>0000ff,ffff00)'), 'PAL')!;
 * console.log(parsePaletteLists(pal.args)); // { from: [0xff0000, 0x00ff00], to: [0x0000ff, 0xffff00] }
 * ```
 */
export function parsePaletteLists(
	args: readonly string[],
	resolve?: (name: string) => number | undefined,
): PaletteMapping {
	const raw = args.join(',');
	const separator = raw.indexOf('>');
	if (separator < 0) return { from: [], to: [] };

	const parseList = (side: string): number[] =>
		side
			.split(',')
			.map((entry) => resolveColor(entry, resolve))
			.filter((color): color is number => color !== undefined);

	return { from: parseList(raw.slice(0, separator)), to: parseList(raw.slice(separator + 1)) };
}

/**
 * Resolves a nested `~BLIT`/`~MASK` image path to a texture already loaded by the caller, and
 * (`~RC`/`~PAL`) a named colour that is not hex. `resolveTexture` receives the raw argument text
 * exactly as written, nested modifiers included (`unit.png~RC(magenta>red)`, not stripped down
 * to `unit.png`) - parsing and applying those is the caller's own recursive call into
 * `parseImagePath`/`applyImageModifiers`/`applyTextureModifiers`, not something this function
 * does on the caller's behalf, since a caller with no sibling asset resolver has nothing to
 * recurse into anyway.
 */
export interface ImageTextureProbe extends RecolorProbe {
	resolveTexture?(pathWithModifiers: string): Texture2D | undefined;
	resolveColor?(name: string): number | undefined;
}

/**
 * Applies the modifiers that need real pixel access or a sibling texture rather than a sprite
 * property or a Pixi filter: `~RC` (exact palette swap, `src>dst` hex or named-colour pairs -
 * see `resolveColor`/`parseColorPairs`), `~PAL` (the same swap from two comma-separated colour
 * lists either side of one `>` - see `parsePaletteLists`), `~BLIT` (composite another image on
 * top at an offset), `~MASK` (take alpha from another image at an offset, keeping this image's
 * own colour), `~BLEND` (an exact per-pixel lerp towards a colour, via `blendPixels`) and
 * `~ROTATE` (rotates the source pixels themselves and expands the surface, via `rotatePixels` -
 * this is why `~ROTATE` lives here rather than as a sprite transform: it has to be right for
 * terrain and anything else that must keep tiling after the rotation). `~ROTATE(degrees)` samples
 * nearest-neighbour, which is exact at multiples of a quarter turn; `~ROTATE(degrees,linear)`
 * interpolates instead, for the angles that are not, at four reads a pixel, and both are bake-time
 * work rather than per-frame - see `rotatePixels`. `~BLIT`/`~MASK` need
 * `probe.resolveTexture` to find the sibling image; without it they are skipped rather than
 * treated as an error, since a caller that only wants `~RC`/`~PAL` has no sibling image to
 * resolve. `resolveTexture` receives the argument exactly as written, nested modifiers included
 * (`~BLIT(claws.png~FL(horiz),4,4)` calls it with `'claws.png~FL(horiz)'`, not `'claws.png'`) -
 * parsing and applying those recursively is the caller's own job, this function composites
 * whatever texture it is handed back.
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
		const mapping = parseColorPairs(rc.args, probe.resolveColor);
		//'exact' (recolorTexture's default): RC/PAL name a short, specific palette, not a
		//covering of the whole image, so 'nearest' would repaint pixels that were never named
		if (mapping.from.length > 0) result = recolorTexture(result, mapping, probe, 'exact');
	}

	const pal = imageModifier(parsed, 'PAL');
	if (pal) {
		const mapping = parsePaletteLists(pal.args, probe.resolveColor);
		if (mapping.from.length > 0 && mapping.from.length === mapping.to.length) {
			result = recolorTexture(result, mapping, probe, 'exact');
		}
	}

	const blit = imageModifier(parsed, 'BLIT');
	if (blit && blit.args.length > 0 && probe.resolveTexture) {
		const overlay = probe.resolveTexture(blit.args[0]);
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
		const overlay = probe.resolveTexture(mask.args[0]);
		if (overlay) {
			const x = Number(mask.args[1] ?? 0) || 0;
			const y = Number(mask.args[2] ?? 0) || 0;
			result = withTextureCanvas(result, probe, (context, width, height) => {
				const base = context.getImageData(0, 0, width, height);
				const maskCanvas = createCanvas(overlay.width, overlay.height, probe);
				if (!maskCanvas) return;
				const maskContext = maskCanvas.getContext('2d');
				if (!maskContext) return;
				maskContext.drawImage(overlay.source.resource, 0, 0);
				const maskData = maskContext.getImageData(0, 0, overlay.width, overlay.height);
				const masked = maskPixels(base.data, width, height, maskData.data, overlay.width, overlay.height, x, y);
				context.putImageData({ data: masked, width, height }, 0, 0);
			});
		}
	}

	const blend = imageModifier(parsed, 'BLEND');
	if (blend) {
		const color = resolveColor(blend.args[0] ?? '', probe.resolveColor);
		const ratio = parsePercentOrRatio(blend.args[1]);
		if (color !== undefined && ratio !== undefined) {
			result = withTextureCanvas(result, probe, (context, width, height) => {
				const imageData = context.getImageData(0, 0, width, height);
				const blended = blendPixels(imageData.data, color, ratio);
				context.putImageData({ data: blended, width, height }, 0, 0);
			});
		}
	}

	const rotate = imageModifier(parsed, 'ROTATE');
	if (rotate) {
		const degrees = Number(rotate.args[0]);
		if (Number.isFinite(degrees) && degrees % 360 !== 0) {
			const width = result.width;
			const height = result.height;
			if (width > 0 && height > 0 && result.source) {
				const source = createCanvas(width, height, probe);
				const sourceContext = source?.getContext('2d');
				if (source && sourceContext) {
					sourceContext.drawImage(result.source.resource, 0, 0);
					const pixels = sourceContext.getImageData(0, 0, width, height);
					const rotated = rotatePixels(pixels.data, width, height, degrees, parseRotateMode(rotate.args[1]));
					const destination = createCanvas(rotated.width, rotated.height, probe);
					const destinationContext = destination?.getContext('2d');
					if (destination && destinationContext) {
						destinationContext.putImageData(
							{ data: rotated.data, width: rotated.width, height: rotated.height },
							0,
							0,
						);
						result = Texture.from(destination as unknown as HTMLCanvasElement);
					}
				}
			}
		}
	}

	return result;
}

function createCanvas(width: number, height: number, probe: RecolorProbe): RemapCanvas | null {
	const canvas =
		probe.createCanvas?.(width, height) ??
		(typeof document === 'undefined' ? null : (document.createElement('canvas') as unknown as RemapCanvas));
	if (!canvas) return null;
	canvas.width = width;
	canvas.height = height;
	return canvas;
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

/**
 * The renderer-free core of `~BLEND`: every pixel's RGB is lerped `ratio` of the way towards
 * `color` (0xRRGGBB), an exact per-pixel blend rather than `blendMatrix`'s runtime
 * approximation - this is what `applyTextureModifiers` bakes into the texture once. Alpha is
 * untouched; a fully transparent pixel is skipped entirely, matching `remapPixels`.
 *
 * @example
 * ```ts
 * import { blendPixels } from '@datamoc/mw_games/two-d/render';
 *
 * const pixels = new Uint8ClampedArray([0, 0, 0, 255]); // one opaque black pixel
 * const out = blendPixels(pixels, 0xff0000, 0.5);
 * console.log([...out]); // [128, 0, 0, 255] - half-way to red
 * ```
 */
export function blendPixels(pixels: Uint8ClampedArray, color: number, ratio: number): Uint8ClampedArray {
	const clamped = Math.min(1, Math.max(0, ratio));
	const r = (color >> 16) & 0xff;
	const g = (color >> 8) & 0xff;
	const b = color & 0xff;
	const out = new Uint8ClampedArray(pixels.length);
	for (let index = 0; index < pixels.length; index += 4) {
		const alpha = pixels[index + 3];
		out[index + 3] = alpha;
		if (alpha === 0) {
			out[index] = pixels[index];
			out[index + 1] = pixels[index + 1];
			out[index + 2] = pixels[index + 2];
			continue;
		}
		out[index] = pixels[index] * (1 - clamped) + r * clamped;
		out[index + 1] = pixels[index + 1] * (1 - clamped) + g * clamped;
		out[index + 2] = pixels[index + 2] * (1 - clamped) + b * clamped;
	}
	return out;
}

export interface RotatedPixels {
	readonly data: Uint8ClampedArray;
	readonly width: number;
	readonly height: number;
}

/**
 * How `rotatePixels` samples the source at an angle that is not a multiple of a quarter turn.
 *
 * `'nearest'` takes the closest single source pixel: the fast path, and the right one for pixel
 * art that is meant to stay crisp. `'linear'` blends the four pixels around the sample point, so
 * an edge comes out as an edge instead of a staircase - what a tile rotated by 30 or 60 degrees
 * onto a hex grid needs, and what art with soft or anti-aliased edges wants anyway. Either mode
 * samples premultiplied, so a transparent neighbour contributes coverage and never colour: a
 * straight RGBA blend would pull the (arbitrary) colour of transparent pixels into the edge and
 * fringe every cut-out sprite.
 */
export type RotateMode = 'nearest' | 'linear';

/**
 * The renderer-free core of `~ROTATE`: rotates the source pixels themselves by `degrees`
 * (clockwise) around their centre and expands the surface to fit the rotated bounds, rather
 * than turning a sprite's own transform - `applyImageModifiers`'s `sprite.rotation` leaves the
 * art unrotated and does not grow the surface, which is wrong for terrain and anything else
 * that has to keep tiling after the rotation. A destination pixel with no source under it is
 * fully transparent, and a sample point up to half a pixel outside the source still reads it,
 * so the edge of the rotated art ends where the art does.
 *
 * `'nearest'` is the default and stays exact at multiples of 90 degrees, which round-trip
 * pixel-for-pixel; `'linear'` costs four reads and a premultiplied blend per destination pixel
 * and is what keeps a non-square angle readable. Both modes are bake-time work - the rotation
 * happens once, when the texture is built - so the choice is a load-time one, not a frame-time
 * one, and a game can afford `'linear'` wherever the art is not meant to look pixel-blocky.
 *
 * @example
 * ```ts
 * import { rotatePixels } from '@datamoc/mw_games/two-d/render';
 *
 * const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // 2x1: red, green
 * const rotated = rotatePixels(pixels, 2, 1, 90);
 * console.log(rotated.width, rotated.height); // 1, 2 - the surface expanded to fit
 * const smooth = rotatePixels(pixels, 2, 1, 60, 'linear'); // the same, with an interpolated edge
 * ```
 */
export function rotatePixels(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	degrees: number,
	mode: RotateMode = 'nearest',
): RotatedPixels {
	const radians = (degrees * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);

	const halfW = width / 2;
	const halfH = height / 2;
	let maxX = 0;
	let maxY = 0;
	for (const [x, y] of [
		[-halfW, -halfH],
		[halfW, -halfH],
		[halfW, halfH],
		[-halfW, halfH],
	]) {
		maxX = Math.max(maxX, Math.abs(x * cos - y * sin));
		maxY = Math.max(maxY, Math.abs(x * sin + y * cos));
	}
	const outWidth = Math.max(1, Math.round(maxX * 2));
	const outHeight = Math.max(1, Math.round(maxY * 2));
	const out = new Uint8ClampedArray(outWidth * outHeight * 4);

	const cx = width / 2 - 0.5;
	const cy = height / 2 - 0.5;
	const ocx = outWidth / 2 - 0.5;
	const ocy = outHeight / 2 - 0.5;

	//a quarter turn lands every sample of every destination pixel on a source pixel's centre, so
	//'linear' has nothing to blend there and takes the integer path with it
	const interpolate = mode === 'linear' && degrees % 90 !== 0;

	for (let oy = 0; oy < outHeight; oy += 1) {
		for (let ox = 0; ox < outWidth; ox += 1) {
			const dx = ox - ocx;
			const dy = oy - ocy;
			//inverse rotation: where in the source does this destination pixel come from
			const sx = dx * cos + dy * sin + cx;
			const sy = -dx * sin + dy * cos + cy;
			const outIndex = (oy * outWidth + ox) * 4;

			if (!interpolate) {
				const px = Math.round(sx);
				const py = Math.round(sy);
				if (px < 0 || px >= width || py < 0 || py >= height) continue;
				const inIndex = (py * width + px) * 4;
				out[outIndex] = pixels[inIndex];
				out[outIndex + 1] = pixels[inIndex + 1];
				out[outIndex + 2] = pixels[inIndex + 2];
				out[outIndex + 3] = pixels[inIndex + 3];
				continue;
			}

			sampleLinear(pixels, width, height, sx, sy, out, outIndex);
		}
	}

	return { data: out, width: outWidth, height: outHeight };
}

/**
 * One destination pixel of a `'linear'` rotation: the four source pixels around `sx, sy`,
 * weighted by distance, premultiplied by alpha and divided back out at the end. Taps are clamped
 * to the source, so the border pixel extends outwards by the half pixel a sample can sit beyond
 * it; a sample with no overlap with the source at all leaves the destination transparent, which
 * is what keeps the rotated surface's corners empty rather than smeared.
 */
function sampleLinear(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
	sx: number,
	sy: number,
	out: Uint8ClampedArray,
	outIndex: number,
): void {
	if (sx < -0.5 || sy < -0.5 || sx > width - 0.5 || sy > height - 0.5) return;

	const x0 = Math.floor(sx);
	const y0 = Math.floor(sy);
	const fx = sx - x0;
	const fy = sy - y0;

	let alpha = 0;
	let red = 0;
	let green = 0;
	let blue = 0;
	for (let dy = 0; dy <= 1; dy += 1) {
		for (let dx = 0; dx <= 1; dx += 1) {
			const weight = (dx === 0 ? 1 - fx : fx) * (dy === 0 ? 1 - fy : fy);
			if (weight === 0) continue;
			const px = clamp(x0 + dx, 0, width - 1);
			const py = clamp(y0 + dy, 0, height - 1);
			const inIndex = (py * width + px) * 4;
			const sourceAlpha = pixels[inIndex + 3];
			alpha += sourceAlpha * weight;
			red += pixels[inIndex] * sourceAlpha * weight;
			green += pixels[inIndex + 1] * sourceAlpha * weight;
			blue += pixels[inIndex + 2] * sourceAlpha * weight;
		}
	}
	if (alpha <= 0) return;

	out[outIndex] = red / alpha;
	out[outIndex + 1] = green / alpha;
	out[outIndex + 2] = blue / alpha;
	out[outIndex + 3] = alpha;
}
