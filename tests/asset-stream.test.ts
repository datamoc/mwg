import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AssetStream } from '../src/assets/Streaming.ts';

test('AssetStream stages likely bundles by descending priority', async () => {
	const loaded: string[] = [];
	const stream = new AssetStream({ load: async (paths) => { loaded.push(...paths); } });

	await stream.preloadLikely([
		{ id: 'far', paths: ['far.png'], priority: 1 },
		{ id: 'next', paths: ['next.png'], priority: 5 },
	]);

	assert.deepEqual(loaded, ['next.png', 'far.png']);
	assert.equal(stream.isReady('next'), true);
});

test('AssetStream evicts least recently used bundles within its budget', async () => {
	const released: string[][] = [];
	const stream = new AssetStream({
		budgetBytes: 10,
		load: async () => {},
		release: async (paths) => { released.push(paths); },
	});

	await stream.preload({ id: 'old', paths: ['old.png'], estimatedBytes: 5 });
	await stream.preload({ id: 'current', paths: ['current.png'], estimatedBytes: 6 });

	assert.equal(stream.isReady('old'), false);
	assert.equal(stream.isReady('current'), true);
	assert.deepEqual(released, [['old.png']]);
});

test('AssetStream retains paths shared with a loaded bundle', async () => {
	const loaded: string[][] = [];
	const released: string[][] = [];
	const stream = new AssetStream({
		load: async (paths) => { loaded.push(paths); },
		release: async (paths) => { released.push(paths); },
	});

	await stream.preload({ id: 'one', paths: ['shared.png', 'one.png'] });
	await stream.preload({ id: 'two', paths: ['shared.png', 'two.png'] });
	await stream.unload('one');
	await stream.unload('two');

	assert.deepEqual(loaded, [['shared.png', 'one.png'], ['two.png']]);
	assert.deepEqual(released, [['one.png'], ['shared.png', 'two.png']]);
});

test('preload forwards its loader\'s progress callback', async () => {
	const seen: number[] = [];
	const stream = new AssetStream({
		load: async (_paths, onProgress) => {
			onProgress?.(0.5);
			onProgress?.(1);
		},
	});

	await stream.preload({ id: 'a', paths: ['a.png'] }, (fraction) => seen.push(fraction));
	assert.deepEqual(seen, [0.5, 1]);
});

test('preload reports full progress immediately for an already-ready bundle or an empty one', async () => {
	const seen: number[] = [];
	const stream = new AssetStream({ load: async () => {} });

	await stream.preload({ id: 'empty', paths: [] }, (fraction) => seen.push(fraction));
	await stream.preload({ id: 'a', paths: ['a.png'] });
	await stream.preload({ id: 'a', paths: ['a.png'] }, (fraction) => seen.push(fraction)); //already ready

	assert.deepEqual(seen, [1, 1]);
});

test('preloadLikely reports one fraction across every bundle in the list', async () => {
	const seen: number[] = [];
	const stream = new AssetStream({
		load: async (_paths, onProgress) => {
			onProgress?.(0.5);
			onProgress?.(1);
		},
	});

	await stream.preloadLikely(
		[
			{ id: 'a', paths: ['a.png'], priority: 2 },
			{ id: 'b', paths: ['b.png'], priority: 1 },
		],
		(fraction) => seen.push(fraction)
	);

	assert.deepEqual(seen, [0.25, 0.5, 0.75, 1, 1]);
});

test('repeated preload/evict cycles under a tight budget never exceed it and release everything evicted', async () => {
	const released = new Set<string>();
	const stream = new AssetStream({
		budgetBytes: 10,
		load: async () => {},
		release: async (paths) => { for (const path of paths) released.add(path); },
	});

	for (let i = 0; i < 50; i++) {
		await stream.preload({ id: `zone-${i}`, paths: [`zone-${i}.png`], estimatedBytes: 5 });
		assert.ok(stream.estimatedBytes <= 10, `budget exceeded after zone-${i}: ${stream.estimatedBytes}`);
	}

	//every zone but the last two (10 bytes of budget, 5 bytes each) must have been evicted and released
	assert.equal(released.size, 48);
	assert.equal(stream.isReady('zone-49'), true);
	assert.equal(stream.isReady('zone-48'), true);
	assert.equal(stream.isReady('zone-0'), false);
});
