import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gridPoint3D } from '../src/three-d/Grid.ts';
import { buildHeightIndex, cellAt, heightAt, resolveCapsuleAgainstGrid } from '../src/three-d/Collision3D.ts';
import type { GridCell3D } from '../src/three-d/Grid.ts';

test('cellAt is the inverse of gridPoint3D for square cells', () => {
	const point = gridPoint3D('square', 4, -3, 2);
	assert.deepEqual(cellAt('square', point.x, point.z, 2), { x: 4, y: -3 });
});

test('cellAt is the inverse of gridPoint3D for hex cells, both parities', () => {
	for (const x of [0, 1, 2, 3]) {
		const point = gridPoint3D('hex', x, 5, 1.3);
		assert.deepEqual(cellAt('hex', point.x, point.z, 1.3), { x, y: 5 }, `column ${x}`);
	}
});

test('cellAt rejects non-positive tileSize', () => {
	assert.throws(() => cellAt('square', 0, 0, 0), /positive/);
});

test('heightAt reads a cell height by world position, and is null off the grid', () => {
	const cells: GridCell3D[] = [{ x: 0, y: 0, height: 0 }, { x: 1, y: 0, height: 2 }];
	const index = buildHeightIndex(cells);
	assert.equal(heightAt(index, 'square', 0, 0), 0);
	assert.equal(heightAt(index, 'square', 1, 0), 2);
	assert.equal(heightAt(index, 'square', 5, 5), null);
});

test('a cell with no explicit height defaults to 0, same as createTileGrid3D itself treats it', () => {
	const index = buildHeightIndex([{ x: 0, y: 0 }]);
	assert.equal(heightAt(index, 'square', 0, 0), 0);
});

test('resolveCapsuleAgainstGrid passes straight through when every sampled cell is level ground', () => {
	const index = buildHeightIndex([
		{ x: 0, y: 0, height: 0 }, { x: 1, y: 0, height: 0 }, { x: 2, y: 0, height: 0 },
	]);
	const result = resolveCapsuleAgainstGrid({ x: 0, z: 0 }, { x: 2, z: 0 }, { shape: 'square', heights: index });
	assert.deepEqual(result, { x: 2, z: 0, blocked: false });
});

test('resolveCapsuleAgainstGrid stops at a raised column instead of clipping through it - the exact bug item 144 reported', () => {
	//a flat 2-wide strip with a column raised to height 2 right after it, the same shape
	//examples/three-d's own ridge (`x >= 6 && y >= 5`) had before its own demo path was routed
	//around it - here the collision check does the routing instead
	const cells: GridCell3D[] = [];
	for (let x = 0; x <= 4; x++) cells.push({ x, y: 0, height: x >= 3 ? 2 : 0 });
	const index = buildHeightIndex(cells);

	const result = resolveCapsuleAgainstGrid({ x: 0, z: 0 }, { x: 4, z: 0 }, { shape: 'square', heights: index, maxStepUp: 0, steps: 16 });

	assert.equal(result.blocked, true);
	assert.ok(result.x < 3, `expected to stop before the raised column at x=3, stopped at x=${result.x}`);
	assert.ok(result.x >= 2, `expected to travel across the flat ground first, stopped at x=${result.x}`);
});

test('resolveCapsuleAgainstGrid allows climbing a step within maxStepUp', () => {
	const cells: GridCell3D[] = [{ x: 0, y: 0, height: 0 }, { x: 1, y: 0, height: 1 }];
	const index = buildHeightIndex(cells);

	const blocked = resolveCapsuleAgainstGrid({ x: 0, z: 0 }, { x: 1, z: 0 }, { shape: 'square', heights: index, maxStepUp: 0 });
	assert.equal(blocked.blocked, true, 'a step of 1 must block when maxStepUp is 0');

	const allowed = resolveCapsuleAgainstGrid({ x: 0, z: 0 }, { x: 1, z: 0 }, { shape: 'square', heights: index, maxStepUp: 1 });
	assert.deepEqual(allowed, { x: 1, z: 0, blocked: false });
});

test('resolveCapsuleAgainstGrid stops at the edge of the grid, a hole blocking like a wall', () => {
	const index = buildHeightIndex([{ x: 0, y: 0, height: 0 }]);
	const result = resolveCapsuleAgainstGrid({ x: 0, z: 0 }, { x: 3, z: 0 }, { shape: 'square', heights: index });
	assert.equal(result.blocked, true);
	assert.ok(result.x < 1, `expected to stop at the edge of the one known cell, stopped at x=${result.x}`);
});

test('resolveCapsuleAgainstGrid rejects a non-positive step count', () => {
	const index = buildHeightIndex([{ x: 0, y: 0 }]);
	assert.throws(() => resolveCapsuleAgainstGrid({ x: 0, z: 0 }, { x: 1, z: 0 }, { shape: 'square', heights: index, steps: 0 }), /positive/);
});
