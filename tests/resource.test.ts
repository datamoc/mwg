import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { canAfford, spend } from '../src/actors/Resource.ts';

function mage() {
	return new StatBlock({ base: { mana: 10, health: 6 } });
}

test('spend deducts the cost and reports success', () => {
	const stats = mage();
	assert.equal(spend(stats, { stat: 'mana', amount: 4 }), true);
	assert.equal(stats.base('mana'), 6);
});

test('spend refuses an unaffordable cost and leaves the pool untouched', () => {
	const stats = mage();
	assert.equal(spend(stats, { stat: 'mana', amount: 11 }), false);
	assert.equal(stats.base('mana'), 10);
});

test('spending exactly the whole pool empties it but still succeeds', () => {
	const stats = mage();
	assert.equal(spend(stats, { stat: 'mana', amount: 10 }), true);
	assert.equal(stats.base('mana'), 0);
});

test('several costs are all-or-nothing', () => {
	const stats = mage();
	assert.equal(
		spend(stats, [
			{ stat: 'mana', amount: 4 },
			{ stat: 'health', amount: 99 },
		]),
		false
	);
	assert.equal(stats.base('mana'), 10, 'the affordable half must be rolled back');
	assert.equal(stats.base('health'), 6);

	assert.equal(
		spend(stats, [
			{ stat: 'mana', amount: 4 },
			{ stat: 'health', amount: 2 },
		]),
		true
	);
	assert.equal(stats.base('mana'), 6);
	assert.equal(stats.base('health'), 4);
});

test('canAfford checks without spending', () => {
	const stats = mage();
	assert.equal(canAfford(stats, { stat: 'mana', amount: 10 }), true);
	assert.equal(canAfford(stats, { stat: 'mana', amount: 11 }), false);
	assert.equal(stats.base('mana'), 10, 'checking must not deduct');
});

test('a zero cost is always affordable, even from an empty pool', () => {
	const stats = new StatBlock({ base: {} });
	assert.equal(canAfford(stats, { stat: 'mana', amount: 0 }), true);
	assert.equal(spend(stats, { stat: 'mana', amount: 0 }), true);
});

test('a negative cost is an authoring error, not a refund', () => {
	const stats = mage();
	assert.throws(() => spend(stats, { stat: 'mana', amount: -1 }), /non-negative/);
	assert.throws(() => canAfford(stats, { stat: 'mana', amount: -1 }), /non-negative/);
	assert.equal(stats.base('mana'), 10);
});
