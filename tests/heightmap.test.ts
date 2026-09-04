import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHeightmapTerrain3D } from '../src/three-d/Heightmap.ts';

/**
 * `createHeightmapTerrain3D` needs a real Babylon `Scene` past its own argument validation
 * (verified visually via the three-d example, like every other `mwg/3d` mesh builder), so
 * this only exercises the guards that run before any Babylon call - a fake `scene` never
 * needs to be touched for a request already rejected on its own shape.
 */

test('rejects a non-positive width or height', () => {
	const data = new Uint8Array(4);
	assert.throws(() => createHeightmapTerrain3D({} as never, { data, width: 0, height: 1 }), /positive dimensions/);
	assert.throws(() => createHeightmapTerrain3D({} as never, { data, width: 1, height: 0 }), /positive dimensions/);
});

test('rejects pixel data shorter than width * height * 4 (RGBA)', () => {
	const data = new Uint8Array(3 * 3 * 4 - 1);
	assert.throws(() => createHeightmapTerrain3D({} as never, { data, width: 3, height: 3 }), /RGBA/);
});

test('accepts exactly width * height * 4 bytes without throwing on the guard itself', () => {
	const data = new Uint8Array(2 * 2 * 4);
	//past this point it needs a real Scene; reaching that call (not the guard) is the pass condition
	assert.throws(() => createHeightmapTerrain3D({} as never, { data, width: 2, height: 2 }), (error: unknown) =>
		!(error instanceof Error) || !/positive dimensions|RGBA/.test(error.message)
	);
});
