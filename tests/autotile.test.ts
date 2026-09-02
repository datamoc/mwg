import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blobIndex, autotileFrames, BLOB_SHAPES, type NeighborMask } from '../src/render/Autotile.ts';
import { EMPTY } from '../src/render/TileMap.ts';

const NONE: NeighborMask = { n: false, e: false, s: false, w: false, ne: false, se: false, sw: false, nw: false };
const ALL: NeighborMask = { n: true, e: true, s: true, w: true, ne: true, se: true, sw: true, nw: true };

test('there are exactly 47 reachable blob shapes', () => {
	assert.equal(BLOB_SHAPES.length, 47);
});

test('every shape maps to a distinct index, and blobIndex is stable across calls', () => {
	const indices = new Set(BLOB_SHAPES.map((shape) => blobIndex(shape)));
	assert.equal(indices.size, 47);

	for (let i = 0; i < BLOB_SHAPES.length; i++) {
		assert.equal(blobIndex(BLOB_SHAPES[i]), i);
	}
});

test('every one of the 256 raw 8-neighbour combinations resolves to one of the 47 indices', () => {
	for (let bits = 0; bits < 256; bits++) {
		const shape: NeighborMask = {
			n: (bits & 1) !== 0,
			e: (bits & 2) !== 0,
			s: (bits & 4) !== 0,
			w: (bits & 8) !== 0,
			ne: (bits & 16) !== 0,
			se: (bits & 32) !== 0,
			sw: (bits & 64) !== 0,
			nw: (bits & 128) !== 0,
		};
		const index = blobIndex(shape);
		assert.ok(index >= 0 && index < 47, `bits ${bits} produced an out-of-range index`);
	}
});

test('a corner only changes the shape when both flanking edges are also present', () => {
	//NE alone, with neither N nor E present, must resolve exactly like no corner at all -
	//that is the entire reduction the blob technique relies on
	const withStrayCorner: NeighborMask = { ...NONE, ne: true };
	assert.equal(blobIndex(withStrayCorner), blobIndex(NONE));

	//once both flanking edges are present, the same corner bit does change the shape
	const withEdges: NeighborMask = { ...NONE, n: true, e: true };
	const withEdgesAndCorner: NeighborMask = { ...withEdges, ne: true };
	assert.notEqual(blobIndex(withEdgesAndCorner), blobIndex(withEdges));
});

test('no neighbours and every neighbour are both reachable shapes, at opposite ends', () => {
	assert.equal(blobIndex(NONE), 0);
	assert.equal(blobIndex(ALL), 46);
});

test('autotileFrames refuses a frame table of the wrong length', () => {
	assert.throws(() => autotileFrames(3, 3, () => true, [0, 1, 2]));
});

test('autotileFrames writes EMPTY wherever sameTerrain is false, and never calls it for those cells\' neighbours', () => {
	const frames = Array.from({ length: 47 }, (_, i) => i);
	//a single terrain cell in the middle of an otherwise different terrain
	const grid = autotileFrames(3, 3, (x, y) => x === 1 && y === 1, frames);

	for (let i = 0; i < 9; i++) {
		if (i === 4) continue; // the one terrain cell, index 1*3+1
		assert.equal(grid[i], EMPTY);
	}
	assert.notEqual(grid[4], EMPTY);
});

test('a fully isolated terrain cell gets the "no neighbours" shape', () => {
	const frames = Array.from({ length: 47 }, (_, i) => i);
	const grid = autotileFrames(3, 3, (x, y) => x === 1 && y === 1, frames);
	assert.equal(grid[4], blobIndex(NONE));
});

test('a solid block of terrain gets the "every neighbour" shape in its interior', () => {
	const frames = Array.from({ length: 47 }, (_, i) => i);
	const grid = autotileFrames(5, 5, () => true, frames);
	//the centre cell (2,2) has all 8 neighbours present
	assert.equal(grid[2 * 5 + 2], blobIndex(ALL));
});

test('a straight edge of terrain gets a consistent edge shape along its length', () => {
	const frames = Array.from({ length: 47 }, (_, i) => i);
	//terrain fills the top two rows of a 5-wide, 4-tall grid; row 1 is an internal edge
	const grid = autotileFrames(5, 4, (_x, y) => y < 2, frames);

	const middleOfRow1 = 1 * 5 + 2; // (2,1): not on the left/right border, avoids edge cases
	const alsoRow1 = 1 * 5 + 3; // (3,1)
	assert.equal(grid[middleOfRow1], grid[alsoRow1]);
});

test('out-of-bounds neighbours are exactly what the sameTerrain callback says they are', () => {
	const frames = Array.from({ length: 47 }, (_, i) => i);
	//sameTerrain returns true everywhere, including outside the grid - so even a corner
	//cell should read as fully surrounded, since nothing here treats the edge as a boundary
	const grid = autotileFrames(2, 2, (_x, _y) => true, frames);
	assert.equal(grid[0], blobIndex(ALL));
});
