/**
 * Numeric leases for values a plain-data command cannot carry.
 *
 * A simulation command must survive `structuredClone`, so anything live (a
 * callback, an externally-owned RNG stream, a world-query closure) travels as
 * a numeric id resolved inside the rule. This is the one-line container for
 * that recipe: `put` a value, carry the id in the command, `get` it in the
 * rule, and `drop` it when done. `with` scopes the lease so the `drop` runs
 * even when the rule throws.
 *
 * @example
 * ```ts
 * import { createHandles } from '@datamoc/mw_games/core';
 *
 * const handles = createHandles<() => number>();
 * const result = handles.with(() => 7, (id) => {
 *   const fn = handles.get(id);
 *   return fn();
 * });
 * console.log(result); // 7
 * ```
 */
export interface Handles<T> {
	/** the number of values currently leased */
	readonly size: number;
	/** stores `value` and returns its numeric lease id */
	put(value: T): number;
	/** resolves a leased id; throws when the id is unknown or was dropped */
	get(id: number): T;
	/** ends a lease; unknown ids are ignored */
	drop(id: number): void;
	/** ends every lease */
	clear(): void;
	/**
	 * Leases `value` for `body`, dropping the id afterwards even when `body`
	 * throws. The id is only valid inside `body`.
	 */
	with<R>(value: T, body: (id: number) => R): R;
}

/** Creates an empty numeric-lease table; ids start at 1 and are never reused. */
export function createHandles<T>(): Handles<T> {
	let next = 1;
	const values = new Map<number, T>();
	return {
		get size(): number {
			return values.size;
		},
		put(value: T): number {
			const id = next++;
			values.set(id, value);
			return id;
		},
		get(id: number): T {
			const value = values.get(id);
			if (value === undefined) throw new Error(`unknown handle ${id}`);
			return value;
		},
		drop(id: number): void {
			values.delete(id);
		},
		clear(): void {
			values.clear();
		},
		with<R>(value: T, body: (id: number) => R): R {
			const id = next++;
			values.set(id, value);
			try {
				return body(id);
			} finally {
				values.delete(id);
			}
		},
	};
}
