import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rangeMultiplier, areaFalloffMultiplier } from '../src/roguelike/Targeting.ts';

test('rangeMultiplier picks the first band whose max covers the distance', () => {
	const bands = [
		{ max: 1, multiplier: 1.5 }, // point-blank bonus
		{ max: 4, multiplier: 1 }, // normal range
	];
	assert.equal(rangeMultiplier(1, bands), 1.5);
	assert.equal(rangeMultiplier(4, bands), 1);
});

test('rangeMultiplier falls back to `beyond` past every band', () => {
	const bands = [{ max: 3, multiplier: 1 }];
	assert.equal(rangeMultiplier(4, bands, 0.5), 0.5);
	assert.equal(rangeMultiplier(10, bands), 1, 'default beyond is 1');
});

test('rangeMultiplier with no bands always falls back', () => {
	assert.equal(rangeMultiplier(0, [], 0.25), 0.25);
});

test('areaFalloffMultiplier steps down per target order', () => {
	const steps = [1, 0.5, 0.25];
	assert.equal(areaFalloffMultiplier(0, steps), 1);
	assert.equal(areaFalloffMultiplier(1, steps), 0.5);
	assert.equal(areaFalloffMultiplier(2, steps), 0.25);
});

test('areaFalloffMultiplier repeats the last step past the end of the list', () => {
	const steps = [1, 0.5];
	assert.equal(areaFalloffMultiplier(5, steps), 0.5);
});

test('areaFalloffMultiplier with no steps defaults to full strength', () => {
	assert.equal(areaFalloffMultiplier(0, []), 1);
});
