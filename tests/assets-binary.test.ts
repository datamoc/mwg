import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadBinary, getBinary, isBinaryLoaded, releaseBinary } from '../src/assets/binary.ts';

function fakeFetch(bodies: Record<string, Uint8Array | 'error'>): typeof globalThis.fetch {
	const calls: string[] = [];
	const fetchImpl = (async (input: RequestInfo | URL) => {
		const path = String(input);
		calls.push(path);
		const body = bodies[path];
		if (body === undefined) throw new Error(`unexpected fetch: ${path}`);
		if (body === 'error') return { ok: false, status: 404 } as Response;
		return { ok: true, status: 200, arrayBuffer: async () => body.buffer } as unknown as Response;
	}) as typeof globalThis.fetch;
	(fetchImpl as unknown as { calls: string[] }).calls = calls;
	return fetchImpl;
}

function calls(fetchImpl: typeof globalThis.fetch): string[] {
	return (fetchImpl as unknown as { calls: string[] }).calls;
}

test('isBinaryLoaded is false for a path never passed to loadBinary', () => {
	assert.equal(isBinaryLoaded('never/loaded.vox'), false);
});

test('getBinary throws for a path never loaded', () => {
	assert.throws(() => getBinary('never/loaded.vox'));
});

test('loadBinary fetches, caches, and getBinary returns the cached bytes', async () => {
	const bytes = new Uint8Array([1, 2, 3, 4]);
	const fetchImpl = fakeFetch({ 'models/rock.vox': bytes });

	await loadBinary(['models/rock.vox'], undefined, { fetch: fetchImpl });

	assert.equal(isBinaryLoaded('models/rock.vox'), true);
	assert.deepEqual(new Uint8Array(getBinary('models/rock.vox')), bytes);

	await releaseBinary(['models/rock.vox']);
});

test('a path already loaded is not fetched again', async () => {
	const bytes = new Uint8Array([9]);
	const fetchImpl = fakeFetch({ 'models/cached.vox': bytes });

	await loadBinary(['models/cached.vox'], undefined, { fetch: fetchImpl });
	await loadBinary(['models/cached.vox'], undefined, { fetch: fetchImpl });

	assert.equal(calls(fetchImpl).length, 1);
	await releaseBinary(['models/cached.vox']);
});

test('onProgress reports 1 immediately when nothing is pending', async () => {
	const fetchImpl = fakeFetch({});
	let reported: number[] = [];
	await loadBinary([], (fraction) => reported.push(fraction), { fetch: fetchImpl });
	assert.deepEqual(reported, [1]);
});

test('onProgress reports fractional progress as each path resolves', async () => {
	const fetchImpl = fakeFetch({ a: new Uint8Array([1]), b: new Uint8Array([2]) });
	const reported: number[] = [];
	await loadBinary(['a', 'b'], (fraction) => reported.push(fraction), { fetch: fetchImpl });

	assert.equal(reported.length, 2);
	assert.ok(reported.includes(1));
	await releaseBinary(['a', 'b']);
});

test('a non-ok response rejects with a descriptive error, and caches nothing', async () => {
	const fetchImpl = fakeFetch({ 'missing.vox': 'error' });
	await assert.rejects(loadBinary(['missing.vox'], undefined, { fetch: fetchImpl }), /missing\.vox/);
	assert.equal(isBinaryLoaded('missing.vox'), false);
});

test('releaseBinary is a no-op for paths never loaded, and does not throw', () => {
	assert.doesNotThrow(() => releaseBinary(['never/loaded.vox', 'also/missing.vox']));
});

test('releaseBinary forgets the path, so a later loadBinary fetches again', async () => {
	const fetchImpl = fakeFetch({ 'models/reload.vox': new Uint8Array([7]) });
	await loadBinary(['models/reload.vox'], undefined, { fetch: fetchImpl });
	releaseBinary(['models/reload.vox']);
	assert.equal(isBinaryLoaded('models/reload.vox'), false);

	await loadBinary(['models/reload.vox'], undefined, { fetch: fetchImpl });
	assert.equal(calls(fetchImpl).length, 2);
	releaseBinary(['models/reload.vox']);
});
