import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Charges } from '../src/actors/Charges.ts';

test('starts full by default', () => {
	const charges = new Charges({ max: 3, regenRate: 5 });
	assert.equal(charges.current, 3);
});

test('an explicit starting amount is honoured', () => {
	const charges = new Charges({ max: 3, current: 1, regenRate: 5 });
	assert.equal(charges.current, 1);
});

test('spend refuses and changes nothing once unaffordable', () => {
	const charges = new Charges({ max: 1, regenRate: 5 });
	assert.equal(charges.spend(1), true);
	assert.equal(charges.canAfford(1), false);
	assert.equal(charges.spend(1), false);
	assert.equal(charges.current, 0);
});

test('advance regenerates one charge once enough turns have banked', () => {
	const charges = new Charges({ max: 2, current: 0, regenRate: 3 });

	charges.advance(2);
	assert.equal(charges.current, 0, 'not enough banked yet');

	charges.advance(1);
	assert.equal(charges.current, 1, 'exactly regenRate banked');
});

test('advance converts several whole regenRate chunks in one call', () => {
	const charges = new Charges({ max: 5, current: 0, regenRate: 2 });
	charges.advance(7); // 3 whole charges, 1 turn of progress left over
	assert.equal(charges.current, 3);
});

test('regeneration never exceeds max, and stops banking further progress once full', () => {
	const charges = new Charges({ max: 2, current: 0, regenRate: 2 });
	charges.advance(100);
	assert.equal(charges.current, 2);

	//advancing again while already full must not silently bank overflow progress
	charges.advance(1);
	assert.equal(charges.current, 2);
});

test('spending after partial regeneration keeps the banked progress towards the next charge', () => {
	const charges = new Charges({ max: 3, current: 3, regenRate: 4 });
	charges.spend(3);
	charges.advance(3); //not enough for a full charge yet
	assert.equal(charges.current, 0);
	charges.advance(1); //completes the 4-turn bank
	assert.equal(charges.current, 1);
});
