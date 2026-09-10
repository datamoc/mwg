import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as assets from '../src/assets/index.ts';
import { assetDescriptor } from '../src/assets/loader.ts';

test('isLoaded is false for a path never passed to load', () => {
	assert.equal(assets.isLoaded('never/loaded.png'), false);
});

test('release is a no-op for paths that were never loaded, and does not throw', async () => {
	await assert.doesNotReject(assets.release(['never/loaded.png', 'also/missing.png']));
});

test('release with an empty list is a no-op', async () => {
	await assert.doesNotReject(assets.release([]));
});

test('a plain load descriptor carries no loader data', () => {
	//an SVG with no resolution is rasterized by Pixi at its intrinsic size, as before
	assert.deepEqual(assetDescriptor('icon.svg'), { alias: 'icon.svg', src: assets.resolve('icon.svg') });
});

test('a resolution reaches the loader data, so a vector source rasterizes bigger', () => {
	assert.deepEqual(assetDescriptor('icon.svg', 3), {
		alias: 'icon.svg',
		src: assets.resolve('icon.svg'),
		data: { resolution: 3 },
	});
});
