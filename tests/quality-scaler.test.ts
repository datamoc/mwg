import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QualityScaler } from '../src/two-d/QualityScaler.ts';

const FAST = 1 / 120;
const SLOW = 1 / 30;

test('a fresh scaler sits at the ceiling and on-budget frames never move it', () => {
	const scaler = new QualityScaler({ ceiling: 2 });
	assert.equal(scaler.ratio, 2);
	for (let i = 0; i < 1000; i++) scaler.observe(FAST);
	assert.equal(scaler.ratio, 2);
});

test('stepping down waits out the full miss streak, then moves exactly one step', () => {
	const scaler = new QualityScaler({ ceiling: 2, overBudgetFrames: 4 });
	for (let i = 0; i < 3; i++) scaler.observe(SLOW);
	assert.equal(scaler.ratio, 2);
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.75);
});

test('sustained misses keep stepping down to the floor and never below it', () => {
	const scaler = new QualityScaler({ ceiling: 2, overBudgetFrames: 1 });
	for (let i = 0; i < 10; i++) scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1);
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1);
});

test('a good frame resets the miss streak, so blips never accumulate into a step', () => {
	const scaler = new QualityScaler({ ceiling: 2, overBudgetFrames: 4 });
	for (let i = 0; i < 3; i++) scaler.observe(SLOW);
	scaler.observe(FAST);
	for (let i = 0; i < 3; i++) scaler.observe(SLOW);
	assert.equal(scaler.ratio, 2);
});

test('stepping up needs the long streak and stops at the ceiling', () => {
	const scaler = new QualityScaler({ ceiling: 2, overBudgetFrames: 1, underBudgetFrames: 3 });
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.75);
	for (let i = 0; i < 2; i++) scaler.observe(FAST);
	assert.equal(scaler.ratio, 1.75);
	scaler.observe(FAST);
	assert.equal(scaler.ratio, 2);
	for (let i = 0; i < 10; i++) scaler.observe(FAST);
	assert.equal(scaler.ratio, 2);
});

test('a raised ceiling never lifts the ratio; a lowered one clamps it and clears streaks', () => {
	const scaler = new QualityScaler({ ceiling: 2, overBudgetFrames: 2 });
	scaler.observe(SLOW);
	assert.equal(scaler.setCeiling(3), 2);
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.75);
	assert.equal(scaler.setCeiling(1.5), 1.5);
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.5, 'the interrupted streak restarts instead of stepping');
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.25);
});

test('non-finite and non-positive frames are ignored rather than counted', () => {
	const scaler = new QualityScaler({ ceiling: 2, overBudgetFrames: 2 });
	scaler.observe(Number.NaN);
	scaler.observe(Number.POSITIVE_INFINITY);
	scaler.observe(0);
	scaler.observe(-1 / 60);
	assert.equal(scaler.ratio, 2);
	scaler.observe(SLOW);
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.75);
});

test('degenerate options fall back instead of breaking the policy', () => {
	const broken = new QualityScaler({
		ceiling: Number.NaN,
		minRatio: -1,
		targetFps: 0,
		overBudgetFrames: 0,
		step: -0.5,
	});
	assert.equal(broken.ratio, 1);
	for (let i = 0; i < 60; i++) broken.observe(SLOW);
	assert.equal(broken.ratio, 1, 'the floor (1 here) still holds with degenerate options');
});

test('reset returns to the ceiling with both streaks cleared', () => {
	const scaler = new QualityScaler({ ceiling: 2, overBudgetFrames: 1 });
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.75);
	scaler.reset();
	assert.equal(scaler.ratio, 2);
	scaler.observe(SLOW);
	assert.equal(scaler.ratio, 1.75, 'one miss after reset steps again from a clean streak');
});
