import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LoadQueue } from '../src/core/Loading.ts';

test('LoadQueue reports weighted task progress and completes', async () => {
	const queue = new LoadQueue();
	queue.add({ id: 'metadata', weight: 1, run: ({ report }) => report(0.5) });
	queue.add({ id: 'textures', weight: 3, run: ({ report }) => report(0.25) });

	await queue.start();

	assert.deepEqual(queue.snapshot, {
		status: 'ready', completed: 4, total: 4, current: null, error: null,
	});
});

test('LoadQueue cancellation stays visible to a running task', async () => {
	const queue = new LoadQueue();
	let observedCancellation = false;
	queue.add({
		id: 'stream',
		run: (context) => {
			queue.cancel();
			observedCancellation = context.cancelled;
		},
	});

	await queue.start();

	assert.equal(observedCancellation, true);
	assert.equal(queue.snapshot.status, 'cancelled');
});

test('LoadQueue retry clears a failure and resets progress', async () => {
	const queue = new LoadQueue();
	queue.add({ id: 'broken', run: () => { throw new Error('offline'); } });

	await assert.rejects(queue.start(), /offline/);
	assert.equal(queue.snapshot.status, 'failed');
	queue.retry();
	assert.deepEqual(queue.snapshot, {
		status: 'idle', completed: 0, total: 1, current: null, error: null,
	});
});
