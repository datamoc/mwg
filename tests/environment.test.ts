import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EnvironmentClock } from '../src/world/Environment.ts';

test('environment clock exposes day phases and wraps across days', () => {
	const clock = new EnvironmentClock({ dayLength: 100, startSeconds: 0 });
	assert.equal(clock.phase, 'dawn');
	clock.update(25);
	assert.equal(clock.phase, 'day');
	clock.update(45);
	assert.equal(clock.phase, 'dusk');
	clock.update(30);
	assert.equal(clock.day, 1);
	assert.equal(clock.phase, 'dawn');
});

test('environment weather and snapshots restore cleanly', () => {
	const clock = new EnvironmentClock({ dayLength: 60 });
	const seen: string[] = [];
	clock.changed.add((snapshot) => {
		seen.push(`${snapshot.phase}:${snapshot.weather}`);
	});
	clock.setWeather('rain');
	clock.update(50);
	const restored = EnvironmentClock.fromJSON({ dayLength: 60 }, clock.toJSON());
	assert.equal(restored.weather, 'rain');
	assert.equal(restored.seconds, 50);
	assert.deepEqual(seen, ['dawn:rain', 'night:rain']);
});
