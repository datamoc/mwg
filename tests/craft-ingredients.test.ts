import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Inventory } from '../src/actors/Inventory.ts';
import { craft, type Recipe } from '../src/actors/craft.ts';

/**
 * A recipe ingredient is not only an exact id. `category` asks for any item of a kind ("any herb
 * plus any runestone"), `id: [...]` accepts any of several, and `matches` is the escape hatch.
 * The allocation runs against a working copy, so two flexible ingredients cannot both count the
 * same stack.
 */

test('a category ingredient consumes any item of that kind', () => {
	const bag = new Inventory();
	bag.add({ id: 'sage', quantity: 2, stackable: true, category: 'herb' });
	bag.add({ id: 'mint', quantity: 1, stackable: true, category: 'herb' });
	bag.add({ id: 'ember', quantity: 1, stackable: true, category: 'runestone' });

	const recipe: Recipe = {
		ingredients: [
			{ category: 'herb', quantity: 2 },
			{ category: 'runestone', quantity: 1 },
		],
		result: { id: 'elixir', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), true);
	//the first matching stack is drained first, so both sage are taken and mint is untouched
	assert.equal(bag.find('sage'), undefined);
	assert.equal(bag.find('mint')?.quantity, 1, 'the second herb stack was not needed');
	assert.equal(bag.find('ember'), undefined);
	assert.equal(bag.find('elixir')?.quantity, 1);
});

test('a category ingredient can span several stacks', () => {
	const bag = new Inventory();
	bag.add({ id: 'sage', quantity: 1, stackable: true, category: 'herb' });
	bag.add({ id: 'mint', quantity: 1, stackable: true, category: 'herb' });
	bag.add({ id: 'thyme', quantity: 3, stackable: true, category: 'herb' });

	assert.equal(
		craft(bag, { ingredients: [{ category: 'herb', quantity: 3 }], result: { id: 'poultice', quantity: 1 } }),
		true,
	);
	assert.equal(bag.find('sage'), undefined);
	assert.equal(bag.find('mint'), undefined);
	assert.equal(bag.find('thyme')?.quantity, 2, 'one from sage, one from mint, one from thyme');
});

test('two flexible ingredients cannot both count the same stack', () => {
	const bag = new Inventory();
	bag.add({ id: 'sage', quantity: 1, stackable: true, category: 'herb' });

	const recipe: Recipe = {
		ingredients: [
			{ category: 'herb', quantity: 1 },
			{ category: 'herb', quantity: 1 },
		],
		result: { id: 'elixir', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), false, 'one herb cannot satisfy two herb lines');
	assert.equal(bag.find('sage')?.quantity, 1, 'and nothing was consumed');
});

test('id as a list accepts any of several', () => {
	const bag = new Inventory();
	bag.add({ id: 'ruby', quantity: 1, stackable: true });
	bag.add({ id: 'sapphire', quantity: 1, stackable: true });

	const recipe: Recipe = {
		ingredients: [{ id: ['ruby', 'emerald'], quantity: 1 }],
		result: { id: 'gem', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), true);
	assert.equal(bag.find('ruby'), undefined);
	assert.equal(bag.find('sapphire')?.quantity, 1, 'sapphire was not in the list');
});

test('a matches predicate is the escape hatch', () => {
	const bag = new Inventory();
	bag.add({ id: 'potion', quantity: 1, stackable: true, identified: false });
	bag.add({ id: 'potion', quantity: 1, stackable: true, instanceId: 'known', identified: true });

	const recipe: Recipe = {
		ingredients: [{ matches: (item) => item.id === 'potion' && item.identified === true, quantity: 1 }],
		result: { id: 'remedy', quantity: 1 },
	};

	assert.equal(craft(bag, recipe), true);
	assert.equal(bag.find('potion', 'known'), undefined, 'the identified one was the ingredient');
	assert.equal(bag.items.find((item) => item.id === 'potion')?.identified, false);
});

test('a missing category refuses and touches nothing', () => {
	const bag = new Inventory();
	bag.add({ id: 'ember', quantity: 1, stackable: true, category: 'runestone' });

	assert.equal(
		craft(bag, { ingredients: [{ category: 'herb', quantity: 1 }], result: { id: 'elixir', quantity: 1 } }),
		false,
	);
	assert.equal(bag.find('ember')?.quantity, 1);
});

test('an ingredient with no matcher throws by name', () => {
	const bag = new Inventory();
	bag.add({ id: 'sage', quantity: 1, stackable: true });

	assert.throws(
		() => craft(bag, { ingredients: [{ quantity: 1 }], result: { id: 'elixir', quantity: 1 } }),
		/must name an id, a category, or a matches predicate/,
	);
});

test('a non-positive quantity throws by name', () => {
	const bag = new Inventory();
	bag.add({ id: 'sage', quantity: 1, stackable: true });

	assert.throws(
		() => craft(bag, { ingredients: [{ category: 'herb', quantity: 0 }], result: { id: 'elixir', quantity: 1 } }),
		/quantity must be a positive number/,
	);
});

test('a category ingredient rolls back when the result does not fit', () => {
	const bag = new Inventory({ capacity: 5 });
	bag.add({ id: 'sage', quantity: 2, stackable: true, weight: 1, category: 'herb' });

	const recipe: Recipe = {
		ingredients: [{ category: 'herb', quantity: 2 }],
		result: { id: 'anvil', quantity: 1, weight: 100 },
	};

	assert.equal(craft(bag, recipe), false);
	assert.equal(bag.find('sage')?.quantity, 2);
	assert.equal(bag.totalWeight, 2);
});

test('a category survives an inventory save and load through the item definition', () => {
	const bag = new Inventory();
	bag.add({ id: 'sage', quantity: 3, stackable: true, category: 'herb' });

	const restored = Inventory.fromJSON(new Map([['sage', { stackable: true, category: 'herb' }]]), bag.toJSON());
	assert.equal(restored.find('sage')?.category, 'herb', 'kind-level, so the definition supplies it');

	assert.equal(
		craft(restored, { ingredients: [{ category: 'herb', quantity: 2 }], result: { id: 'poultice', quantity: 1 } }),
		true,
	);
	assert.equal(restored.find('sage')?.quantity, 1);
});
