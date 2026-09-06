import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TriggerTracker } from '../src/roguelike/TriggerTracker.ts';

test('starts at zero, inactive', () => {
	const tracker = new TriggerTracker(3);
	assert.equal(tracker.count, 0);
	assert.equal(tracker.isActive(0), false);
});

test('consecutive triggers within the window extend the streak', () => {
	const tracker = new TriggerTracker(3);
	assert.equal(tracker.trigger(1), 1);
	assert.equal(tracker.trigger(3), 2);
	assert.equal(tracker.trigger(6), 3);
	assert.equal(tracker.count, 3);
});

test('a gap past the window restarts the streak rather than continuing it', () => {
	const tracker = new TriggerTracker(2);
	tracker.trigger(1);
	tracker.trigger(2);
	assert.equal(tracker.count, 2);

	assert.equal(tracker.trigger(10), 1, 'window lapsed, streak restarts at 1');
});

test('isActive reflects the window without consuming a trigger', () => {
	const tracker = new TriggerTracker(2);
	tracker.trigger(5);
	assert.equal(tracker.isActive(6), true);
	assert.equal(tracker.isActive(7), true, 'exactly at the window edge');
	assert.equal(tracker.isActive(8), false);
	assert.equal(tracker.count, 1, 'checking must not itself trigger');
});

test('reset ends the streak immediately', () => {
	const tracker = new TriggerTracker(5);
	tracker.trigger(1);
	tracker.trigger(2);
	tracker.reset();
	assert.equal(tracker.count, 0);
	assert.equal(tracker.isActive(2), false);
	assert.equal(tracker.trigger(2), 1, 'a fresh streak after reset');
});

test('round-trips through JSON', () => {
	const tracker = new TriggerTracker(3);
	tracker.trigger(4);
	tracker.trigger(6);

	const restored = TriggerTracker.fromJSON(3, tracker.toJSON());
	assert.equal(restored.count, 2);
	assert.equal(restored.trigger(9), 3);
});
