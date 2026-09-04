import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SupportLedger } from '../src/actors/Support.ts';

const levels = [
	{ id: 'C', threshold: 3, bonus: 'pair-bonus-c' },
	{ id: 'B', threshold: 8, bonus: 'pair-bonus-b' },
];

test('support progress is shared regardless of pair order and unlocks thresholds', () => {
	const support = new SupportLedger(levels);
	assert.equal(support.level('alice', 'bob'), null);
	assert.equal(support.add('alice', 'bob', 3).level?.id, 'C');
	assert.equal(support.get('bob', 'alice'), 3);
	const change = support.add('bob', 'alice', 5);
	assert.equal(change.previousLevel?.id, 'C');
	assert.equal(change.level?.id, 'B');
});

test('support progress cannot fall below zero and round-trips', () => {
	const support = new SupportLedger(levels);
	support.add('a', 'b', 4);
	support.add('a', 'b', -10);
	assert.equal(support.get('a', 'b'), 0);
	const restored = SupportLedger.restore(levels, support.save());
	assert.equal(restored.get('b', 'a'), 0);
});

test('support rejects invalid pairs and thresholds', () => {
	assert.throws(() => new SupportLedger([{ id: '', threshold: 0 }]));
	const support = new SupportLedger([]);
	assert.throws(() => support.add('a', 'a', 1));
	assert.throws(() => support.add('a', 'b', Number.NaN));
});
