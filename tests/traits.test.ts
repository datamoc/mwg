import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { assignTraits, type TraitDef } from '../src/actors/Traits.ts';
import * as Random from '../src/core/Random.ts';

const POOL: TraitDef[] = [
	{ name: 'strong', modifiers: [{ stat: 'strength', op: 'add', value: 2 }] },
	{ name: 'frail', modifiers: [{ stat: 'vitality', op: 'add', value: -2 }] },
	{ name: 'lucky', modifiers: [{ stat: 'luck', op: 'add', value: 3 }] },
];

test('assigning traits applies their modifiers permanently', () => {
	const stats = new StatBlock({ base: { strength: 5, vitality: 5, luck: 5 } });
	Random.withSeed(1, () => assignTraits(stats, POOL, 1));

	//exactly one trait's modifier should have landed, whichever was drawn
	const total = stats.get('strength') + stats.get('vitality') + stats.get('luck');
	assert.equal(total, 17); // 15 base + one trait's +2 or -2 or +3
});

test('assigning traits returns which ones were picked', () => {
	const stats = new StatBlock({ base: { strength: 5, vitality: 5, luck: 5 } });
	const picked = Random.withSeed(1, () => assignTraits(stats, POOL, 2));

	assert.equal(picked.length, 2);
	for (const { trait } of picked) assert.ok(POOL.includes(trait));
	//never the same trait twice
	assert.notEqual(picked[0].trait, picked[1].trait);
});

test('asking for more traits than the pool holds assigns every one of them, not fewer', () => {
	const stats = new StatBlock({ base: { strength: 0, vitality: 0, luck: 0 } });
	const picked = assignTraits(stats, POOL, 10);
	assert.equal(picked.length, POOL.length);
});

test('each assigned trait keeps its own source, so one can be stripped without touching the others', () => {
	const stats = new StatBlock({ base: { strength: 0, vitality: 0, luck: 0 } });
	const picked = Random.withSeed(2, () => assignTraits(stats, POOL, 2));

	stats.removeModifiersFrom(picked[0].source);
	//the other trait's modifier is still applied
	const remainingTotal = stats.get('strength') + stats.get('vitality') + stats.get('luck');
	const removedValue = picked[0].trait.modifiers[0].value;
	const keptValue = picked[1].trait.modifiers[0].value;
	assert.equal(remainingTotal, keptValue);
	assert.notEqual(removedValue, undefined);
});
