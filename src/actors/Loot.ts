import * as Random from '../core/Random.ts';

/**
 * A weighted drop table for what a monster leaves behind - the same shape as
 * `mwg/world`'s `EncounterTable`, deliberately: both are "roll whether anything happens at
 * all, then weight-pick which," just naming an item instead of an encounter value. A corpse
 * as a lootable world object needs no code of its own beyond this - it is an `Inventory`
 * placed at the monster's last position, exactly like any other dropped item already is.
 */
export interface LootEntry {
	id: string;
	weight: number;
	/** how many of `id` this entry grants; defaults to 1 */
	quantity?: number;
}

export interface LootTable {
	entries: readonly LootEntry[];

	/** probability that this table drops anything at all, 0 to 1; defaults to 1 (always) */
	chance?: number;
}

/**
 * @returns what dropped, or null when the roll misses or the table is empty
 *
 * @example
 * ```ts
 * import { rollLoot, type LootTable } from '@datamoc/mw_games/actors';
 *
 * const ratLoot: LootTable = {
 *   chance: 0.5,
 *   entries: [{ id: 'gold', weight: 3, quantity: 5 }, { id: 'cheese', weight: 1 }],
 * };
 *
 * const drop = rollLoot(ratLoot); // { id: 'gold', quantity: 5 }, or null, most of the time
 * ```
 */
export function rollLoot(table: LootTable): { id: string; quantity: number } | null {
	if (table.entries.length === 0) return null;
	if (!Random.chance(table.chance ?? 1)) return null;

	const index = Random.weighted(table.entries.map((entry) => entry.weight));
	if (index === null) return null;

	const entry = table.entries[index];
	return { id: entry.id, quantity: entry.quantity ?? 1 };
}
