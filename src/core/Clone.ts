/**
 * Where `structuredClone` would fail inside `value`, as a readable path (`command.attacker.
 * reactions.rules[0].when`), or null when the whole value clones. A function, a symbol, a
 * `WeakMap`/`WeakSet`, a `Promise` or a DOM node all fail; a class instance on its own does
 * not (its own fields are copied and its prototype dropped), so the path points at the first
 * field that actually cannot be copied rather than at the object holding it.
 *
 * @example
 * ```ts
 * import { uncloneablePath } from '@datamoc/mw_games/core';
 *
 * uncloneablePath({ target: { id: 'king', onHit: () => {} } }, 'command'); // 'command.target.onHit'
 * uncloneablePath({ targetId: 'king' }, 'command'); // null
 * ```
 */
export function uncloneablePath(value: unknown, root = 'value'): string | null {
	return find(value, root, new Set());
}

function find(value: unknown, path: string, seen: Set<object>): string | null {
	if (typeof value === 'function' || typeof value === 'symbol') return path;
	if (value === null || typeof value !== 'object' || seen.has(value)) return null;
	seen.add(value);
	if (clones(value)) return null;
	const children: [string, unknown][] = [];
	if (value instanceof Map) {
		for (const [key, item] of value) children.push([`${path}.get(${JSON.stringify(key) ?? String(key)})`, item]);
	} else if (value instanceof Set) {
		for (const item of value) children.push([`${path}.item`, item]);
	} else if (Array.isArray(value)) {
		value.forEach((item, index) => children.push([`${path}[${index}]`, item]));
	} else {
		for (const [key, item] of Object.entries(value)) children.push([`${path}.${key}`, item]);
	}
	for (const [childPath, child] of children) {
		const found = find(child, childPath, seen);
		if (found) return found;
	}
	return path;
}

function clones(value: object): boolean {
	try {
		structuredClone(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * `structuredClone`, with a failure that names what could not be copied and where, instead of
 * the bare `DataCloneError` a journal or undo checkpoint would otherwise surface far from the
 * code that put a live object there.
 *
 * @example
 * ```ts
 * import { cloneData } from '@datamoc/mw_games/core';
 *
 * const checkpoint = cloneData({ turn: 3, hp: { king: 12 } }, 'state');
 * cloneData({ onHit: () => {} }, 'command'); // throws: command.onHit cannot be structured-cloned ...
 * ```
 */
export function cloneData<T>(value: T, label: string): T {
	try {
		return structuredClone(value);
	} catch (error) {
		const path = uncloneablePath(value, label) ?? label;
		throw new TypeError(
			`${path} cannot be structured-cloned (${error instanceof Error ? error.message : String(error)}). ` +
				'Journals, snapshots and undo checkpoints copy their contents with structuredClone, so they ' +
				'must hold plain data: refer to a live object (an actor, anything carrying callbacks such as ' +
				'a ReactionTable) by its id and resolve it inside the rule.',
			{ cause: error },
		);
	}
}
