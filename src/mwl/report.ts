import { compileSources, type MwlCompileOptions, type MwlCompiledGame, type MwlSourceFile } from './compiler.ts';
import { schema01 } from './schema.ts';
import { flattenNodes } from './utils.ts';

export interface MwlContentReport {
	readonly tags: Readonly<Record<string, number>>;
	readonly opaqueTags: readonly string[];
	readonly references: readonly string[];
	readonly danglingReferences: readonly string[];
}

export interface MwlContentDiagnostic {
	readonly severity: 'error' | 'warning';
	readonly code: 'compile' | 'dangling-reference' | 'opaque-tag';
	readonly message: string;
	readonly file?: string;
}

export interface MwlContentLoadReport {
	readonly game?: MwlCompiledGame;
	readonly resources: readonly string[];
	readonly dependencies: readonly string[];
	readonly ignored: readonly string[];
	readonly diagnostics: readonly MwlContentDiagnostic[];
}

/** Compile content and return a stable, machine-readable load report instead of throwing. */
export function loadContent(files: readonly MwlSourceFile[], options: MwlCompileOptions = {}): MwlContentLoadReport {
	try {
		const game = compileSources(files, options);
		const summary = contentReport(game);
		const diagnostics: MwlContentDiagnostic[] = [];
		for (const tag of summary.opaqueTags)
			diagnostics.push({ severity: 'warning', code: 'opaque-tag', message: `ignored opaque tag: ${tag}` });
		for (const reference of summary.danglingReferences)
			diagnostics.push({
				severity: 'error',
				code: 'dangling-reference',
				message: `dangling content reference: ${reference}`,
			});
		return {
			game,
			resources: [...game.assets],
			dependencies: [...summary.references],
			ignored: [...summary.opaqueTags],
			diagnostics,
		};
	} catch (error) {
		return {
			resources: [],
			dependencies: [],
			ignored: [],
			diagnostics: [{ severity: 'error', code: 'compile', message: String(error) }],
		};
	}
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
		references: [...references].sort(),
		danglingReferences: [...references].filter((reference) => !ids.has(reference)).sort(),
	};
}
