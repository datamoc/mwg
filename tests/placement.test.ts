import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Random from '../src/core/Random.ts';
import { Level } from '../src/roguelike/Level.ts';
import { candidateCells, cellsNear, selectDistinctCells } from '../src/roguelike/Placement.ts';

const KINDS = [
	{ passable: false, transparent: false }, //0 wall
	{ passable: true, transparent: true }, //1 floor
];

function floorLevel(width: number, height: number): Level {
	const level = new Level(width, height, KINDS, 1); //fill with floor
	return level;
}

test('candidateCells with no filter returns every cell', () => {
	const level = floorLevel(3, 3);
	assert.deepEqual(candidateCells(level), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('candidateCells excludes occupied cells', () => {
	const level = floorLevel(3, 3);
	const result = candidateCells(level, { occupied: new Set([0, 4, 8]) });
	assert.deepEqual(result, [1, 2, 3, 5, 6, 7]);
});

test('candidateCells filters by terrain kind', () => {
	const level = new Level(3, 1, KINDS, 0);
	level.set(1, 0, 1); //one floor cell among walls

	const result = candidateCells(level, { terrain: new Set([1]) });
	assert.deepEqual(result, [1]);
});

test('candidateCells honours an explicit `within` region over the whole level', () => {
	const level = floorLevel(3, 3);
	const result = candidateCells(level, { within: [2, 4, 6] });
	assert.deepEqual(result, [2, 4, 6]);
});

test('candidateCells filters combine: within, then terrain, then occupied', () => {
	const level = new Level(3, 3, KINDS, 1);
	level.set(0, 0, 0); //cell 0 is a wall

	const result = candidateCells(level, { within: [0, 1, 4], terrain: new Set([1]), occupied: new Set([4]) });
	assert.deepEqual(result, [1]);
});

test('cellsNear returns immediate neighbours at radius 1, never the centre', () => {
	const level = floorLevel(3, 3);
	const near = cellsNear(level, level.index(1, 1), 1).sort((a, b) => a - b);
	assert.deepEqual(near, [0, 1, 2, 3, 5, 6, 7, 8]);
	assert.ok(!near.includes(4)); //centre excluded
});

test('cellsNear at radius 0 is empty', () => {
	const level = floorLevel(3, 3);
	assert.deepEqual(cellsNear(level, level.index(1, 1), 0), []);
});

test('cellsNear stays inside the level and never duplicates a cell across radius steps', () => {
	const level = floorLevel(3, 3);
	const near = cellsNear(level, level.index(0, 0), 2); //corner cell, small map
	assert.equal(new Set(near).size, near.length);
	assert.ok(near.every((cell) => cell >= 0 && cell < level.cellCount));
});

test('selectDistinctCells returns exactly `count` distinct cells when enough candidates exist', () => {
	Random.push(1);
	const { cells, trace } = selectDistinctCells([0, 1, 2, 3, 4], 3);
	Random.pop();

	assert.equal(cells.length, 3);
	assert.equal(new Set(cells).size, 3);
	assert.equal(trace.requested, 3);
	assert.equal(trace.available, 5);
	assert.deepEqual(trace.selected, cells);
});

test('selectDistinctCells falls back to however many candidates exist, bounded, rather than throwing', () => {
	Random.push(1);
	const { cells, trace } = selectDistinctCells([10, 20], 5);
	Random.pop();

	assert.equal(cells.length, 2);
	assert.deepEqual(new Set(cells), new Set([10, 20]));
	assert.equal(trace.requested, 5);
	assert.equal(trace.available, 2);
});

test('selectDistinctCells de-duplicates its candidate pool before selecting', () => {
	Random.push(1);
	const { cells } = selectDistinctCells([7, 7, 7, 8], 2);
	Random.pop();

	assert.equal(cells.length, 2);
	assert.deepEqual(new Set(cells), new Set([7, 8]));
});

test('selectDistinctCells is deterministic for a given seed', () => {
	Random.push(42);
	const first = selectDistinctCells([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
	Random.pop();

	Random.push(42);
	const second = selectDistinctCells([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
	Random.pop();

	assert.deepEqual(first.cells, second.cells);
});

test('selectDistinctCells never mutates the candidates array passed in', () => {
	const candidates = [0, 1, 2, 3];
	const snapshot = [...candidates];
	Random.push(1);
	selectDistinctCells(candidates, 2);
	Random.pop();
	assert.deepEqual(candidates, snapshot);
});

test('trace is plain JSON-safe data, round-tripping through JSON.stringify/parse unchanged', () => {
	Random.push(1);
	const { trace } = selectDistinctCells([1, 2, 3], 2);
	Random.pop();

	assert.deepEqual(JSON.parse(JSON.stringify(trace)), trace);
});

test('candidateCells and cellsNear compose to cluster several picks around one anchor', () => {
	const level = floorLevel(5, 5);
	const anchor = level.index(2, 2);
	const pool = candidateCells(level, { occupied: new Set([anchor]) });
	const near = cellsNear(level, anchor, 1).filter((c) => pool.includes(c));

	Random.push(7);
	const { cells } = selectDistinctCells(near, 2);
	Random.pop();

	assert.equal(cells.length, 2);
	for (const cell of cells) {
		const dx = Math.abs(level.xOf(cell) - level.xOf(anchor));
		const dy = Math.abs(level.yOf(cell) - level.yOf(anchor));
		assert.ok(dx <= 1 && dy <= 1 && cell !== anchor);
	}
});
