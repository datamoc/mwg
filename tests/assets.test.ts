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

test("load() takes the format hint from the data: URI's own MIME type, not a stale path extension (item 350)", async () => {
	// tools/compile-resources.mjs's toWebp option keeps an asset's key as "sprite.png" (so dev
	// and built modes agree) but can compile it into image/webp bytes when that is smaller. The
	// path's own extension would tell Pixi's resolver to run the PNG parser over WebP data.
	const added: { alias: string; src: string; format?: string }[] = [];
	const originalAdd = Assets.add.bind(Assets);
	const originalLoad = Assets.load.bind(Assets);
	(Assets as unknown as { add: typeof Assets.add }).add = ((descriptor: (typeof added)[number]) => {
		added.push(descriptor);
	}) as typeof Assets.add;
	(Assets as unknown as { load: typeof Assets.load }).load = (async () => undefined) as unknown as typeof Assets.load;
	try {
		await withCompiledAssets({ 'format-hint/sprite.png': 'data:image/webp;base64,AAAA' }, () =>
			assets.load(['format-hint/sprite.png']),
		);
	} finally {
		Assets.add = originalAdd;
		Assets.load = originalLoad;
	}

	assert.equal(added.length, 1);
	assert.equal(added[0].format, 'webp', 'the embedded bytes are WebP, regardless of the ".png" path');
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

/** runs `body` with Pixi's add and load stubbed, returning every descriptor that reached `Assets.add` */
async function recordAssetAdds(body: () => Promise<void>): Promise<{ alias: string; src: string; format?: string }[]> {
	const added: { alias: string; src: string; format?: string }[] = [];
	const originalAdd = Assets.add.bind(Assets);
	const originalLoad = Assets.load.bind(Assets);
	(Assets as unknown as { add: typeof Assets.add }).add = ((descriptor: (typeof added)[number]) => {
		added.push(descriptor);
	}) as typeof Assets.add;
	(Assets as unknown as { load: typeof Assets.load }).load = (async () => undefined) as unknown as typeof Assets.load;
	try {
		await body();
	} finally {
		Assets.add = originalAdd;
		Assets.load = originalLoad;
	}
	return added;
}

test('a blob: URL in the map gets its format from the path extension', async () => {
	assets.setAssetMap({ 'assets/img/blob-a.png': 'blob:http://game.test/abc' });
	try {
		const added = await recordAssetAdds(() => assets.load(['assets/img/blob-a.png']));
		assert.equal(added[0].src, 'blob:http://game.test/abc');
		assert.equal(
			added[0].format,
			'png',
			'a blob: URL has no extension of its own, so the path supplies the parser',
		);
	} finally {
		assets.setAssetMap(undefined);
	}
});

test('a typed Blob is minted to a blob: URL, and its MIME type beats the path extension', async () => {
	assets.setAssetMap({ 'assets/img/typed.png': new Blob([new Uint8Array([1, 2])], { type: 'image/webp' }) });
	try {
		const added = await recordAssetAdds(() => assets.load(['assets/img/typed.png']));
		assert.match(added[0].src, /^blob:/);
		assert.equal(added[0].format, 'webp', 'the bytes are WebP, whatever the ".png" path says');
	} finally {
		assets.setAssetMap(undefined);
	}
});

test('a lazy value is read once, however many loads ask for it', async () => {
	let reads = 0;
	assets.setAssetMap({
		'assets/data/lazy.json': async () => {
			reads += 1;
			return { bytes: new TextEncoder().encode('{}'), type: 'application/json' };
		},
	});
	try {
		const first = await recordAssetAdds(() => assets.load(['assets/data/lazy.json']));
		const second = await recordAssetAdds(() => assets.load(['assets/data/lazy.json']));
		assert.equal(reads, 1);
		assert.equal(first[0].src, second[0].src);
		assert.equal(first[0].format, 'json', 'application/json has no texture format, so the path extension is used');
	} finally {
		assets.setAssetMap(undefined);
	}
});

test('resolve() refuses typed bytes that load() has not read yet, and names load()', () => {
	assets.setAssetMap({ 'assets/img/unread.png': new Blob([new Uint8Array([1])], { type: 'image/png' }) });
	try {
		assert.throws(
			() => assets.resolve('assets/img/unread.png'),
			/call load\(\['assets\/img\/unread\.png'\]\) first/,
		);
	} finally {
		assets.setAssetMap(undefined);
	}
});

test('release revokes the blob: URL it minted, and a later load mints a fresh one', async () => {
	assets.setAssetMap({ 'assets/img/released.png': new Blob([new Uint8Array([1])], { type: 'image/png' }) });
	const originalRevoke = URL.revokeObjectURL;
	const revoked: string[] = [];
	URL.revokeObjectURL = (url: string) => {
		revoked.push(url);
	};
	try {
		const [first] = await recordAssetAdds(() => assets.load(['assets/img/released.png']));
		await assets.release(['assets/img/released.png']);
		assert.deepEqual(revoked, [first.src]);
		assert.throws(() => assets.resolve('assets/img/released.png'), /call load/);
		const [second] = await recordAssetAdds(() => assets.load(['assets/img/released.png']));
		assert.notEqual(second.src, first.src);
	} finally {
		URL.revokeObjectURL = originalRevoke;
		assets.setAssetMap(undefined);
	}
});

test('a key missing from a typed map still throws at load time', async () => {
	assets.setAssetMap({ 'assets/img/present.png': 'data:image/png;base64,AAAA' });
	try {
		await assert.rejects(
			recordAssetAdds(() => assets.load(['assets/img/absent.png'])),
			/is not in this build/,
		);
	} finally {
		assets.setAssetMap(undefined);
	}
});
