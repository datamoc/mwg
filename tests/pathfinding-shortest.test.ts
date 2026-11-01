import assert from 'node:assert/strict';
import test from 'node:test';
import { shortestPath } from '../src/core/Pathfinding.ts';

/** a row-major grid of `width` by `height`, cells numbered from 0 top-left */
function grid(width: number, height: number) {
	return {
		at: (x: number, y: number) => y * width + x,
		neighbors: (index: number): number[] => {
			const x = index % width;
			const y = (index - x) / width;
			const cells: number[] = [];
			if (x > 0) cells.push(index - 1);
			if (x < width - 1) cells.push(index + 1);
			if (y > 0) cells.push(index - width);
			if (y < height - 1) cells.push(index + width);
			return cells;
		},
	};
}

const { at, neighbors } = grid(5, 3);

test('shortestPath walks a straight grid route from start to goal inclusive', () => {
	const route = shortestPath(at(0, 0), at(4, 0), { key: (cell) => cell, neighbors });
	assert.deepEqual(route, [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)]);
});

test('shortestPath detours around a blocked cell', () => {
	const route = shortestPath(at(0, 0), at(4, 0), {
		key: (cell) => cell,
		neighbors,
		canEnter: (cell) => cell !== at(2, 0),
	});

	assert.ok(route);
	assert.equal(route[0], at(0, 0));
	assert.equal(route[route.length - 1], at(4, 0));
	assert.equal(route.includes(at(2, 0)), false);
	assert.equal(route.length, 7, 'the detour is two steps longer than the direct route');
	for (let index = 1; index < route.length; index++) {
		assert.ok(neighbors(route[index - 1]).includes(route[index]), 'every step is between neighbours');
	}
});

test('shortestPath returns null when the goal is unreachable', () => {
	const route = shortestPath(at(0, 0), at(4, 0), {
		key: (cell) => cell,
		neighbors,
		canEnter: (cell) => cell % 5 !== 2,
	});
	assert.equal(route, null);
});

test('shortestPath returns the start alone when start equals goal', () => {
	const route = shortestPath(at(2, 1), at(2, 1), { key: (cell) => cell, neighbors });
	assert.deepEqual(route, [at(2, 1)]);
});

test('shortestPath prefers a cheaper longer route to an expensive short one', () => {
	const board = grid(4, 2);
	const route = shortestPath(board.at(0, 0), board.at(3, 0), {
		key: (cell) => cell,
		neighbors: board.neighbors,
		cost: (_from, to) => (to === board.at(1, 0) || to === board.at(2, 0) ? 100 : 1),
	});
	assert.deepEqual(route, [
		board.at(0, 0),
		board.at(0, 1),
		board.at(1, 1),
		board.at(2, 1),
		board.at(3, 1),
		board.at(3, 0),
	]);
});

test('shortestPath returns null when canEnter excludes the goal', () => {
	const route = shortestPath(at(0, 0), at(4, 0), {
		key: (cell) => cell,
		neighbors,
		canEnter: (cell) => cell !== at(4, 0),
	});
	assert.equal(route, null);
});
