import type { InventoryItem } from './Inventory.ts';

/**
 * The three item-shaped states `Inventory` only had fields for, not behaviour: identification,
 * an enchantment/upgrade level, and durability that wears down with use. Small, focused
 * functions over a plain `InventoryItem` - the same size of primitive `skillCheck` already is -
 * rather than a class, since none of the three need to remember anything beyond the item.
 */

/** reveals an item's real nature - a potion's true effect, a ring's curse - once identified */
export function identify(item: InventoryItem): void {
	item.identified = true;
}

/** raises (or, given a negative delta, lowers) an item's enchantment/upgrade level */
export function enchant(item: InventoryItem, delta: number): number {
	item.level = (item.level ?? 0) + delta;
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

	item.durability = Math.max(0, (item.durability ?? item.maxDurability) - amount);
	return item.durability <= 0;
}

/** restores durability, capped at `maxDurability`; a no-op for an item with none set */
export function repairItem(item: InventoryItem, amount: number): void {
	if (item.maxDurability === undefined) return;
	item.durability = Math.min(item.maxDurability, (item.durability ?? item.maxDurability) + amount);
}
