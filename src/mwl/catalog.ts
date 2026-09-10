import type { MwlCompiledGame, MwlCompiledNode } from './compiler.ts';
import type { MwlDiagnostic, MwlLocation, MwlNode } from './grammar.ts';
import { collectHookReferences, parseHookReference } from './hooks.ts';

export interface MwlValidationOptions {
	/** Slots are game-defined. Supplying them enables unknown-slot diagnostics. */
	readonly slots?: readonly string[];
	/** Hook ids exported by the game's adapter. */
	readonly hooks?: readonly string[];
}

/** Semantic checks shared by all games. Domain rules remain in the game adapter. */
export function validateCatalog(game: MwlCompiledGame, options: MwlValidationOptions = {}): MwlDiagnostic[] {
	const diagnostics: MwlDiagnostic[] = [];
	const ids = new Map<string, MwlCompiledNode>();
	const nodes = flatten(game.roots);
	for (const node of nodes) {
		const id = node.attributes.id;
		if (id) {
			const key = `${node.tag}:${id}`;
			const previous = ids.get(key);
			if (previous) diagnostics.push(diagnostic('MWL_DUPLICATE_ID', `duplicate ${node.tag} id "${id}"`, node.location ?? previous.location));
			else ids.set(key, node);
		}
		if (node.tag === 'item' && options.slots && node.attributes.slot && !options.slots.includes(node.attributes.slot))
			diagnostics.push(diagnostic('MWL_UNKNOWN_SLOT', `unknown equipment slot "${node.attributes.slot}"`, node.location));
		if (node.tag === 'effect') {
			const operations = ['add', 'sub', 'multiply', 'divide', 'set', 'increase', 'increase_total', 'increase_damage'].filter(
				(key) => node.attributes[key] !== undefined,
			);
			if (!node.attributes.apply_to || operations.length !== 1)
				diagnostics.push(diagnostic('MWL_INCOMPLETE_EFFECT', 'an effect needs apply_to and exactly one operation', node.location));
		}
	}
	const references = collectHookReferences(game);
	const knownHooks = new Set(options.hooks ?? []);
	for (const node of nodes) {
		const raw = node.attributes.hook ?? (node.tag === 'hook' ? node.attributes.name : undefined);
		if (raw !== undefined && !parseHookReference(raw)) diagnostics.push(diagnostic('MWL_INVALID_HOOK', `invalid hook reference "${raw}"`, node.location));
	}
	if (options.hooks) for (const reference of references) if (!knownHooks.has(`${reference.type}:${reference.name}`))
		diagnostics.push(diagnostic('MWL_UNKNOWN_HOOK', `hook ${reference.type}:${reference.name} is not declared by the game`, reference.location));
	return diagnostics;
}

function flatten(roots: readonly MwlCompiledNode[]): MwlCompiledNode[] {
	const result: MwlCompiledNode[] = [];
	const visit = (node: MwlCompiledNode): void => { result.push(node); node.children.forEach(visit); };
	roots.forEach(visit);
	return result;
}
function diagnostic(code: string, message: string, location: MwlLocation | undefined): MwlDiagnostic {
	return { code, message, location: location ?? { file: '<mwl>', line: 1, column: 1 } };
}

/** Convenience for adapters that keep parsed nodes rather than compiled games. */
export function validateCatalogNodes(nodes: readonly MwlNode[], options: MwlValidationOptions = {}): MwlDiagnostic[] {
	const fake = { schema: '0.1', roots: nodes as readonly MwlCompiledNode[], assets: [], messages: [] };
	return validateCatalog(fake, options);
}
