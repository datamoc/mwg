import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Barrier } from '../src/actors/Barrier.ts';

test('a fresh barrier absorbs nothing', () => {
	const barrier = new Barrier();
	assert.equal(barrier.total, 0);
	assert.equal(barrier.absorb(5), 0);
});

test('absorb drains up to the held amount and reports what it actually took', () => {
	const barrier = new Barrier();
	barrier.add(10);
	assert.equal(barrier.absorb(4), 4);
	assert.equal(barrier.total, 6);
	assert.equal(barrier.absorb(100), 6, 'never absorbs more than it held');
	assert.equal(barrier.total, 0);
});

test('a non-positive add is a no-op, not an empty layer', () => {
	const barrier = new Barrier();
	barrier.add(0);
	barrier.add(-5);
	assert.equal(barrier.layerCount, 0);
});

test('layered absorption drains the most recently added layer first', () => {
	const barrier = new Barrier();
	barrier.add(5); // outer shield
	barrier.add(3); // ward cast on top
	assert.equal(barrier.layerCount, 2);

	assert.equal(barrier.absorb(2), 2, 'ward takes the first hit');
	assert.equal(barrier.total, 6);
	assert.equal(barrier.absorb(2), 2, 'ward is fully spent, spills into the shield');
	assert.equal(barrier.layerCount, 1);
	assert.equal(barrier.total, 4);
});

test('decay reduces only layers with a nonzero decayPerTick, removing exhausted ones', () => {
	const barrier = new Barrier();
	barrier.add(10, 0); // permanent shield
	barrier.add(4, 2); // decaying ward

	barrier.advance(1);
	assert.equal(barrier.total, 12, '10 + 2 left of the ward');
	barrier.advance(1);
	assert.equal(barrier.total, 10, 'ward fully decayed away, only the permanent shield remains');
	assert.equal(barrier.layerCount, 1);
});

test('clear drops every layer at once', () => {
	const barrier = new Barrier();
	barrier.add(3);
	barrier.add(3);
	barrier.clear();
	assert.equal(barrier.total, 0);
	assert.equal(barrier.layerCount, 0);
});

test('round-trips through JSON', () => {
	const barrier = new Barrier();
	barrier.add(5, 1);
	barrier.add(2);

	const restored = Barrier.fromJSON(barrier.toJSON());
	assert.equal(restored.total, 7);
	assert.equal(restored.layerCount, 2);
	restored.advance(1);
	assert.equal(restored.total, 6);
});
