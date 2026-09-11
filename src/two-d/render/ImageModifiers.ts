import { ColorMatrixFilter, Rectangle, Sprite, Texture } from 'pixi.js';

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
		sprite.filters = [filter];
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
