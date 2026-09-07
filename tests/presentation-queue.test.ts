import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PresentationQueue } from '../src/core/Presentation.ts';

type Event = { type: 'move' } | { type: 'damage'; amount: number };

test('an empty queue is not busy and update is a no-op', () => {
	const queue = new PresentationQueue<Event>({ play: () => 0 });
	assert.equal(queue.isBusy, false);
	assert.doesNotThrow(() => queue.update(1));
});

test('enqueue starts the first event immediately', () => {
	const played: Event[] = [];
	const queue = new PresentationQueue<Event>({ play: (event) => played.push(event) && 0.5 });

	queue.enqueue([{ type: 'move' }]);

	assert.deepEqual(played, [{ type: 'move' }]);
	assert.equal(queue.isBusy, true);
});

test('the next event starts only once its predecessor\'s duration elapses', () => {
	const played: Event[] = [];
	const queue = new PresentationQueue<Event>({ play: (event) => (played.push(event), 0.2) });

	queue.enqueue([{ type: 'move' }, { type: 'damage', amount: 7 }]);
	assert.equal(played.length, 1);

	queue.update(0.1);
	assert.equal(played.length, 1, 'not yet - only half the duration has passed');

	queue.update(0.1);
	assert.deepEqual(played, [{ type: 'move' }, { type: 'damage', amount: 7 }]);
	assert.equal(queue.isBusy, true, 'the second event is now playing out its own duration');

	queue.update(0.2);
	assert.equal(queue.isBusy, false, 'nothing left once the second event also finishes');
});

test('events with no duration chain immediately, costing no extra update() call', () => {
	const played: Event[] = [];
	const queue = new PresentationQueue<Event>({ play: (event) => played.push(event) && undefined });

	queue.enqueue([{ type: 'damage', amount: 1 }, { type: 'damage', amount: 2 }, { type: 'damage', amount: 3 }]);

	assert.equal(played.length, 3, 'all three drained in the same enqueue call');
	assert.equal(queue.isBusy, false);
});

test('a later enqueue appends behind whatever is already playing', () => {
	const played: Event[] = [];
	const queue = new PresentationQueue<Event>({ play: (event) => (played.push(event), 0.1) });

	queue.enqueue([{ type: 'move' }]);
	queue.enqueue([{ type: 'damage', amount: 5 }]);
	assert.equal(played.length, 1, 'the second event waits behind the first');

	queue.update(0.1);
	assert.deepEqual(played, [{ type: 'move' }, { type: 'damage', amount: 5 }]);
});

test('clear drops everything without playing what was still queued', () => {
	const played: Event[] = [];
	const queue = new PresentationQueue<Event>({ play: (event) => (played.push(event), 1) });

	queue.enqueue([{ type: 'move' }, { type: 'damage', amount: 9 }]);
	queue.clear();
	queue.update(10);

	assert.deepEqual(played, [{ type: 'move' }], 'only the one already in flight when clear() ran');
	assert.equal(queue.isBusy, false);
});
