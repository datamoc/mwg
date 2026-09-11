/**
 * Out-of-sync detection for lockstep play: a deterministic checksum of JSON-serialisable state,
 * and a guard that compares the checksums peers compute for the same tick. `LockstepClient` moves
 * inputs between peers; this is how a game notices that the same inputs produced different state
 * on two of them, which lockstep cannot otherwise see - it never compares state, only inputs.
 *
 * A checksum is not security: it is a fast, stable hash that catches a divergence, not one that
 * resists an attacker. Its one real requirement is determinism across machines, so object keys are
 * sorted and the encoding is fixed rather than left to `JSON.stringify`'s engine-defined key order.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * A stable string encoding of a JSON-serialisable value, with object keys sorted so two
 * structurally equal values always encode identically regardless of insertion order. Values JSON
 * itself has no representation for (`undefined`, functions, symbols, `NaN`, infinities) follow
 * JSON's own rules: an object entry with one is omitted, an array element becomes `null`.
 */
function canonical(value: unknown, inArray = false): string {
	if (value === null || value === undefined) return 'null';
	switch (typeof value) {
		case 'boolean':
			return value ? 'true' : 'false';
		case 'number':
			return Number.isFinite(value) ? String(value) : 'null';
		case 'string':
			return JSON.stringify(value);
		case 'bigint':
			return JSON.stringify(value.toString());
		case 'function':
		case 'symbol':
			return inArray ? 'null' : 'undefined';
	}

	if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry, true)).join(',')}]`;

	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, entry]) => entry !== undefined && typeof entry !== 'function' && typeof entry !== 'symbol')
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
	return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

/**
 * A 32-bit FNV-1a checksum of a state value, stable across machines and across property order.
 *
 * @example
 * ```ts
 * import { stateChecksum } from '@datamoc/mw_games/core';
 *
 * // same state, whatever order the keys happen to be in
 * stateChecksum({ hp: 7, x: 2 }) === stateChecksum({ x: 2, hp: 7 }); // true
 * stateChecksum({ hp: 7 }) === stateChecksum({ hp: 6 }); // false
 * ```
 */
export function stateChecksum(value: unknown): number {
	const text = canonical(value);
	let hash = FNV_OFFSET;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME) >>> 0;
	}
	return hash >>> 0;
}

/**
 * Compares the checksum peers compute for each tick. The first checksum seen for a tick is taken
 * as the reference; a later observation of the same tick that disagrees marks the run divergent and
 * is remembered as the first such tick, so a game can report exactly where the two peers parted.
 *
 * @example
 * ```ts
 * import { SyncGuard, stateChecksum } from '@datamoc/mw_games/core';
 *
 * const guard = new SyncGuard();
 * guard.observe(12, stateChecksum(localState)); // true
 * guard.observe(12, stateChecksum(remoteState)); // false if the two peers disagree
 * if (guard.divergent) console.log('desync at tick', guard.atTick);
 * ```
 */
export class SyncGuard {
	private readonly reference = new Map<number, number>();
	private desyncTick: number | null = null;

	/**
	 * Records `checksum` for `tick`; true when it matches the tick's reference (or is the first
	 * one), false on the first disagreement, which is then remembered.
	 */
	observe(tick: number, checksum: number): boolean {
		const expected = this.reference.get(tick);
		if (expected === undefined) {
			this.reference.set(tick, checksum);
			return true;
		}
		if (expected === checksum) return true;
		if (this.desyncTick === null) this.desyncTick = tick;
		return false;
	}

	/** true once any tick has disagreed */
	get divergent(): boolean {
		return this.desyncTick !== null;
	}

	/** the first tick that disagreed, or null while the run is in sync */
	get atTick(): number | null {
		return this.desyncTick;
	}

	/** forgets every observation, for a new run */
	reset(): void {
		this.reference.clear();
		this.desyncTick = null;
	}
}
