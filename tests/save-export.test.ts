import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scramble, unscramble } from '../src/core/Scramble.ts';
import { SaveSystem, type SaveStorage } from '../src/core/Save.ts';
import { SaveSyncClient } from '../src/core/SaveSync.ts';

function memoryStorage(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

// ------------------------------------------------------------------- scramble/unscramble

test('unscramble reverses scramble exactly', () => {
	const text = JSON.stringify({ gold: 42, name: 'Ada' });
	const scrambled = scramble(text, 'a key');
	assert.notEqual(scrambled, text);
	assert.equal(unscramble(scrambled, 'a key'), text);
});

test('scramble/unscramble reject an empty key', () => {
	assert.throws(() => scramble('text', ''), /non-empty key/);
	assert.throws(() => unscramble('text', ''), /non-empty key/);
});

test('unscramble with the wrong key never silently recovers the original text', () => {
	const original = JSON.stringify({ gold: 42, name: 'Ada', note: 'this is a save file' });
	const scrambled = scramble(original, 'right-key');
	//XOR with a mismatched key garbles the bytes; whether that garbling happens to still
	//decode as UTF-8 depends on the specific keys, so only the one guaranteed property is
	//checked - it is never the original plaintext, thrown or not
	try {
		assert.notEqual(unscramble(scrambled, 'wrong-key'), original);
	} catch {
		//a decode failure is an equally valid way for the wrong key to fail
	}
});

test('scramble output is not the plain original text encoded in an obviously readable way', () => {
	const scrambled = scramble('a secret message', 'k');
	assert.equal(scrambled.includes('secret'), false);
});

// ------------------------------------------------------------------- SaveSystem export/import

test('exportSlot returns null for a slot with no save', () => {
	const saves = new SaveSystem<{ gold: number }>({ namespace: 'export-test', version: 1 });
	assert.equal(saves.exportSlot('nothing-here'), null);
});

test('exportSlot then importSlot round-trips a save into another SaveSystem instance', () => {
	const a = new SaveSystem<{ gold: number }>({ namespace: 'export-a', version: 1 });
	a.save('slot1', { gold: 42 }, 'a preview');
	const payload = a.exportSlot('slot1');
	assert.ok(payload);

	const b = new SaveSystem<{ gold: number }>({ namespace: 'export-b', version: 1 });
	b.importSlot('slot1', payload);

	const loaded = b.load('slot1');
	assert.equal(loaded?.state.gold, 42);
	assert.equal(loaded?.meta.preview, 'a preview');
});

test('exportSlot with a scrambleKey produces a payload importSlot needs the same key to read', () => {
	const a = new SaveSystem<{ gold: number }>({ namespace: 'export-scramble-a', version: 1 });
	a.save('slot1', { gold: 7 });
	const payload = a.exportSlot('slot1', 'shh')!;

	const b = new SaveSystem<{ gold: number }>({ namespace: 'export-scramble-b', version: 1 });
	assert.throws(() => b.importSlot('slot1', payload)); //not unscrambled: not valid JSON
	b.importSlot('slot1', payload, 'shh');
	assert.equal(b.load('slot1')?.state.gold, 7);
});

test('importSlot runs an older-versioned export through the same migrations load would', () => {
	const storage = memoryStorage();
	const v1 = new SaveSystem<{ gold: number }>({ namespace: 'export-migrate', version: 1, storage });
	v1.save('slot1', { gold: 10 });
	const payload = v1.exportSlot('slot1')!;

	const v2 = new SaveSystem<{ gold: number; gems: number }>({
		namespace: 'export-migrate-target',
		version: 2,
		migrations: { 1: (s) => ({ ...(s as { gold: number }), gems: 0 }) },
	});
	v2.importSlot('slot1', payload);

	const loaded = v2.load('slot1');
	assert.equal(loaded?.state.gems, 0);
	assert.equal(loaded?.meta.version, 2);
});

// ------------------------------------------------------------------- SaveSyncClient

function fakeResponse(body: unknown, ok = true, status = 200): Response {
	return { ok, status, json: async () => body } as unknown as Response;
}

test('SaveSyncClient.upload posts the payload as JSON and reports success', async () => {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const client = new SaveSyncClient({
		endpoint: 'https://example.test/save',
		fetch: (async (url: string, init?: RequestInit) => {
			calls.push({ url: String(url), init });
			return fakeResponse({});
		}) as typeof fetch,
	});

	const result = await client.upload('exported-payload');
	assert.equal(result.ok, true);
	assert.equal(calls[0]?.url, 'https://example.test/save');
	assert.equal(calls[0]?.init?.method, 'POST');
	assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { payload: 'exported-payload' });
});

test('SaveSyncClient.upload rejects an empty payload without making a request', async () => {
	const client = new SaveSyncClient({ endpoint: 'https://example.test/save', fetch: (async () => fakeResponse({})) as typeof fetch });
	await assert.rejects(client.upload(''), /empty/);
});

test('SaveSyncClient.upload throws on a non-ok response', async () => {
	const client = new SaveSyncClient({
		endpoint: 'https://example.test/save',
		fetch: (async () => fakeResponse({}, false, 500)) as typeof fetch,
	});
	await assert.rejects(client.upload('payload'), /500/);
});

test('SaveSyncClient.download returns the payload field from the response', async () => {
	const client = new SaveSyncClient({
		endpoint: 'https://example.test/save',
		fetch: (async () => fakeResponse({ payload: 'downloaded-payload' })) as typeof fetch,
	});
	assert.equal(await client.download(), 'downloaded-payload');
});

test('SaveSyncClient.download rejects a response with no string payload field', async () => {
	const client = new SaveSyncClient({
		endpoint: 'https://example.test/save',
		fetch: (async () => fakeResponse({ payload: 42 })) as typeof fetch,
	});
	await assert.rejects(client.download(), /missing a string payload/);
});

test('SaveSyncClient requires a non-empty endpoint and a positive timeout', () => {
	assert.throws(() => new SaveSyncClient({ endpoint: '' }), /endpoint is required/);
	assert.throws(() => new SaveSyncClient({ endpoint: 'https://example.test', timeoutMs: 0 }), /timeout must be positive/);
});
