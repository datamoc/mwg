import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FeedbackClient } from '../src/core/index.ts';

test('feedback client posts JSON through the injected transport', async () => {
	let request: RequestInit | undefined;
	const client = new FeedbackClient({ endpoint: 'https://feedback.invalid', fetch: async (_url, init) => {
		request = init;
		return new Response(null, { status: 202 });
	} });
	assert.deepEqual(await client.submit({ message: 'Nice game', context: { level: 3 } }), { ok: true, status: 202 });
	assert.equal(request?.method, 'POST');
	assert.equal(request?.headers && new Headers(request.headers).get('content-type'), 'application/json');
	assert.deepEqual(JSON.parse(String(request?.body)), { message: 'Nice game', context: { level: 3 } });
});

test('feedback client validates input and rejects HTTP errors', async () => {
	const client = new FeedbackClient({ endpoint: 'https://feedback.invalid', fetch: async () => new Response(null, { status: 500 }) });
	await assert.rejects(client.submit({ message: '   ' }), /cannot be empty/);
	await assert.rejects(client.submit({ message: 'broken' }), /HTTP 500/);
});
