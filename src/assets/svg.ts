/**
 * SVG as inbound data (roadmap 398): sanitization, named scale variants, and group-split
 * parts.
 *
 * An SVG is inbound data that can carry active content - `<script>`, event-handler
 * attributes, `foreignObject` - the same way a save slot or a replay file is inbound data.
 * `sanitizeSvg` refuses what it cannot prove inert, by name, conservatively: anything the
 * scan does not recognize as inert is an error, never a silent pass, and the posture is the
 * same one the saves and replay rules carry rather than a trust in the `file://` CSP to make
 * the question moot.
 *
 * `svgScaleVariants` rasterizes one source once per named scale (1x, 2x, 3x), so a game
 * picks the variant by device the way it picks an asset path, instead of every call site
 * re-deciding a resolution multiplier. `splitSvgGroups` loads an SVG authored with named
 * `<g>` groups as one standalone SVG per group - the natural authoring form for a skeletal
 * puppet: one drawing, one source of truth, split at load.
 *
 * All three are string processing with no renderer: they run headless, and the compiled
 * `data:` URI form is what they consume and produce.
 *
 * @example
 * ```ts
 * import { sanitizeSvg, splitSvgGroups } from '@datamoc/mw_games/assets';
 *
 * const puppet = '<svg><g id=\"arm\"><rect/></g></svg>';
 * const parts = splitSvgGroups(sanitizeSvg(puppet));
 * console.log(Object.keys(parts)); // ['arm']
 * ```
 */

/** active shapes and attributes a name-based scan refuses, by name, conservatively */
const REFUSED_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
	{ name: '<script>', pattern: /<script[\s/>]/i },
	{ name: '<foreignObject>', pattern: /<foreignobject[\s/>]/i },
	{ name: '<iframe>', pattern: /<iframe[\s/>]/i },
	{ name: '<embed>', pattern: /<embed[\s/>]/i },
	{ name: '<object>', pattern: /<object[\s/>]/i },
	{ name: 'an event-handler attribute', pattern: /\son[a-z]+\s*=/i },
	{ name: 'a javascript: URL', pattern: /javascript\s*:/i },
	{ name: 'a data: URL of an active type', pattern: /data:(?:text\/html|application\/xml|image\/svg\+xml)/i },
];

/**
 * Refuse an SVG that is not proven inert, by name. The scan is deliberately conservative:
 * it names what it refuses, and anything it cannot read as inert is an error rather than a
 * silent pass. The source is returned unchanged once proven inert - sanitization here is a
 * gate, not a rewrite; what a game authors is what a game gets.
 */
export function sanitizeSvg(source: string): string {
	for (const { name, pattern } of REFUSED_PATTERNS)
		if (pattern.test(source)) throw new Error(`SVG refused: contains ${name}`);
	return source;
}

export interface ScaleVariant {
	/** the name a game picks the variant by, the way it picks an asset path */
	name: string;
	/** the rasterization resolution multiple, so a device picks its sharpness at load */
	resolution: number;
}

export interface SvgVariant {
	name: string;
	/** a `data:image/svg\+xml` URI ready for the asset loader */
	src: string;
	/** the loader's own resolution hint, carried from the named scale */
	resolution: number;
}

/**
 * The `data:image/svg+xml` form of a source, ready for the loader.
 *
 * @example
 * ```ts
 * import { svgDataUri } from '@datamoc/mw_games/assets';
 *
 * console.log(svgDataUri('<svg/>').startsWith('data:image/svg+xml,')); // true
 * ```
 */
export function svgDataUri(source: string): string {
	return `data:image/svg\+xml,${encodeURIComponent(source)}`;
}

/**
 * One source, one variant per named scale. Each variant is the same proven-inert source at
 * its own resolution multiple, so the loader rasterizes each scale once and a game asks for
 * the variant by name instead of re-deciding a multiplier at every call site.
 */
