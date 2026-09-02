import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Blob } from '../src/roguelike/Blob.ts';

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
