import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spawn } from '../src/threads/index.ts';

// module-scope binding on purpose: a task stringified into a worker cannot see it, which
// is the failure mode that must reject rather than hang (T161's dead-worker regression)
const outerValue = 41;

test('spawn resolves a self-contained task with its value', async () => {
	assert.equal(await spawn(() => 40 + 2), 42);
});

test('spawn passes arguments structured-cloned, so a task cannot mutate the caller copy', async () => {
	const argument = { count: 1 };
	const seen = await spawn(
		(value: { count: number }) => {
			value.count = 99;
			return value.count;
		},
		[argument],
	);
	assert.equal(seen, 99, 'the worker sees its own clone');
	assert.equal(argument.count, 1, 'the caller value is untouched, and in the caller realm');
});

test('a task that throws rejects with its message and the worker-side stack', async () => {
	await assert.rejects(
		spawn(() => {
			throw new Error('probe failure');
		}),
		(error: Error) => {
			assert.match(error.message, /probe failure/);
			assert.match(String(error.stack), /probe failure/);
			return true;
		},
	);
});

test('a task that closes over module scope rejects instead of hanging', async () => {
	// the worker reports the ReferenceError hydration hits: a rejection, never a hang
	await assert.rejects(
		spawn(() => outerValue + 1),
		/outerValue is not defined/,
	);
});

test('a task that exits its worker without answering rejects with the exit status', async () => {
	await assert.rejects(
		spawn(() => process.exit(7)),
		/exited with code 7 before answering/,
	);
});

test('a timeout abandons a task that never answers', async () => {
	// the watchdog fails the test instead of hanging the whole suite if the timeout ever
	// stops firing; race() subscribes to it, so its late rejection cannot leak either
	let watchdog: ReturnType<typeof setTimeout> | undefined;
	const never = new Promise<never>((_, reject) => {
		watchdog = setTimeout(() => reject(new Error('the timeout never fired')), 10_000);
	});
	try {
		await assert.rejects(
			Promise.race([spawn(() => new Promise(() => {}), [], { timeout: 100 }), never]),
			/did not answer within 100 ms/,
		);
	} finally {
		clearTimeout(watchdog);
	}
});

test('aborting the signal rejects with its reason', async () => {
	const controller = new AbortController();
	const pending = spawn(() => new Promise(() => {}), [], { signal: controller.signal });
	controller.abort(new Error('the player left the scene'));
	await assert.rejects(pending, /the player left the scene/);
});

test('an already-aborted signal rejects with its reason', async () => {
	const controller = new AbortController();
	controller.abort(new Error('too late'));
	await assert.rejects(
		spawn(() => 1, [], { signal: controller.signal }),
		/too late/,
	);
});

test('a never-answering task does not block a concurrent one', async () => {
	const controller = new AbortController();
	const stuck = spawn(() => new Promise(() => {}), [], { signal: controller.signal });
	// this second worker answers while the first is still waiting: tasks are independent
	assert.equal(await spawn(() => 42), 42);
	controller.abort(new Error('cleanup'));
	await assert.rejects(stuck, /cleanup/);
});

test('result buffers transfer back, including two views sharing one buffer', async () => {
	const result = await spawn(() => {
		const buffer = new ArrayBuffer(32);
		return { floats: new Float32Array(buffer), bytes: new Uint8Array(buffer) };
	});
	assert.equal(result.floats.length, 8, 'the Float32Array arrives whole');
	assert.equal(result.bytes.byteLength, 32, 'the Uint8Array arrives whole');
	// one transfer entry per buffer: listing the shared buffer twice would be a DataCloneError
	assert.equal(result.floats.buffer, result.bytes.buffer, 'both views still share one buffer');
});

test('a buffer listed in transfer is detached from the caller', async () => {
	const buffer = new ArrayBuffer(64);
	const length = await spawn((view: Uint8Array) => view.byteLength, [new Uint8Array(buffer)], {
		transfer: [buffer],
	});
	assert.equal(length, 64, 'the worker received all 64 bytes');
	assert.equal(buffer.byteLength, 0, 'moved, not copied: the caller buffer is detached');
});

test('unclonable arguments reject instead of throwing synchronously', async () => {
	await assert.rejects(spawn((fn: () => void) => fn(), [() => {}]));
});
