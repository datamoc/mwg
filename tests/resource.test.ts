import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { canAfford, spend, refund, convertToCharges } from '../src/actors/Resource.ts';
import { Charges } from '../src/actors/Charges.ts';

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
		false,
	);
	assert.equal(stats.base('mana'), 10, 'the affordable half must be rolled back');
	assert.equal(stats.base('health'), 6);

	assert.equal(
		spend(stats, [
			{ stat: 'mana', amount: 4 },
			{ stat: 'health', amount: 2 },
		]),
		true,
	);
	assert.equal(stats.base('mana'), 6);
	assert.equal(stats.base('health'), 4);
});

test('two costs on the same stat are checked and spent against their combined total', () => {
	const stats = mage();
	//neither line alone exceeds 10 mana, but 6 + 5 = 11 does
	const cost = [
		{ stat: 'mana', amount: 6 },
		{ stat: 'mana', amount: 5 },
	];
	assert.equal(canAfford(stats, cost), false);
	assert.equal(spend(stats, cost), false);
	assert.equal(stats.base('mana'), 10, 'untouched, never driven negative');

	assert.equal(
		spend(stats, [
			{ stat: 'mana', amount: 6 },
			{ stat: 'mana', amount: 4 },
		]),
		true,
	);
	assert.equal(stats.base('mana'), 0);
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

test('refund restores a spent cost, scaled by fraction', () => {
	const stats = mage();
	spend(stats, { stat: 'mana', amount: 6 });
	assert.equal(stats.base('mana'), 4);

	refund(stats, { stat: 'mana', amount: 6 }, 0.5);
	assert.equal(stats.base('mana'), 7, 'half of the 6 spent comes back');

	refund(stats, [
		{ stat: 'mana', amount: 1 },
		{ stat: 'health', amount: 2 },
	]);
	assert.equal(stats.base('mana'), 8);
	assert.equal(stats.base('health'), 8);
});

test('convertToCharges spends a resource and converts it into charges at a rate', () => {
	const stats = mage();
	const charges = new Charges({ max: 5, current: 0, regenRate: 100 });

	assert.equal(convertToCharges(stats, { stat: 'mana', amount: 9 }, charges, 3), 3);
	assert.equal(stats.base('mana'), 1);
	assert.equal(charges.current, 3);
});

test('convertToCharges spends nothing and gains nothing when the cost is unaffordable', () => {
	const stats = mage();
	const charges = new Charges({ max: 5, current: 0, regenRate: 100 });

	assert.equal(convertToCharges(stats, { stat: 'mana', amount: 99 }, charges, 3), 0);
	assert.equal(stats.base('mana'), 10);
	assert.equal(charges.current, 0);
});

test("convertToCharges caps the gain at the charge pool's own max", () => {
	const stats = mage();
	const charges = new Charges({ max: 2, current: 0, regenRate: 100 });

	assert.equal(convertToCharges(stats, { stat: 'mana', amount: 10 }, charges, 1), 2);
	assert.equal(charges.current, 2);
});
