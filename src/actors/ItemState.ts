import type { InventoryItem } from './Inventory.ts';
import { removeAffix } from './Affix.ts';

/**
 * The three item-shaped states `Inventory` only had fields for, not behaviour: identification,
 * an enchantment/upgrade level, and durability that wears down with use. Small, focused
 * functions over a plain `InventoryItem` - the same size of primitive `skillCheck` already is -
 * rather than a class, since none of the three need to remember anything beyond the item.
 *
 * @example
 * ```ts
 * import { identify, enchant, damageItem, repairItem } from '@datamoc/mw_games/actors';
 *
 * const sword = { id: 'sword', quantity: 1, durability: 30, maxDurability: 50 };
 *
 * identify(sword);
 * enchant(sword, 1); // now +1
 *
 * const broke = damageItem(sword, 40); // durability floors at 0
 * repairItem(sword, 10);
 * ```
 */

/** reveals an item's real nature - a potion's true effect, a ring's curse - once identified */
export function identify(item: InventoryItem): void {
	item.identified = true;
}

/** whether an upgrade leaves an item's affix as it is, or strips it */
export type AffixUpgradePolicy = 'keep' | 'remove';

/**
 * Raises (or, given a negative delta, lowers) an item's enchantment/upgrade level.
 *
 * @param affixPolicy `'keep'` (the default, and the only behaviour before this option
 * existed) leaves whatever affix the item carries untouched; `'remove'` strips it - some
 * upgrade paths only preserve an enchantment past a certain rarity tier, a game's own rule
 * this only ever applies when asked to
 */
export function enchant(item: InventoryItem, delta: number, affixPolicy: AffixUpgradePolicy = 'keep'): number {
	if (!Number.isFinite(delta)) return item.level ?? 0;
	item.level = (item.level ?? 0) + delta;
	if (affixPolicy === 'remove') removeAffix(item);
	return item.level;
}

/**
 * Wears an item down by `amount`. An item with no `maxDurability` set cannot wear out at all
 * and this is a no-op - durability is opt-in per item, not a hidden default every item pays for.
 *
 * @returns true once the item's durability has reached zero and it should break
 */
export function damageItem(item: InventoryItem, amount: number): boolean {
	if (item.maxDurability === undefined) return false;
	if (!Number.isFinite(amount) || amount <= 0) return (item.durability ?? item.maxDurability) <= 0;

	item.durability = Math.max(0, (item.durability ?? item.maxDurability) - amount);
	return item.durability <= 0;
}

/** restores durability, capped at `maxDurability`; a no-op for an item with none set */
export function repairItem(item: InventoryItem, amount: number): void {
	if (item.maxDurability === undefined) return;
	if (!Number.isFinite(amount) || amount <= 0) return;
	item.durability = Math.min(item.maxDurability, (item.durability ?? item.maxDurability) + amount);
}
