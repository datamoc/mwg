import assert from 'node:assert/strict';
import test from 'node:test';
import { weightedFlood } from '../src/core/Pathfinding.ts';

test('weightedFlood chooses the cheapest route and respects a stopping cell', () => {
	const result = weightedFlood(0, {
		key: (cell) => cell,
		neighbors: (cell) => (cell < 3 ? [cell + 1] : []),
		cost: (_from, to) => (to === 1 ? 3 : 1),
		maxCost: 10,
		stop: (cell) => cell === 1,
	});
	assert.equal(result.get(1)?.cost, 3);
	assert.equal(result.has(2), false);
});

test('weightedFlood rejects blocked, impassable, and over-budget entries', () => {
	const result = weightedFlood('start', {
		key: (cell) => cell,
		neighbors: (cell) => (cell === 'start' ? ['blocked', 'far', 'open'] : []),
		cost: (_from, to) => (to === 'far' ? 9 : 2),
		maxCost: 4,
		canEnter: (cell) => cell !== 'blocked',
	});
	assert.deepEqual([...result.keys()], ['start', 'open']);
});
