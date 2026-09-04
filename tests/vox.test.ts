import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseVox } from '../src/three-d/Vox.ts';

test('parseVox reads dimensions and voxel coordinates', () => {
	const bytes = voxFixture();
	const model = parseVox(bytes);
	assert.deepEqual(model.size, { x: 3, y: 4, z: 5 });
	assert.deepEqual(model.voxels, [{ x: 1, y: 2, z: 3, color: 7 }]);
});

test('parseVox rejects missing and truncated chunks', () => {
	assert.throws(() => parseVox(new Uint8Array(20)), /header/);
	const bytes = voxFixture();
	assert.throws(() => parseVox(bytes.subarray(0, bytes.length - 1)), /truncated/);
});

function voxFixture(): Uint8Array {
	const size = chunk('SIZE', uints(3, 4, 5));
	const xyzi = chunk('XYZI', new Uint8Array([...uints(1), 1, 2, 3, 7]));
	const children = new Uint8Array([...size, ...xyzi]);
	const main = chunk('MAIN', new Uint8Array(), children.length);
	return new Uint8Array([...'VOX '.split('').map((value) => value.charCodeAt(0)), ...uints(150), ...main, ...children]);
}

function chunk(id: string, content: Uint8Array, children = 0): Uint8Array {
	return new Uint8Array([
		...id.split('').map((value) => value.charCodeAt(0)),
		...uints(content.length),
		...uints(children),
		...content,
	]);
}

function uints(...values: number[]): Uint8Array {
	const bytes = new Uint8Array(values.length * 4);
	const view = new DataView(bytes.buffer);
	values.forEach((value, index) => view.setUint32(index * 4, value, true));
	return bytes;
}
