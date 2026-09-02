import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rollAffix, affixOf, applyAffix, removeAffix, type AffixTable } from '../src/actors/Affix.ts';
import type { InventoryItem } from '../src/actors/Inventory.ts';

const table: AffixTable = {
	entries: [
		{ id: 'keen', trigger: 'strike', weight: 3 },
		{ id: 'heavy', trigger: 'strike', weight: 1 },
	],
};

function item(): InventoryItem {
	return { id: 'sword', quantity: 1 };
}

test('a single-entry table always rolls that affix', () => {
	const rolled = rollAffix({ entries: [{ id: 'only', trigger: 'passive', weight: 5 }] });
	assert.equal(rolled?.id, 'only');
});

test('an empty or all-zero table rolls nothing', () => {
	assert.equal(rollAffix({ entries: [] }), null);
	assert.equal(rollAffix({ entries: [{ id: 'never', trigger: 'strike', weight: 0 }] }), null);
});

test('weights skew the roll over many trials', () => {
	let keen = 0;
	for (let i = 0; i < 200; i++) {
		if (rollAffix(table)?.id === 'keen') keen++;
	}
	assert.ok(keen > 100 && keen < 200, `expected roughly 3/4 keen, got ${keen}/200`);
});

test('applying an affix stores its id, and affixOf reads it back', () => {
	const sword = item();
	assert.equal(affixOf(sword), undefined);
	applyAffix(sword, { id: 'keen', trigger: 'strike', weight: 1 });
	assert.equal(affixOf(sword), 'keen');
});

test('a curse affix also marks the item cursed; removing clears both', () => {
	const sword = item();
	applyAffix(sword, { id: 'doomed', trigger: 'passive', weight: 1, curse: true });
	assert.equal(sword.cursed, true);
	removeAffix(sword);
	assert.equal(affixOf(sword), undefined);
	assert.equal(sword.cursed, false);
});

test('a non-curse affix never touches the cursed flag', () => {
	const sword = item();
	applyAffix(sword, { id: 'keen', trigger: 'strike', weight: 1 });
	assert.equal(sword.cursed, undefined);
});
