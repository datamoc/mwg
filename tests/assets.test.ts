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

// `resolve`/`has`/`paths`/`isCompiled` read `window.__MWG_ASSETS__` at call time - the map a
// compiled build installs - and Node has no `window`, so these install one for the duration of a
// test. That is the whole `file://` contract: the same calls take the compiled branch here and
// the dev-server branch in every other test.
function withCompiledAssets<T>(map: Record<string, string>, body: () => T): T {
	const holder = globalThis as unknown as { window?: unknown };
	const previous = holder.window;
	holder.window = { __MWG_ASSETS__: map };
	try {
		return body();
	} finally {
		if (previous === undefined) delete holder.window;
		else holder.window = previous;
	}
}

test('a compiled build resolves an asset to its data URI, and reports the map', () => {
	withCompiledAssets({ 'tiles.png': 'data:image/png;base64,AAAA' }, () => {
		assert.equal(assets.isCompiled(), true);
		assert.equal(assets.resolve('tiles.png'), 'data:image/png;base64,AAAA');
		assert.deepEqual(assets.paths(), ['tiles.png']);
		assert.equal(assets.has('tiles.png'), true);
	});
});

test('a compiled build refuses a path its map does not carry, rather than guessing', () => {
	withCompiledAssets({ 'tiles.png': 'data:image/png;base64,AAAA' }, () => {
		assert.equal(assets.has('missing.png'), false);
		assert.throws(() => assets.resolve('missing.png'), /is not in this build/);
	});
});

test('without a compiled map, lookups are dev paths and every name is assumed present', () => {
	assert.equal(assets.isCompiled(), false);
	assert.equal(assets.resolve('tiles.png'), 'tiles.png');
	assert.equal(assets.has('anything.png'), true, 'no map to test against, so nothing is refused');
	assert.deepEqual(assets.paths(), []);
});

test('setBase prefixes a dev path and normalizes a missing trailing slash', () => {
	try {
		assets.setBase('assets');
		assert.equal(assets.resolve('tiles.png'), 'assets/tiles.png');
		assets.setBase('assets/');
		assert.equal(assets.resolve('tiles.png'), 'assets/tiles.png');
		assets.setBase('');
		assert.equal(assets.resolve('tiles.png'), 'tiles.png', 'the empty base adds nothing');
	} finally {
		assets.setBase('');
	}
});

test('setAssetMap hands resolve/has/paths a game-supplied map, with no window needed', () => {
	try {
		assets.setAssetMap({ 'tiles.png': 'data:image/png;base64,BBBB' });
		assert.equal(assets.isCompiled(), true);
		assert.equal(assets.resolve('tiles.png'), 'data:image/png;base64,BBBB');
		assert.deepEqual(assets.paths(), ['tiles.png']);
		assert.equal(assets.has('missing.png'), false);
	} finally {
		assets.setAssetMap(undefined);
	}
});

test('setAssetMap takes priority over window.__MWG_ASSETS__', () => {
	withCompiledAssets({ 'tiles.png': 'data:image/png;base64,FROM_WINDOW' }, () => {
		try {
			assets.setAssetMap({ 'tiles.png': 'data:image/png;base64,FROM_MAP' });
			assert.equal(assets.resolve('tiles.png'), 'data:image/png;base64,FROM_MAP');
		} finally {
			assets.setAssetMap(undefined);
		}
	});
});

test('setAssetMap(undefined) reverts to window.__MWG_ASSETS__ / dev-server mode', () => {
	assets.setAssetMap({ 'tiles.png': 'data:image/png;base64,CCCC' });
	assets.setAssetMap(undefined);
	assert.equal(assets.isCompiled(), false);
	assert.equal(assets.resolve('tiles.png'), 'tiles.png');
});
