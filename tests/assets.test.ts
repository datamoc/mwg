import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as assets from '../src/assets/index.ts';

test('isLoaded is false for a path never passed to load', () => {
	assert.equal(assets.isLoaded('never/loaded.png'), false);
});

test('release is a no-op for paths that were never loaded, and does not throw', async () => {
	await assert.doesNotReject(assets.release(['never/loaded.png', 'also/missing.png']));
});

test('release with an empty list is a no-op', async () => {
	await assert.doesNotReject(assets.release([]));
});

test('texture with a fallback returns it instead of throwing for a path never loaded', () => {
	const fallback = {} as ReturnType<typeof assets.texture>;
	assert.equal(assets.texture('never/loaded.png', fallback), fallback);
});

test('texture with no fallback still throws for a path never loaded', () => {
	assert.throws(() => assets.texture('never/loaded.png'));
});

test('get with a fallback returns it instead of throwing for a path never loaded', () => {
	assert.deepEqual(assets.get('never/loaded.json', { placeholder: true }), { placeholder: true });
});

test('get with no fallback still throws for a path never loaded', () => {
	assert.throws(() => assets.get('never/loaded.json'));
});
