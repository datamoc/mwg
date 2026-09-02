import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Inventory } from '../src/actors/Inventory.ts';
import { craft, type Recipe } from '../src/actors/craft.ts';

test('craft consumes every ingredient and adds the result', () => {
	const bag = new Inventory();
	bag.add({ id: 'wood', quantity: 3, stackable: true });
	bag.add({ id: 'string', quantity: 1, stackable: true });

	const recipe: Recipe = {
		ingredients: [
			{ id: 'wood', quantity: 2 },
			{ id: 'string', quantity: 1 },
		],
		result: { id: 'bow', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), true);
	assert.equal(bag.find('wood')?.quantity, 1); // 3 - 2 left over
	assert.equal(bag.find('string'), undefined); // the whole stack was used
	assert.equal(bag.find('bow')?.quantity, 1);
});

test('craft refuses and touches nothing when an ingredient is missing entirely', () => {
	const bag = new Inventory();
	bag.add({ id: 'wood', quantity: 5, stackable: true });

	const recipe: Recipe = {
		ingredients: [
			{ id: 'wood', quantity: 2 },
			{ id: 'string', quantity: 1 }, // never in the bag at all
		],
		result: { id: 'bow', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), false);
	assert.equal(bag.find('wood')?.quantity, 5); // untouched
	assert.equal(bag.find('bow'), undefined);
});

test('craft refuses and touches nothing when an ingredient is short', () => {
	const bag = new Inventory();
	bag.add({ id: 'wood', quantity: 1, stackable: true });

	const recipe: Recipe = {
		ingredients: [{ id: 'wood', quantity: 2 }],
		result: { id: 'bow', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), false);
	assert.equal(bag.find('wood')?.quantity, 1);
});

test('craft never removes anything if the check on a later ingredient fails', () => {
	const bag = new Inventory();
	bag.add({ id: 'wood', quantity: 10, stackable: true });
	bag.add({ id: 'string', quantity: 0, stackable: true }); // present, but not enough

	const recipe: Recipe = {
		ingredients: [
			{ id: 'wood', quantity: 2 },
			{ id: 'string', quantity: 1 },
		],
		result: { id: 'bow', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), false);
	//the first ingredient (checked before the failing one) must not have been consumed either
	assert.equal(bag.find('wood')?.quantity, 10);
});

test('craft restores every ingredient if the result does not fit', () => {
	const bag = new Inventory({ capacity: 5 });
	bag.add({ id: 'wood', quantity: 2, stackable: true, weight: 1 }); // weight 2, 3 to spare

	const recipe: Recipe = {
		ingredients: [{ id: 'wood', quantity: 2 }],
		result: { id: 'anvil', quantity: 1, weight: 100 }, // wildly over capacity
	};

	assert.equal(craft(bag, recipe), false);
	assert.equal(bag.find('wood')?.quantity, 2); // restored exactly
	assert.equal(bag.find('anvil'), undefined);
	assert.equal(bag.totalWeight, 2);
});

test('a rolled-back ingredient merges back into a leftover stack rather than duplicating it', () => {
	const bag = new Inventory({ capacity: 5 });
	bag.add({ id: 'wood', quantity: 5, stackable: true, weight: 1 });

	const recipe: Recipe = {
		ingredients: [{ id: 'wood', quantity: 2 }], // leaves 3 behind, untouched
		result: { id: 'anvil', quantity: 1, weight: 100 },
	};

	assert.equal(craft(bag, recipe), false);
	//exactly one "wood" slot, back to its original quantity - not a separate leftover slot
	//plus a second restored one
	const woodSlots = bag.items.filter((i) => i.id === 'wood');
	assert.equal(woodSlots.length, 1);
	assert.equal(woodSlots[0].quantity, 5);
});

test('crafting the same recipe twice needs the ingredients twice', () => {
	const bag = new Inventory();
	bag.add({ id: 'wood', quantity: 4, stackable: true });
	bag.add({ id: 'string', quantity: 2, stackable: true });

	const recipe: Recipe = {
		ingredients: [
			{ id: 'wood', quantity: 2 },
			{ id: 'string', quantity: 1 },
		],
		result: { id: 'bow', quantity: 1, stackable: true },
	};

	assert.equal(craft(bag, recipe), true);
	assert.equal(craft(bag, recipe), true);
	assert.equal(bag.find('bow')?.quantity, 2); // stacked together
	assert.equal(craft(bag, recipe), false); // nothing left to make a third
});
