import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aabbOverlap, circleOverlap, circleAabbOverlap, resolveAabbAgainstTiles } from '../src/rpg/Collision.ts';

test('aabbOverlap detects overlap and touching-but-not-overlapping boxes as separate', () => {
	assert.equal(aabbOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), true);
	assert.equal(aabbOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }), false);
	assert.equal(aabbOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 }), false);
});

test('circleOverlap compares distance against the summed radii', () => {
	assert.equal(circleOverlap({ x: 0, y: 0, radius: 5 }, { x: 8, y: 0, radius: 5 }), true);
	assert.equal(circleOverlap({ x: 0, y: 0, radius: 5 }, { x: 12, y: 0, radius: 5 }), false);
});

test('circleAabbOverlap catches a circle whose centre is outside the box but close to a corner', () => {
	const box = { x: 0, y: 0, width: 10, height: 10 };
	assert.equal(circleAabbOverlap({ x: 12, y: 12, radius: 4 }, box), true);
	assert.equal(circleAabbOverlap({ x: 20, y: 20, radius: 4 }, box), false);
	assert.equal(circleAabbOverlap({ x: 5, y: 5, radius: 1 }, box), true);
});

function gridSolid(solid: readonly [number, number][]): (x: number, y: number) => boolean {
	const set = new Set(solid.map(([x, y]) => `${x},${y}`));
	return (x, y) => set.has(`${x},${y}`);
}

test('resolveAabbAgainstTiles moves freely when nothing is solid', () => {
	const isSolid = gridSolid([]);
	const result = resolveAabbAgainstTiles({ x: 0, y: 0, width: 8, height: 8 }, 5, 3, { tileSize: 16, isSolid });
	assert.deepEqual(result, { x: 5, y: 3 });
});

test('resolveAabbAgainstTiles stops flush against a solid tile to the right', () => {
	const isSolid = gridSolid([[2, 0]]); // solid tile at world x:[32,48), y:[0,16)
	const result = resolveAabbAgainstTiles({ x: 20, y: 0, width: 8, height: 8 }, 20, 0, { tileSize: 16, isSolid });
	assert.equal(result.x, 24); // 32 (tile edge) - 8 (box width)
	assert.equal(result.y, 0);
});

test('resolveAabbAgainstTiles stops flush against a solid tile to the left', () => {
	const isSolid = gridSolid([[1, 0]]); // world x:[16,32)
	const result = resolveAabbAgainstTiles({ x: 40, y: 0, width: 8, height: 8 }, -30, 0, { tileSize: 16, isSolid });
	assert.equal(result.x, 32); // right edge of the solid tile
});

test('resolveAabbAgainstTiles resolves x and y independently, so sliding along a wall works', () => {
	//solid tile directly to the right; moving diagonally should stop x but still allow y
	const isSolid = gridSolid([[2, 0]]);
	const result = resolveAabbAgainstTiles({ x: 20, y: 0, width: 8, height: 8 }, 20, 10, { tileSize: 16, isSolid });
	assert.equal(result.x, 24);
	assert.equal(result.y, 10);
});

test('resolveAabbAgainstTiles catches a fast move that would otherwise tunnel through a thin wall', () => {
	const isSolid = gridSolid([[3, 0]]); // world x:[48,64)
	//moving 100 units in one step, far past the wall if unresolved
	const result = resolveAabbAgainstTiles({ x: 0, y: 0, width: 8, height: 8 }, 100, 0, { tileSize: 16, isSolid });
	assert.equal(result.x, 40); // 48 - 8
});

test('resolveAabbAgainstTiles checks every row/column the box spans, not just its corner', () => {
	//a tall box moving right must be blocked even if the solid tile is only level with its bottom half
	const isSolid = gridSolid([[2, 1]]); // world x:[32,48), y:[16,32)
	const result = resolveAabbAgainstTiles({ x: 20, y: 10, width: 8, height: 20 }, 20, 0, { tileSize: 16, isSolid });
	assert.equal(result.x, 24);
});

test('resolveAabbAgainstTiles rejects a non-positive tileSize', () => {
	assert.throws(() => resolveAabbAgainstTiles({ x: 0, y: 0, width: 8, height: 8 }, 1, 0, { tileSize: 0, isSolid: () => false }));
});
