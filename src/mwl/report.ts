import type { MwlCompiledGame } from './compiler.ts';
import { schema01 } from './schema.ts';
import { flattenNodes } from './utils.ts';

export interface MwlContentReport {
	readonly tags: Readonly<Record<string, number>>;
	readonly opaqueTags: readonly string[];
	readonly danglingReferences: readonly string[];
}

/** Summarise a compiled catalog for parity checks and CI output. */
export function contentReport(game: MwlCompiledGame): MwlContentReport {
	const nodes = flattenNodes(game.roots);
	const tags: Record<string, number> = {};
	const ids = new Set<string>();
	for (const node of nodes) {
		tags[node.tag] = (tags[node.tag] ?? 0) + 1;
		if (node.attributes.id) ids.add(node.attributes.id);
	}
	const knownTags = new Set(Object.keys(schema01));
	const opaqueTags = nodes
		.filter((node) => !knownTags.has(node.tag))
		.map((node) => node.tag)
		.filter((tag, index, all) => all.indexOf(tag) === index)
		.sort();
	const references = new Set<string>();
	for (const node of nodes) {
		for (const [key, value] of Object.entries(node.attributes)) {
			if (/^(?:ability|item|terrain|unit|unit_type|weapon)(?:_id)?$/.test(key))
				for (const reference of value
					.split(',')
					.map((part) => part.trim())
					.filter(Boolean))
					references.add(reference);
		}
	}
	return {
		tags: Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))),
		opaqueTags,
		danglingReferences: [...references].filter((reference) => !ids.has(reference)).sort(),
	};
}
