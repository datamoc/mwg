import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSecureUrl } from '../src/core/HttpTransport.ts';
import { NewsClient } from '../src/core/News.ts';
import { SaveSyncClient } from '../src/core/SaveSync.ts';
import { TelemetryClient } from '../src/core/Telemetry.ts';
import { LockstepClient } from '../src/core/Multiplayer.ts';

test('clear-text urls are refused unless they stay on this machine or allowInsecure says so', () => {
	for (const ok of [
		'https://a.example',
		'wss://a.example/room',
		'http://localhost:8080',
		'ws://127.0.0.1:1',
		'http://[::1]/x',
		'/api/news',
	])
		assert.doesNotThrow(() => assertSecureUrl(ok, 'test'), ok);
	assert.throws(
		() => assertSecureUrl('http://a.example/save', 'save sync endpoint'),
		/save sync endpoint url must use https: or wss: \(got http:\/\/a\.example\)/,
	);
	assert.throws(
		() => new TelemetryClient({ endpoint: 'http://t.example' }),
		/telemetry endpoint url must use https:/,
	);
	assert.throws(
		() => new LockstepClient({ url: 'ws://room.example' }),
		/lockstep client url must use https: or wss:/,
	);
	assert.doesNotThrow(() => new TelemetryClient({ endpoint: 'http://t.example', allowInsecure: true }));
	assert.doesNotThrow(() => new LockstepClient({ url: 'ws://room.example', allowInsecure: true }));
});

function streamed(chunks: string[]): Response {
	const encoder = new TextEncoder();
	let index = 0;
	let cancelled = false;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
			else controller.close();
		},
		cancel() {
			cancelled = true;
		},
	});
	const response = { ok: true, status: 200, body, headers: new Headers() } as unknown as Response;
	Object.defineProperty(response, 'cancelled', { get: () => cancelled });
	return response;
}

test('a response body is refused as soon as it passes maxResponseBytes, and the stream is cancelled', async () => {
	const response = streamed(['[', '"x"'.repeat(1), ',"yyyyyyyyyyyy"', ']']);
	const news = new NewsClient({ endpoint: 'https://n.example', fetch: async () => response, maxResponseBytes: 10 });
	await assert.rejects(() => news.fetchItems(), /news response exceeds the 10-byte limit/);
	assert.equal((response as unknown as { cancelled: boolean }).cancelled, true);
});

test('a declared content-length over the limit is refused before reading', async () => {
	const response = {
		ok: true,
		status: 200,
		headers: new Headers({ 'content-length': '999999' }),
		text: async () => assert.fail('read'),
	} as unknown as Response;
	const news = new NewsClient({ endpoint: 'https://n.example', fetch: async () => response, maxResponseBytes: 1000 });
	await assert.rejects(() => news.fetchItems(), /exceeds the 1000-byte limit \(999999 bytes\)/);
});

test('SaveSyncClient reads its JSON envelopes through the inbound pipeline', async () => {
	const sync = new SaveSyncClient({
		endpoint: 'https://s.example',
		fetch: async () => streamed(['{"payload":"p","__proto__":{"x":1}}']),
	});
	await assert.rejects(() => sync.download('slot'), /save sync download contains a forbidden key "__proto__"/);
	const good = new SaveSyncClient({
		endpoint: 'https://s.example',
		fetch: async () => streamed(['{"payload":', '"abc"}']),
	});
	assert.equal(await good.download('slot'), 'abc');
});
