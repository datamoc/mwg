import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gridPoint3D } from '../src/three-d/Grid.ts';

test('square cells map directly onto the XZ plane with elevation on Y', () => {
	assert.deepEqual(gridPoint3D('square', 2, 3, 4, 2, 1.5), { x: 8, y: 3, z: 12 });
});

test('odd-q hex columns are offset by half a row', () => {
	const even = gridPoint3D('hex', 0, 1, 2);
	const odd = gridPoint3D('hex', 1, 1, 2);
	assert.equal(even.x, 0);
	assert.equal(odd.x, 3);
	assert.ok(Math.abs(odd.z - even.z - Math.sqrt(3)) < 1e-12);
});

test('grid projection rejects invalid scale', () => {
	assert.throws(() => gridPoint3D('square', 0, 0, 0), /positive/);
});
