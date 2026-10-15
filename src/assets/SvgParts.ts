import { Assets } from 'pixi.js';
import type { Texture2D } from '../two-d/render/Types2D.ts';
import { readSvgSource } from './SvgSource.ts';
import { splitSvgGroups, svgDataUri } from './svg.ts';

const aliases = new WeakMap<Texture2D, string>();

export interface SvgPartsOptions {
	/** Rasterization multiple; logical texture dimensions remain in SVG units. */
	resolution?: number;
	/** Only these top-level named groups; unknown names are errors. */
	groups?: readonly string[];
}

/**
 * Slice named SVG groups into cached textures, without game-owned renderer calls.
 * Accepts inert SVG source or an asset path (compiled data URIs work under file://).
 * Shared definitions, styles, group attributes and the full viewBox are retained.
 * The cache belongs to Pixi Assets: consumers borrow textures and release them with
 * releaseSvgParts once no sprite uses them. Different resolutions have separate entries.
 * @example
 * ```ts
 * import { loadSvgParts, releaseSvgParts } from '@datamoc/mw_games/assets';
 * const parts = await loadSvgParts('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><g id="body"><rect width="20" height="10"/></g></svg>', { resolution: 2 });
 * console.log(parts.body.width);
 * await releaseSvgParts(parts);
 * ```
 */
export async function loadSvgParts(
	source: string,
	options: SvgPartsOptions = {},
): Promise<Readonly<Record<string, Texture2D>>> {
	const resolution = options.resolution ?? 1;
	if (!Number.isFinite(resolution) || resolution <= 0) throw new Error('SVG parts need a positive finite resolution');
	const svg = await readSvgSource(source);
	const groups = splitSvgGroups(svg);
	const names = options.groups ?? Object.keys(groups);
	for (const name of names) if (!Object.hasOwn(groups, name)) throw new Error(`SVG parts unknown group ${name}`);
	const parts: Record<string, Texture2D> = Object.create(null);
	for (const name of names) {
		const src = svgDataUri(groups[name].replace('</svg>', `<!-- mwg-resolution:${resolution} --></svg>`));
		const alias = `mwg-svg-part:${resolution}:${src}`;
		parts[name] = await Assets.load<Texture2D>({ alias, src, format: 'svg', data: { resolution } });
		aliases.set(parts[name], alias);
	}
	return Object.freeze(parts);
}

/** Release borrowed SVG part textures after their sprites have been destroyed.
 * @example
 * ```ts
 * import { releaseSvgParts } from '@datamoc/mw_games/assets';
 * await releaseSvgParts({});
 * ```
 */
export async function releaseSvgParts(parts: Readonly<Record<string, Texture2D>>): Promise<void> {
	for (const texture of new Set(Object.values(parts))) {
		const alias = aliases.get(texture);
		if (alias) {
			await Assets.unload(alias);
			aliases.delete(texture);
		}
	}
}
