import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	CIRCLE8,
	NEIGHBOURS4,
	NEIGHBOURS8,
	cellFromKey,
	cellIndex,
	cellInside,
	cellKey,
	cellX,
	cellY,
	euclidean,
} from '../src/core/Grid.ts';
import { neighbourOffsets } from '../src/roguelike/Level.ts';

/**
 * The port-requested primitive, tested the way its exit criterion asks: bounds are checked at
 * every edge, and the row-major round trip is exact. The arithmetic here was previously written
 * out four times inside the framework (`roguelike/Level`, `board/Classics`, `board/FogOfWar`,
 * `board/HexSkirmish`), each with its own spelling of the same two lines.
 */

test('cellInside accepts every cell of the grid and nothing outside it', () => {
	assert.equal(cellInside(4, 3, 0, 0), true);
	assert.equal(cellInside(4, 3, 3, 2), true, 'the far corner is inside');

	assert.equal(cellInside(4, 3, 4, 2), false, 'one past the right edge');
	assert.equal(cellInside(4, 3, 3, 3), false, 'one past the bottom edge');
	assert.equal(cellInside(4, 3, -1, 0), false, 'left of the grid');
	assert.equal(cellInside(4, 3, 0, -1), false, 'above the grid');
	assert.equal(cellInside(4, 3, -1, -1), false);
});

test('cellInside rejects every cell of an empty grid', () => {
	assert.equal(cellInside(0, 0, 0, 0), false);
	assert.equal(cellInside(0, 5, 0, 0), false);
	assert.equal(cellInside(5, 0, 0, 0), false);
});

test('cellIndex walks row-major, one row of width at a time', () => {
	const width = 4;
	assert.equal(cellIndex(width, 0, 0), 0);
	assert.equal(cellIndex(width, 3, 0), 3, 'the end of the first row');
	assert.equal(cellIndex(width, 0, 1), 4, 'the start of the second');
	assert.equal(cellIndex(width, 3, 2), 11, 'the last cell of a 4x3 grid');
});

test('cellX/cellY invert cellIndex for every cell in a grid', () => {
	const width = 7;
	const height = 5;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = cellIndex(width, x, y);
			assert.equal(cellX(width, index), x, `x at (${x},${y})`);
			assert.equal(cellY(width, index), y, `y at (${x},${y})`);
		}
	}
});

test('cellIndex is deliberately unchecked, which is what makes it a hot-loop form', () => {
	// an x past the row edge lands on the next row rather than throwing: callers that have not
	// proved their coordinates use cellInside first, and those that have pay nothing
	assert.equal(cellIndex(4, 4, 0), 4);
	assert.equal(cellIndex(4, -1, 1), 3);
});

test('cellKey and cellFromKey round-trip, negatives included', () => {
	assert.equal(cellKey(2, 1), '2,1');
	assert.deepEqual(cellFromKey('2,1'), { x: 2, y: 1 });
	assert.deepEqual(cellFromKey(cellKey(-3, 0)), { x: -3, y: 0 });
	assert.deepEqual(cellFromKey(cellKey(0, -7)), { x: 0, y: -7 });
});

test('cellFromKey refuses anything it did not produce rather than guessing', () => {
	for (const bad of ['', '2', '2,', ',1', '2,1,0', 'a,b', '2 ,1', '1.5,2', 'x2,y1']) {
		assert.equal(cellFromKey(bad), null, `${JSON.stringify(bad)} is not a cell key`);
	}
});

test('keys are stable strings, so two systems agree on membership', () => {
	// the point of a shared spelling: a Set built from one system answers for another's key
	const seen = new Set([cellKey(1, 1), cellKey(2, 0)]);
	assert.equal(seen.has('1,1'), true);
	assert.equal(seen.has(cellKey(2, 0)), true);
	assert.equal(seen.has(cellKey(0, 2)), false, 'order matters: (2,0) is not (0,2)');
});

test('NEIGHBOURS8 lists the eight surrounding cells in row-major order, centre skipped', () => {
	assert.deepEqual(NEIGHBOURS8, [
		[-1, -1],
		[0, -1],
		[1, -1],
		[-1, 0],
		[1, 0],
		[-1, 1],
		[0, 1],
		[1, 1],
	]);
});

test('CIRCLE8 walks the same ring clockwise from north', () => {
	assert.deepEqual(CIRCLE8, [
		[0, -1],
		[1, -1],
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
		[-1, 0],
		[-1, -1],
	]);
	//same eight cells as NEIGHBOURS8: only the visit order differs
	assert.deepEqual([...CIRCLE8].sort(), [...NEIGHBOURS8].sort());
});

test('NEIGHBOURS4 lists the axial neighbours north, east, south, west', () => {
	assert.deepEqual(NEIGHBOURS4, [
		[0, -1],
		[1, 0],
		[0, 1],
		[-1, 0],
	]);
});

test('neighbourOffsets returns the shared core tables, not copies', () => {
	//one table, two doors: flood fills and diffusion must visit one identical sequence,
	//and returning the frozen table itself (rather than a copy) keeps the hot loops free
	assert.equal(neighbourOffsets(4), NEIGHBOURS4);
	assert.equal(neighbourOffsets(8), CIRCLE8);
});

test('euclidean measures straight-line distance in cells', () => {
	const from = { x: 0, y: 0 };
	assert.equal(euclidean(from, from), 0);
	assert.equal(euclidean(from, { x: 3, y: 4 }), 5);
	assert.equal(euclidean(from, { x: 1, y: 1 }), Math.SQRT2);
	assert.equal(euclidean({ x: 1, y: 1 }, from), euclidean(from, { x: 1, y: 1 }), 'symmetric in its arguments');
});
