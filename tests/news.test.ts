import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NewsClient, NewsSeenTracker } from '../src/core/News.ts';
import type { SaveStorage } from '../src/core/Save.ts';

function memoryStorage(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

function fakeResponse(body: unknown, ok = true, status = 200): Response {
	return { ok, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

// ------------------------------------------------------------------- NewsClient

test('fetchItems returns normalized items from a well-formed response', async () => {
	const client = new NewsClient({
		endpoint: 'https://example.test/news',
		fetch: (async () =>
			fakeResponse([
				{ id: 'a', title: 'Patch 1.1', body: 'Fixed things.', publishedAt: 1000 },
				{ id: 'b', title: 'Patch 1.2', body: 'Fixed more things.' },
			])) as typeof fetch,
	});

	const items = await client.fetchItems();
	assert.equal(items.length, 2);
	assert.equal(items[0].publishedAt, 1000);
	assert.equal(items[1].publishedAt, undefined);
});

test('fetchItems rejects a response that is not an array', async () => {
	const client = new NewsClient({
		endpoint: 'https://example.test/news',
		fetch: (async () => fakeResponse({ items: [] })) as typeof fetch,
	});
	await assert.rejects(client.fetchItems(), /not an array/);
});

test('fetchItems rejects an item missing a required field, rather than passing it through', async () => {
	const client = new NewsClient({
		endpoint: 'https://example.test/news',
		fetch: (async () => fakeResponse([{ id: 'a', title: 'Missing body' }])) as typeof fetch,
	});
	await assert.rejects(client.fetchItems(), /missing a string body/);
});

test('fetchItems rejects a non-ok response', async () => {
	const client = new NewsClient({
		endpoint: 'https://example.test/news',
		fetch: (async () => fakeResponse([], false, 503)) as typeof fetch,
	});
	await assert.rejects(client.fetchItems(), /503/);
});

test('NewsClient requires a non-empty endpoint and a positive timeout', () => {
	assert.throws(() => new NewsClient({ endpoint: '' }), /endpoint is required/);
	assert.throws(() => new NewsClient({ endpoint: 'https://example.test', timeoutMs: -1 }), /timeout must be positive/);
});

// ------------------------------------------------------------------- NewsSeenTracker

test('an item is unseen until markSeen is called for its id', () => {
	const tracker = new NewsSeenTracker({ namespace: 'test' });
	assert.equal(tracker.isSeen('a'), false);
	tracker.markSeen('a');
	assert.equal(tracker.isSeen('a'), true);
});

test('unseen filters out items already marked seen', () => {
	const tracker = new NewsSeenTracker({ namespace: 'unseen-test' });
	const items = [
		{ id: 'a', title: 'A', body: 'a' },
		{ id: 'b', title: 'B', body: 'b' },
	];
	tracker.markSeen('a');

	assert.deepEqual(
		tracker.unseen(items).map((i) => i.id),
		['b']
	);
});

test('two namespaces do not share seen state', () => {
	const storage = memoryStorage();
	const a = new NewsSeenTracker({ namespace: 'a', storage });
	const b = new NewsSeenTracker({ namespace: 'b', storage });

	a.markSeen('shared-id');
	assert.equal(a.isSeen('shared-id'), true);
	assert.equal(b.isSeen('shared-id'), false);
});
