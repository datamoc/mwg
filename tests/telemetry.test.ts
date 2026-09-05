import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TelemetryClient } from '../src/core/index.ts';

test('send() is a silent no-op before consent is granted', async () => {
	let called = false;
	const client = new TelemetryClient({
		endpoint: 'https://telemetry.invalid',
		fetch: async () => {
			called = true;
			return new Response(null, { status: 202 });
		},
	});

	assert.equal(client.hasConsent, false);
	assert.equal(await client.send({ name: 'run_started' }), null);
	assert.equal(called, false, 'no request should have been made without consent');
});

test('send() posts JSON through the injected transport once consent is granted', async () => {
	let request: RequestInit | undefined;
	const client = new TelemetryClient({
		endpoint: 'https://telemetry.invalid',
		fetch: async (_url, init) => {
			request = init;
			return new Response(null, { status: 202 });
		},
	});

	client.setConsent(true);
	assert.equal(client.hasConsent, true);
	assert.deepEqual(await client.send({ name: 'run_started', properties: { floor: 3 } }), { ok: true, status: 202 });
	assert.equal(request?.method, 'POST');
	assert.equal(request?.headers && new Headers(request.headers).get('content-type'), 'application/json');
	assert.deepEqual(JSON.parse(String(request?.body)), { name: 'run_started', properties: { floor: 3 } });
});

test('withdrawing consent stops further sends without needing to reconstruct the client', async () => {
	let calls = 0;
	const client = new TelemetryClient({
		endpoint: 'https://telemetry.invalid',
		fetch: async () => {
			calls++;
			return new Response(null, { status: 202 });
		},
	});

	client.setConsent(true);
	await client.send({ name: 'a' });
	client.setConsent(false);
	await client.send({ name: 'b' });

	assert.equal(calls, 1);
});

test('validates input and rejects HTTP errors', async () => {
	const client = new TelemetryClient({ endpoint: 'https://telemetry.invalid', fetch: async () => new Response(null, { status: 500 }) });
	client.setConsent(true);
	await assert.rejects(client.send({ name: '' }), /needs a name/);
	await assert.rejects(client.send({ name: 'broken' }), /HTTP 500/);
});

test('requires a non-empty endpoint and a positive timeout', () => {
	assert.throws(() => new TelemetryClient({ endpoint: '' }), /endpoint is required/);
	assert.throws(() => new TelemetryClient({ endpoint: 'https://telemetry.invalid', timeoutMs: 0 }), /timeout must be positive/);
});
