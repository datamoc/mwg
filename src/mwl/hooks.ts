import type { MwlCompiledGame, MwlCompiledNode } from './compiler.ts';
import type { MwlDiagnostic, MwlLocation } from './grammar.ts';
import type { MwlValue } from './runtime.ts';

/**
 * The hook boundary described in the MWG architecture documentation. Hooks are the only
 * place JavaScript appears in MWL content. They are referenced by
 * `type:name`, resolved by the tooling, and bundled ahead of time; the runtime
 * never evaluates JavaScript from content.
 */
export type HookType = 'predicate' | 'modifier' | 'generator' | 'command' | 'ai' | 'migration';

/**
 * The hook kinds MWL content may reference, in the order the documentation lists them.
 *
 * @example
 * ```ts
 * import { hookTypes } from '@datamoc/mw_games/mwl';
 *
 * console.log(hookTypes.includes('predicate')); // true
 * ```
 */
export const hookTypes: readonly HookType[] = ['predicate', 'modifier', 'generator', 'command', 'ai', 'migration'];

/** What a hook may read: a snapshot of the world, never engine internals. */
export interface HookWorld {
	readonly variables: Readonly<Record<string, MwlValue>>;
	readonly units: Readonly<
		Record<
			string,
			{
				readonly hp: number;
				readonly x: number;
				readonly y: number;
				readonly alive: boolean;
				readonly type?: string;
				/** the id `[side]` declared, the same key `world.sides` and `world.gold` use */
				readonly side?: string;
			}
		>
	>;
	readonly sides: Readonly<Record<string, { readonly gold: number; readonly income: number }>>;
	readonly turn: number;
}

/** What a hook may ask the engine to do. This is the whole command surface. */
export interface Emit {
	move(unit: string, x: number, y: number): void;
	attack(attacker: string, defender: string, weapon?: string): void;
	spawn(type: string, side: string, x: number, y: number): void;
	kill(unit: string): void;
	gold(side: string, delta: number): void;
	setVariable(name: string, value: MwlValue): void;
	message(speaker: string, text: string): void;
	endTurn(): void;
	win(side: string): void;
	lose(side: string): void;
}

export type HookContext = Readonly<Record<string, string>>;
export type PredicateHook = (world: HookWorld, context: HookContext) => boolean;
export type ModifierHook = (value: number, world: HookWorld, context: HookContext) => number;
export type GeneratorHook = (world: HookWorld, context: HookContext) => unknown;
export type CommandHook = (world: HookWorld, emit: Emit, context: HookContext) => void;
export type AiHook = (world: HookWorld, emit: Emit, context: HookContext) => void;
export type MigrationHook = (saved: unknown, context: HookContext) => unknown;

export interface HookTypeMap {
	predicate: PredicateHook;
	modifier: ModifierHook;
	generator: GeneratorHook;
	command: CommandHook;
	ai: AiHook;
	migration: MigrationHook;
}

export interface HookReference {
	readonly type: HookType;
	readonly name: string;
	readonly location?: MwlLocation;
}

/**
 * Parse a `type:name` hook reference, or null when it does not match.
 *
 * @example
 * ```ts
 * import { parseHookReference } from '@datamoc/mw_games/mwl';
 *
 * console.log(parseHookReference('predicate:holds')); // { type: 'predicate', name: 'holds' }
 * console.log(parseHookReference('not-a-reference')); // null
 * ```
 */
export function parseHookReference(value: string): { type: HookType; name: string } | null {
	const separator = value.indexOf(':');
	if (separator <= 0) return null;
	const type = value.slice(0, separator) as HookType;
	const name = value.slice(separator + 1).trim();
	if (!hookTypes.includes(type) || !name) return null;
	return { type, name };
}

/** Attributes whose value is a hook reference. */
const hookAttributes = new Set(['hook', 'migration']);

/**
 * Every hook a compiled game references, deduplicated by `type:name` and
 * ordered so the output is stable.
 *
 * @example
 * ```ts
 * import { collectHookReferences, type MwlCompiledGame } from '@datamoc/mw_games/mwl';
 *
 * declare const game: MwlCompiledGame;
 * console.log(collectHookReferences(game).map((reference) => `${reference.type}:${reference.name}`));
 * ```
 */
export function collectHookReferences(game: MwlCompiledGame): HookReference[] {
	const found = new Map<string, HookReference>();
	const visit = (node: MwlCompiledNode): void => {
		for (const [key, value] of Object.entries(node.attributes)) {
			if (hookAttributes.has(key)) add(value, node.location);
			// A `[hook]` call carries its reference in `name`.
			if (node.tag === 'hook' && key === 'name') add(value, node.location);
		}
		node.children.forEach(visit);
	};
	const add = (value: string, location?: MwlLocation): void => {
		const reference = parseHookReference(value);
		if (!reference) return;
		const id = `${reference.type}:${reference.name}`;
		if (!found.has(id)) found.set(id, { ...reference, location });
	};
	game.roots.forEach(visit);
	return [...found.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

/**
 * Report a reference that has no implementation, using the same diagnostic
 * shape as the schema validator. `available` holds `type:name` keys.
 *
 * @example
 * ```ts
 * import { parseHookReference, validateHookReferences } from '@datamoc/mw_games/mwl';
 *
 * const reference = parseHookReference('predicate:holds');
 * console.log(validateHookReferences(reference ? [reference] : [], ['predicate:holds'])); // []
 * ```
 */
export function validateHookReferences(
	references: readonly HookReference[],
	available: Iterable<string>,
): MwlDiagnostic[] {
	const implemented = new Set(available);
	const diagnostics: MwlDiagnostic[] = [];
	for (const reference of references) {
		const id = `${reference.type}:${reference.name}`;
		if (!implemented.has(id))
			diagnostics.push({
				code: 'MWL_HOOK',
				message: `hook ${id} is not implemented`,
				location: reference.location ?? { file: '<hook>', line: 0, column: 0 },
			});
	}
	return diagnostics;
}

/**
 * Emit the declaration a hooks module must satisfy, so a project typechecks its
 * hooks against the exact references its content uses.
 *
 * @example
 * ```ts
 * import { emitHooksDeclaration, parseHookReference } from '@datamoc/mw_games/mwl';
 *
 * const reference = parseHookReference('predicate:holds');
 * console.log(emitHooksDeclaration(reference ? [reference] : []).includes("'predicate:holds'"));
 * ```
 */
export function emitHooksDeclaration(references: readonly HookReference[]): string {
	const lines: string[] = [];
	lines.push('// Generated by mwl - do not edit.');
	lines.push(
		"import type { AiHook, CommandHook, GeneratorHook, MigrationHook, ModifierHook, PredicateHook } from '@datamoc/mw_games/mwl';",
	);
	lines.push('');
	lines.push('export interface MwlHooks {');
	for (const reference of references) {
		const hookType = `${reference.type[0].toUpperCase()}${reference.type.slice(1)}Hook`;
		lines.push(`\t'${reference.type}:${reference.name}': ${hookType};`);
	}
	lines.push('}');
	lines.push('');
	return lines.join('\n');
}