/**
 * One source, one variant per named scale.
 *
 * @example
 * ```ts
 * import { svgScaleVariants } from '@datamoc/mw_games/assets';
 *
 * const [sharp] = svgScaleVariants('<svg/>', [{ name: '3x', resolution: 3 }]);
 * console.log(sharp.resolution); // 3
 * ```
 */
export function svgScaleVariants(source: string, scales: readonly ScaleVariant[]): SvgVariant[] {
	const inert = sanitizeSvg(source);
	if (scales.length === 0) throw new Error('SVG scale variants need at least one named scale');
	const seen = new Set<string>();
	for (const scale of scales) {
		if (!scale.name) throw new Error('an SVG scale variant needs a name');
		if (!Number.isFinite(scale.resolution) || scale.resolution <= 0)
			throw new Error(`SVG scale variant ${scale.name} needs a positive resolution`);
		if (seen.has(scale.name)) throw new Error(`duplicate SVG scale variant ${scale.name}`);
		seen.add(scale.name);
	}
	const src = svgDataUri(inert);
	return scales.map((scale) => ({ name: scale.name, src, resolution: scale.resolution }));
}

/**
 * An SVG authored with named `<g id="...">` groups loads as one standalone SVG per group -
 * the natural authoring form for a skeletal puppet: one drawing, one source of truth for
 * palette and style, split at load. Each part keeps the original `<svg>` root attributes
 * (viewBox included) and carries exactly one group's children.
 *
 * Refused by name: an empty id, a duplicate id, and any group the scan cannot balance.
 */
export function splitSvgGroups(source: string): Record<string, string> {
	const inert = sanitizeSvg(source);
	const root = /^([\s\S]*?)<svg([^>]*)>/i.exec(inert);
	const close = inert.lastIndexOf('</svg>');
	if (!root || close < 0) throw new Error('SVG group split needs an <svg> root');
	const rawBody = inert.slice(root[0].length, close);
	const shared = [...rawBody.matchAll(/<(defs|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)].map((match) => match[0]).join('');
	const body = rawBody.replace(/<(defs|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
	const parts: Record<string, string> = Object.create(null);
	let position = 0;
	while (position < body.length) {
		const open = /<g\b([^>]*?)(\/?)>/i.exec(body.slice(position));
		if (!open) break;
		const attributes = open[1];
		const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
		const contentStart = position + open.index! + open[0].length;
		if (open[2] === '/') {
			//a self-closing group is an empty part, not a walk that never closes
			if (!id) throw new Error('SVG group split refuses a group with no id');
			if (id in parts) throw new Error(`SVG group split refuses a duplicate id ${id}`);
			parts[id] = `${root[0]}${shared}${open[0]}</svg>`;
			position = contentStart;
			continue;
		}
		//walk forward balancing nested <g> opens against their closes
		let depth = 1;
		let cursor = contentStart;
		let closer = '';
		while (depth > 0 && cursor < body.length) {
			const next = body.slice(cursor).match(/<g\b[^>]*>|<\/g\s*>/i);
			if (!next) throw new Error(`SVG group ${id ?? '<unnamed>'} never closes`);
			if (next[0]!.startsWith('</')) {
				depth--;
				if (depth === 0) closer = next[0]!;
			} else if (!/\/\s*>$/.test(next[0]!)) depth++;
			cursor += next.index! + next[0].length;
		}
		if (depth !== 0) throw new Error(`SVG group ${id ?? '<unnamed>'} never closes`);
		const content = body.slice(contentStart, cursor - closer.length);
		position = cursor;
		if (!id) throw new Error('SVG group split refuses a group with no id');
		if (id in parts) throw new Error(`SVG group split refuses a duplicate id ${id}`);
		parts[id] = `${root[0]}${shared}${open[0]}${content}</g></svg>`;
	}
	if (Object.keys(parts).length === 0) throw new Error('SVG group split found no named groups');
	return parts;
}
