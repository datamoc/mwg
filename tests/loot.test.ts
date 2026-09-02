import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rollLoot, type LootTable } from '../src/actors/Loot.ts';
import { reset, withSeed } from '../src/core/Random.ts';

test('an empty table never drops anything', () => {
	reset();
	const table: LootTable = { entries: [] };
	assert.equal(rollLoot(table), null);
});

test('chance: 0 never drops, however many entries there are', () => {
	reset();
	const table: LootTable = { entries: [{ id: 'gold', weight: 1 }], chance: 0 };
	for (let i = 0; i < 20; i++) assert.equal(rollLoot(table), null);
});

test('omitting chance always drops something, from a non-empty table', () => {
	reset();
	const table: LootTable = { entries: [{ id: 'gold', weight: 1 }] };
	for (let i = 0; i < 20; i++) assert.notEqual(rollLoot(table), null);
});

test('a dropped entry defaults to quantity 1', () => {
	reset();
	const table: LootTable = { entries: [{ id: 'gold', weight: 1 }] };
	assert.deepEqual(rollLoot(table), { id: 'gold', quantity: 1 });
});

test('an explicit quantity is carried through', () => {
	reset();
	const table: LootTable = { entries: [{ id: 'arrow', weight: 1, quantity: 5 }] };
	assert.deepEqual(rollLoot(table), { id: 'arrow', quantity: 5 });
});

test('entries drop in proportion to their weight, over enough trials', () => {
	const table: LootTable = {
		entries: [
			{ id: 'common', weight: 9 },
			{ id: 'rare', weight: 1 },
		],
	};

	withSeed(1, () => {
		let commonCount = 0;
		for (let i = 0; i < 2000; i++) {
			if (rollLoot(table)!.id === 'common') commonCount++;
		}
		//9:1 over 2000 rolls should land close to 1800; a wide tolerance keeps this from flaking
		assert.ok(commonCount > 1600 && commonCount < 2000, `expected around 1800, got ${commonCount}`);
	});
});
