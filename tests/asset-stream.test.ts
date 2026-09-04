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
