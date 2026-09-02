import * as Random from '../core/Random.ts';

/**
 * A weighted encounter table, checked once per step - what decides that walking through
 * tall grass sometimes meets a wild creature and usually does not, and that a rarer species
 * turns up less often than a common one.
 *
 * Built on `mwg/core`'s `Random.chance` and `Random.weighted` rather than its own dice, so
 * an encounter roll is seeded and reproducible the same way everything else in a run is.
 */
export interface EncounterEntry<T> {
	value: T;
	weight: number;
}

export interface EncounterTable<T> {
	entries: readonly EncounterEntry<T>[];

	/** probability of any encounter at all, per step, 0 to 1 */
	rate: number;
}

/** @returns the encounter for this step, or null when the roll misses or the table is empty */
export function rollEncounter<T>(table: EncounterTable<T>): T | null {
	if (table.entries.length === 0 || !Random.chance(table.rate)) return null;

	const index = Random.weighted(table.entries.map((entry) => entry.weight));
	return index === -1 ? null : table.entries[index].value;
}
