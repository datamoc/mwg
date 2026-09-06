import * as Random from '../core/Random.ts';

/**
 * A weighted regular-roster entry, optionally swappable into a named alternative variant.
 * `mwg` names none of `T` - a monster kind, an item id, anything a game's own roster holds.
 */
export interface RosterEntry<T> {
	value: T;

	/** an alternative this entry may swap into once placed in the roster */
	alternative?: { value: T; chance: number };
}

/** an extra entry that may or may not join the roster this roll, beyond the regular ones */
export interface RareEntry<T> {
	value: T;
	chance: number;

	/**
	 * false skips this entry's roll entirely without consuming RNG - an explicit *deferred*
	 * roll, distinct from one that rolled and lost (`'skipped'`), so a parity trace can tell
	 * "this depth never asks" from "this depth asked and the roll failed"
	 */
	enabled?: boolean;
}

export type RollOutcome = 'added' | 'skipped' | 'deferred' | 'swapped' | 'kept' | 'shuffled';

export interface RollTraceEntry {
	step: 'rare' | 'alternative' | 'shuffle';
	index: number;
	outcome: RollOutcome;
}

export interface ContentRollResult<T> {
	roster: T[];
	trace: RollTraceEntry[];
}

/**
 * Rolls a spawn/content roster: the regular entries, then whichever rare additions rolled in,
 * then a per-entry alternative-variant swap over the regular entries only, then (unless
 * disabled) a shuffle - the "add-rare, swap, shuffle" order a variant-spawn table commonly
 * needs. Every roll, including a disabled rare entry's explicit non-roll, is recorded in
 * `trace`, so two runs against the same seed can be diffed roll for roll rather than only by
 * final roster.
 *
 * @example
 * ```ts
 * import { rollRoster } from '@datamoc/mw_games/roguelike';
 *
 * const { roster, trace } = rollRoster(
 *   [{ value: 'rat' }, { value: 'rat', alternative: { value: 'albino rat', chance: 0.02 } }],
 *   [{ value: 'boss-rat', chance: 0.01 }] // a rare addition, on top of the regulars
 * );
 * ```
 */
export function rollRoster<T>(regular: readonly RosterEntry<T>[], rare: readonly RareEntry<T>[] = [], shuffleResult = true): ContentRollResult<T> {
	const trace: RollTraceEntry[] = [];
	const roster: T[] = regular.map((entry) => entry.value);

	rare.forEach((entry, index) => {
		if (entry.enabled === false) {
			trace.push({ step: 'rare', index, outcome: 'deferred' });
			return;
		}

		const rolled = Random.chance(entry.chance);
		trace.push({ step: 'rare', index, outcome: rolled ? 'added' : 'skipped' });
		if (rolled) roster.push(entry.value);
	});

	for (let i = 0; i < regular.length; i++) {
		const alternative = regular[i].alternative;
		if (!alternative) continue;

		const rolled = Random.chance(alternative.chance);
		trace.push({ step: 'alternative', index: i, outcome: rolled ? 'swapped' : 'kept' });
		if (rolled) roster[i] = alternative.value;
	}

	if (shuffleResult) {
		Random.shuffle(roster);
		trace.push({ step: 'shuffle', index: -1, outcome: 'shuffled' });
	}

	return { roster, trace };
}
