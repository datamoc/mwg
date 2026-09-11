import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Blob } from '../src/core/index.ts';

const open = () => true;

test('seeded volume reads back, off-map reads zero', () => {
	const blob = new Blob(5, 5);
	blob.seed(2, 2, 10);
	assert.equal(blob.volumeAt(2, 2), 10);
	assert.equal(blob.volumeAt(9, 9), 0);
	blob.seed(9, 9, 10);
	assert.equal(blob.total(), 10, 'off-map seeding is a no-op');
});

test('decay 1 conserves volume, only moving it around', () => {
	const blob = new Blob(5, 5);
	blob.seed(2, 2, 8);
	blob.spread(open, 0.5, 1);
	assert.ok(Math.abs(blob.total() - 8) < 0.0001, `total ${blob.total()}`);
	assert.ok(blob.volumeAt(2, 2) < 8, 'the centre gave some away');
	assert.ok(blob.volumeAt(2, 1) > 0, 'a neighbour received some');
});

test('spread never crosses an impassable cell', () => {
	const blob = new Blob(5, 5);
	blob.seed(0, 0, 8);
	blob.spread(() => false, 0.5, 1);
	assert.equal(blob.volumeAt(0, 0), 8, 'nowhere to go, keeps it all');
	assert.equal(blob.total(), 8);
});

test('decay thins the effect until it reads as gone', () => {
	const blob = new Blob(5, 5);
	blob.seed(2, 2, 8);
	for (let i = 0; i < 200; i++) blob.spread(open, 0.25, 0.9);
	assert.equal(blob.total(), 0);
	assert.deepEqual(blob.cellsAbove(0.001), []);
});

test('cellsAbove lists only cells at or over the minimum', () => {
	const blob = new Blob(5, 5);
	blob.seed(1, 1, 5);
	blob.seed(3, 3, 1);
	const cells = blob.cellsAbove(2);
	assert.equal(cells.length, 1);
	assert.equal(cells[0].x, 1);
	assert.equal(cells[0].volume, 5);
});

test('save and restore round-trips every cell', () => {
	const blob = new Blob(5, 5);
	blob.seed(2, 2, 8);
	blob.spread(open, 0.5, 1);
	const restored = Blob.fromJSON(blob.toJSON());
	assert.equal(restored.total(), blob.total());
	assert.equal(restored.volumeAt(2, 1), blob.volumeAt(2, 1));
});

test('clear zeroes one cell and leaves its neighbours alone', () => {
	const blob = new Blob(5, 5);
	blob.seed(1, 1, 5);
	blob.seed(2, 2, 7);
	blob.clear(1, 1);
	assert.equal(blob.volumeAt(1, 1), 0);
	assert.equal(blob.volumeAt(2, 2), 7, 'the other cell keeps its volume');
	assert.equal(blob.total(), 7);
	blob.clear(9, 9);
	assert.equal(blob.total(), 7, 'off-map clearing is a no-op');
});

test('a cleared cell stays gone through cellsAbove and a later spread', () => {
	const blob = new Blob(5, 5);
	blob.seed(2, 2, 10);
	assert.equal(blob.cellsAbove(1).length, 1);
	blob.clear(2, 2);
	assert.deepEqual(blob.cellsAbove(1), []);
	blob.spread(open, 0.5, 1);
	assert.equal(blob.total(), 0, 'a cleared cell has nothing left to share');
});

test('spread reports nothing while the effect is still alive', () => {
	const blob = new Blob(5, 5);
	blob.seed(2, 2, 8);
	assert.deepEqual(blob.spread(open, 0.5, 1), [], 'volume is conserved, so nothing dies');
});

test('spread reports a cell on the step that empties it, and only that step', () => {
	const blob = new Blob(3, 3);
	blob.seed(1, 1, 1);

	const reportedPerStep: number[] = [];
	while (blob.total() > 0) {
		reportedPerStep.push(blob.spread(open, 0, 0.5).length);
		assert.ok(reportedPerStep.length < 100, `the volume should die out, sat at ${blob.total()}`);
	}

	assert.equal(reportedPerStep.at(-1), 1, 'the emptying step is the one that reports the cell');
	assert.equal(
		reportedPerStep.slice(0, -1).reduce((sum, n) => sum + n, 0),
		0,
		'no earlier step reports anything',
	);
	assert.deepEqual(blob.spread(open, 0, 0.5), [], 'and an empty blob keeps reporting nothing');
});

test('a cell doused before the step is not reported as emptied by it', () => {
	const blob = new Blob(3, 3);
	blob.seed(1, 1, 5);
	blob.clear(1, 1);
	assert.deepEqual(blob.spread(open, 0.5, 1), [], 'clear() emptied it, the step did not');
});

test('an emptied cell is reported with its own coordinates, not its index', () => {
	const blob = new Blob(3, 3);
	blob.seed(2, 1, 0.0005); // index 5, x 2, y 1: a swapped pair would show
	blob.seed(0, 0, 5);
	assert.deepEqual(blob.spread(open, 0, 0.5), [{ x: 2, y: 1 }]);
	assert.ok(blob.volumeAt(0, 0) > 0, 'the cell that survived is not reported');
});
