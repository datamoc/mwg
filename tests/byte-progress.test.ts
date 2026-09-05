import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithByteProgress } from '../src/assets/ByteProgress.ts';
import type { ByteProgress } from '../src/assets/ByteProgress.ts';

function fakeResponse(chunks: Uint8Array[], contentLength?: number): typeof fetch {
	return (async () => {
		let index = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (index < chunks.length) {
					controller.enqueue(chunks[index++]);
				} else {
					controller.close();
				}
			},
		});
		const headers = new Headers();
		if (contentLength !== undefined) headers.set('content-length', String(contentLength));
		return new Response(body, { status: 200, headers });
	}) as unknown as typeof fetch;
}

test('reports real cumulative bytes as chunks arrive, and the known total from Content-Length', () => {
	const chunks = [new Uint8Array(10), new Uint8Array(15), new Uint8Array(5)];
	const seen: ByteProgress[] = [];

	return fetchWithByteProgress('asset.bin', (p) => seen.push({ ...p }), fakeResponse(chunks, 30)).then((blob) => {
		assert.deepEqual(seen, [
			{ loaded: 10, total: 30 },
			{ loaded: 25, total: 30 },
			{ loaded: 30, total: 30 },
		]);
		assert.equal(blob.size, 30);
	});
});

test('total is null when the server never sends Content-Length', async () => {
	const seen: ByteProgress[] = [];
	await fetchWithByteProgress('asset.bin', (p) => seen.push({ ...p }), fakeResponse([new Uint8Array(4)]));
	assert.equal(seen[0].total, null);
});

test('progress is optional - fetchWithByteProgress still resolves without a callback', async () => {
	const blob = await fetchWithByteProgress('asset.bin', undefined, fakeResponse([new Uint8Array(7)]));
	assert.equal(blob.size, 7);
});

test('a non-ok response throws rather than resolving to an empty blob', async () => {
	const fetchFn = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
	await assert.rejects(() => fetchWithByteProgress('missing.bin', undefined, fetchFn), /404/);
});

test('a response with no body (e.g. HEAD-shaped) falls back to response.blob() and still reports a final progress', async () => {
	const fetchFn = (async () => {
		const response = new Response(new Uint8Array(12), { status: 200 });
		Object.defineProperty(response, 'body', { value: null });
		return response;
	}) as unknown as typeof fetch;

	const seen: ByteProgress[] = [];
	const blob = await fetchWithByteProgress('asset.bin', (p) => seen.push(p), fetchFn);
	assert.equal(blob.size, 12);
	assert.deepEqual(seen, [{ loaded: 12, total: 12 }]);
});
