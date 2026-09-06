import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rollAffix, affixOf, applyAffix, removeAffix, copyAffix, matchesContext, type AffixTable } from '../src/actors/Affix.ts';
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

test('replacing a curse with a non-curse clears the old curse mark', () => {
	const sword = item();
	applyAffix(sword, { id: 'doomed', trigger: 'passive', weight: 1, curse: true });
	applyAffix(sword, { id: 'keen', trigger: 'strike', weight: 1 });

	assert.equal(sword.affix, 'keen');
	assert.equal(sword.cursed, false);
});

test('copyAffix carries an affix (and its curse mark) onto another item', () => {
	const sword = item();
	applyAffix(sword, { id: 'doomed', trigger: 'passive', weight: 1, curse: true });

	const other = item();
	copyAffix(sword, other);
	assert.equal(affixOf(other), 'doomed');
	assert.equal(other.cursed, true);
});

test('copyAffix replaces whatever the target already had', () => {
	const source = item();
	applyAffix(source, { id: 'keen', trigger: 'strike', weight: 1 });

	const target = item();
	applyAffix(target, { id: 'doomed', trigger: 'passive', weight: 1, curse: true });
	copyAffix(source, target);

	assert.equal(affixOf(target), 'keen');
	assert.equal(target.cursed, false, 'the old curse mark is cleared too');
});

test('copyAffix from a plain item clears the target', () => {
	const bare = item();
	const target = item();
	applyAffix(target, { id: 'keen', trigger: 'strike', weight: 1 });

	copyAffix(bare, target);
	assert.equal(affixOf(target), undefined);
});

test('a transfer is copyAffix plus clearing the source', () => {
	const source = item();
	applyAffix(source, { id: 'keen', trigger: 'strike', weight: 1 });
	const target = item();

	copyAffix(source, target);
	removeAffix(source);

	assert.equal(affixOf(target), 'keen');
	assert.equal(affixOf(source), undefined);
});

test('matchesContext requires the trigger to match', () => {
	const affix = { id: 'keen', trigger: 'strike', weight: 1 } as const;
	assert.equal(matchesContext(affix, { trigger: 'strike' }), true);
	assert.equal(matchesContext(affix, { trigger: 'defend' }), false);
});

test('matchesContext with no kinds fires for any attack kind', () => {
	const affix = { id: 'keen', trigger: 'strike', weight: 1 } as const;
	assert.equal(matchesContext(affix, { trigger: 'strike', kind: 'bow' }), true);
	assert.equal(matchesContext(affix, { trigger: 'strike' }), true);
});

test('matchesContext restricts to the affix\'s own kinds when given', () => {
	const affix = { id: 'point-blank', trigger: 'strike', weight: 1, kinds: ['bow', 'thrown'] } as const;
	assert.equal(matchesContext(affix, { trigger: 'strike', kind: 'bow' }), true);
	assert.equal(matchesContext(affix, { trigger: 'strike', kind: 'melee' }), false);
	assert.equal(matchesContext(affix, { trigger: 'strike' }), false, 'no kind given at all does not match a restricted affix');
});
