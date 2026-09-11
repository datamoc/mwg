import type { Inventory, InventoryItem } from './Inventory.ts';

/**
 * What one recipe ingredient consumes. `id` is the simple case: one exact item, or any of
 * several. `category` asks for any item of a kind ("any herb plus any runestone"), matching the
 * `category` an item's definition carries. `matches` is the escape hatch when neither fits.
 * Give exactly one of the three.
 */
export interface Ingredient {
	/** one exact item id, or any of several */
	readonly id?: string | readonly string[];
	/** any item whose `category` is this */
	readonly category?: string;
	/** full control: an item this returns true for */
	readonly matches?: (item: InventoryItem) => boolean;

	/** how many items matching this the recipe needs */
	readonly quantity: number;
}

export interface Recipe {
	/** what gets consumed, by exact id, by category, or by predicate */
	ingredients: Ingredient[];

	/** what one crafting resolves to - a full item, since it needs its own weight/stackable */
	result: InventoryItem;
}

function matchesIngredient(item: InventoryItem, ingredient: Ingredient): boolean {
	if (ingredient.matches) return ingredient.matches(item);
	if (ingredient.category !== undefined) return item.category === ingredient.category;
	if (typeof ingredient.id === 'string') return item.id === ingredient.id;
	return (ingredient.id ?? []).includes(item.id);
}

function ingredientHasMatcher(ingredient: Ingredient): boolean {
	return ingredient.matches !== undefined || ingredient.category !== undefined || ingredient.id !== undefined;
}

/**
 * Resolves a recipe against an inventory: every ingredient checked, consumed, and the
 * result added, all in one call - the same small-focused-function shape `skillCheck`
 * already is, not a crafting subsystem of its own. `Inventory` only ever stacks, weighs and
 * adds/removes what a game already hands it; nothing there turns one stack of items into a
 * different one, which is the entire gap this closes.
 *
 * An ingredient may name an exact `id` (or any of several), a `category` ("any herb", matched
 * against the item definition's own `category`), or a `matches` predicate, and a quantity is
 * taken from as many matching stacks as it spans.
 *
 * All or nothing: if any ingredient is missing or too few, nothing is touched. The allocation
 * runs against a working copy of the stacks first, so two ingredients that could both take the
 * same stack cannot each count it. If every ingredient is present but the result would not fit
 * (`Inventory`'s own capacity, unrelated to crafting itself), the ingredients are put back
 * exactly as they were rather than being spent for nothing.
 *
 * @returns whether the recipe resolved
 *
 * @example
 * ```ts
 * import { craft, Inventory, type Recipe } from '@datamoc/mw_games/actors';
 *
 * const bag = new Inventory();
 * bag.add({ id: 'sage', quantity: 2, stackable: true, category: 'herb' });
 * bag.add({ id: 'ember', quantity: 1, stackable: true, category: 'runestone' });
 *
 * const recipe: Recipe = {
 *   ingredients: [
 *     { category: 'herb', quantity: 2 },
 *     { category: 'runestone', quantity: 1 },
 *   ],
 *   result: { id: 'elixir', quantity: 1 },
 * };
 *
 * const made = craft(bag, recipe); // true - any herb plus any runestone becomes an elixir
 * ```
 */
export function craft(inventory: Inventory, recipe: Recipe): boolean {
	//a working copy of every stack's quantity, so an earlier ingredient consumes this allocation
	//even when a later one matches the same category or predicate
	const available = new Map<InventoryItem, number>();
	for (const item of inventory.items) available.set(item, item.quantity);

	const taken = new Map<InventoryItem, number>();
	for (const ingredient of recipe.ingredients) {
		if (!ingredientHasMatcher(ingredient))
			throw new Error('recipe ingredient must name an id, a category, or a matches predicate');
		if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0)
			throw new Error('recipe ingredient quantity must be a positive number');

		let needed = ingredient.quantity;
		for (const item of inventory.items) {
			if (needed <= 0) break;
			const held = available.get(item) ?? 0;
			if (held <= 0 || !matchesIngredient(item, ingredient)) continue;
			const take = Math.min(held, needed);
			available.set(item, held - take);
			needed -= take;
			taken.set(item, (taken.get(item) ?? 0) + take);
		}
		if (needed > 0) return false;
	}

	for (const [item, quantity] of taken) inventory.remove(item.id, quantity, item.instanceId);
	if (inventory.add(recipe.result)) return true;

	for (const [item, quantity] of taken) inventory.add({ ...item, quantity });
	return false;
}
