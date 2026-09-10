import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startReveal, advanceReveal, completeReveal, revealComplete } from '../src/two-d/ui/reveal.ts';

test('a reveal starts hidden and advances by speed times dt', () => {
	const state = startReveal(10, 40);
	assert.equal(state.revealed, 0);
	assert.equal(revealComplete(state), false);
	assert.equal(advanceReveal(state, 0.1), false);
	assert.equal(state.revealed, 4);
});

test('advancing past the total clamps and reports completion', () => {
	const state = startReveal(10, 40);
	assert.equal(advanceReveal(state, 10), true);
	assert.equal(state.revealed, 10);
	assert.equal(revealComplete(state), true);
});

test('completing jumps to the total at once', () => {
	const state = startReveal(10, 40);
	advanceReveal(state, 0.1);
	completeReveal(state);
	assert.equal(state.revealed, 10);
	assert.equal(revealComplete(state), true);
});

test('a zero speed or zero length starts complete', () => {
	assert.equal(revealComplete(startReveal(10, 0)), true);
	assert.equal(revealComplete(startReveal(0)), true);
});

test('negative totals, speeds and steps clamp to zero rather than rewinding', () => {
	const state = startReveal(-5, -40);
	assert.equal(state.total, 0);
	assert.equal(state.speed, 0);
	assert.equal(revealComplete(state), true);

	const live = startReveal(10, 40);
	advanceReveal(live, -1);
	assert.equal(live.revealed, 0);
});
