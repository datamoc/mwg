import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Spawner } from '../src/core/Spawner.ts';

test('a wave with no duration spawns every entry at once, at its delay', () => {
	const spawned: string[] = [];
	const spawner = new Spawner<string>({
		waves: [{ delay: 2, entries: [{ kind: 'goblin', count: 3 }] }],
		onSpawn: (kind) => spawned.push(kind),
	});

	spawner.update(1.9);
	assert.deepEqual(spawned, []);

	spawner.update(0.2); // crosses t=2
	assert.deepEqual(spawned, ['goblin', 'goblin', 'goblin']);
});

test('a wave with a duration spreads its entries evenly across it', () => {
	const times: number[] = [];
	let elapsed = 0;
	const spawner = new Spawner<string>({
		waves: [{ delay: 0, duration: 10, entries: [{ kind: 'rat', count: 3 }] }],
		onSpawn: () => times.push(elapsed),
	});

	for (let i = 0; i < 102; i++) {
		elapsed += 0.1;
		spawner.update(0.1);
	}

	//spread evenly across 10s: t=0, t=5, t=10
	assert.equal(times.length, 3);
	assert.ok(Math.abs(times[0] - 0) < 0.15);
	assert.ok(Math.abs(times[1] - 5) < 0.15);
	assert.ok(Math.abs(times[2] - 10) < 0.15);
});

test('onWaveStart fires exactly once per wave, the moment its first entry spawns', () => {
	const starts: number[] = [];
	const spawner = new Spawner<string>({
		waves: [
			{ delay: 0, entries: [{ kind: 'a', count: 2 }] },
			{ delay: 1, entries: [{ kind: 'b', count: 2 }] },
		],
		onSpawn: () => {},
		onWaveStart: (i) => starts.push(i),
	});

	spawner.update(0); // t=0: wave 0's entries are due immediately
	spawner.update(1.5); // t=1.5: wave 1 is now due too

	assert.deepEqual(starts, [0, 1]);
});

test('onComplete fires once, after the last scheduled spawn', () => {
	let completions = 0;
	const spawner = new Spawner<string>({
		waves: [{ delay: 1, entries: [{ kind: 'a', count: 1 }] }],
		onSpawn: () => {},
		onComplete: () => completions++,
	});

	spawner.update(0.5);
	assert.equal(completions, 0);

	spawner.update(1); // crosses t=1
	assert.equal(spawner.isComplete, true);
	assert.equal(completions, 1);

	spawner.update(1); // update after completion does nothing further
	assert.equal(completions, 1);
});

test('waves may overlap - a later wave is not delayed by an earlier one still running', () => {
	const spawned: string[] = [];
	const spawner = new Spawner<string>({
		waves: [
			{ delay: 0, duration: 10, entries: [{ kind: 'early', count: 2 }] },
			{ delay: 1, entries: [{ kind: 'late', count: 1 }] },
		],
		onSpawn: (kind) => spawned.push(kind),
	});

	spawner.update(1);
	//the overlapping wave's entry (due at t=1) fires even though the first wave's second
	//entry (due at t=10) has not yet
	assert.ok(spawned.includes('late'));
	assert.equal(spawner.isComplete, false);
});

test('a spawner with no waves at all is complete immediately, and still fires onComplete', () => {
	let completions = 0;
	const spawner = new Spawner<string>({ waves: [], onSpawn: () => {}, onComplete: () => completions++ });
	assert.equal(spawner.isComplete, true);
	assert.equal(completions, 1, 'onComplete must fire for an empty schedule the same as any other');
});

test('onWaveStart fires exactly once per wave even when two overlapping waves interleave in the schedule', () => {
	const starts: number[] = [];
	const spawner = new Spawner<string>({
		//wave 0 spans t=0..10 (3 entries), wave 1 starts mid-way at t=5 with its own entries -
		//their scheduled spawns interleave in time, which is exactly what should not cause
		//onWaveStart(0) to fire again after onWaveStart(1) has already fired
		waves: [
			{ delay: 0, duration: 10, entries: [{ kind: 'a', count: 3 }] },
			{ delay: 5, duration: 10, entries: [{ kind: 'b', count: 3 }] },
		],
		onSpawn: () => {},
		onWaveStart: (i) => starts.push(i),
	});

	for (let i = 0; i < 160; i++) spawner.update(0.1);

	assert.deepEqual(starts, [0, 1], 'each wave index must appear exactly once, in first-started order');
});
