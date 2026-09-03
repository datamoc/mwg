import type { Inventory, InventoryItem } from './Inventory.ts';

export interface Recipe {
	/** what gets consumed, by id and how much of each */
	ingredients: Array<{ id: string; quantity: number }>;

	/** what one crafting resolves to - a full item, since it needs its own weight/stackable */
	result: InventoryItem;
}

/**
 * Resolves a recipe against an inventory: every ingredient checked, consumed, and the
 * result added, all in one call - the same small-focused-function shape `skillCheck`
 * already is, not a crafting subsystem of its own. `Inventory` only ever stacks, weighs and
 * adds/removes what a game already hands it; nothing there turns one stack of items into a
 * different one, which is the entire gap this closes.
 *
 * All or nothing: if any ingredient is missing or too few, nothing is touched. If every
 * ingredient is present but the result would not fit (`Inventory`'s own capacity, unrelated
 * to crafting itself), the ingredients are put back exactly as they were rather than being
 * spent for nothing.
 *
 * @returns whether the recipe resolved
 */
export function craft(inventory: Inventory, recipe: Recipe): boolean {
	const needed = new Map<string, number>();
	for (const ingredient of recipe.ingredients) {
		needed.set(ingredient.id, (needed.get(ingredient.id) ?? 0) + ingredient.quantity);
	}
	for (const [id, quantity] of needed) {
		const held = inventory.find(id);
		if (!held || held.quantity < quantity) return false;
	}

	//captured before anything is removed, so a failed add below can restore exactly this
	const consumed = recipe.ingredients.map((ingredient) => ({
		...inventory.find(ingredient.id)!,
		quantity: ingredient.quantity,
	}));

	for (const ingredient of recipe.ingredients) inventory.remove(ingredient.id, ingredient.quantity);
	if (inventory.add(recipe.result)) return true;

	for (const item of consumed) inventory.add(item);
	return false;
}
