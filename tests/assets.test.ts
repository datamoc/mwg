import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Assets } from 'pixi.js';

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

test('load() supplies a format hint for a compiled data: URI asset, since the URI itself has none (item 308)', async () => {
	const added: { alias: string; src: string; format?: string }[] = [];
	const originalAdd = Assets.add.bind(Assets);
	const originalLoad = Assets.load.bind(Assets);
	//real Assets.load would try to decode the (deliberately truncated) data: URI as a texture,
	//which Node has no image decoder for - the descriptor Assets.add receives is what this
	//test is actually about, so loading itself is stubbed out rather than exercised
	(Assets as unknown as { add: typeof Assets.add }).add = ((descriptor: (typeof added)[number]) => {
		added.push(descriptor);
	}) as typeof Assets.add;
	(Assets as unknown as { load: typeof Assets.load }).load = (async () => undefined) as unknown as typeof Assets.load;
	try {
		await withCompiledAssets({ 'format-hint/tiles.png': 'data:image/png;base64,AAAA' }, () =>
			assets.load(['format-hint/tiles.png']),
		);
	} finally {
		Assets.add = originalAdd;
		Assets.load = originalLoad;
	}

	assert.equal(added.length, 1);
	assert.equal(added[0].src, 'data:image/png;base64,AAAA');
	assert.equal(added[0].format, 'png', 'the format Pixi cannot read from an extension-less data: URI');
});

test('load() does not set a format hint for a plain dev-server path, which already has its own extension', async () => {
	const added: { alias: string; src: string; format?: string }[] = [];
	const originalAdd = Assets.add.bind(Assets);
	const originalLoad = Assets.load.bind(Assets);
	(Assets as unknown as { add: typeof Assets.add }).add = ((descriptor: (typeof added)[number]) => {
		added.push(descriptor);
	}) as typeof Assets.add;
	(Assets as unknown as { load: typeof Assets.load }).load = (async () => undefined) as unknown as typeof Assets.load;
	try {
		await assets.load(['format-hint/dev-tiles.png']);
	} finally {
		Assets.add = originalAdd;
		Assets.load = originalLoad;
	}

	assert.equal(added.length, 1);
	assert.equal(added[0].src, 'format-hint/dev-tiles.png');
	assert.equal(added[0].format, undefined);
});

test('setAssetMap(undefined) reverts to window.__MWG_ASSETS__ / dev-server mode', () => {
	assets.setAssetMap({ 'tiles.png': 'data:image/png;base64,CCCC' });
	assets.setAssetMap(undefined);
	assert.equal(assets.isCompiled(), false);
	assert.equal(assets.resolve('tiles.png'), 'tiles.png');
});
