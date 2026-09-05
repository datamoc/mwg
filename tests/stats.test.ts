import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PlayerStats } from '../src/core/Stats.ts';
import type { SaveStorage } from '../src/core/Save.ts';

interface Totals {
	runs: number;
	kills: number;
	bestFloor: number;
}

function memoryStorage(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

function combine(total: Totals, summary: { kills: number; floor: number }): Totals {
	return { runs: total.runs + 1, kills: total.kills + summary.kills, bestFloor: Math.max(total.bestFloor, summary.floor) };
}

test('get() returns initial before anything is recorded', () => {
	const stats = new PlayerStats({ namespace: 'test', initial: { runs: 0, kills: 0, bestFloor: 0 }, combine });
	assert.deepEqual(stats.get(), { runs: 0, kills: 0, bestFloor: 0 });
});

test('record folds a run into the running total and persists it', () => {
	const storage = memoryStorage();
	const stats = new PlayerStats({ namespace: 'test', storage, initial: { runs: 0, kills: 0, bestFloor: 0 }, combine });

	const after1 = stats.record({ kills: 3, floor: 2 });
	assert.deepEqual(after1, { runs: 1, kills: 3, bestFloor: 2 });

	const after2 = stats.record({ kills: 5, floor: 1 });
	assert.deepEqual(after2, { runs: 2, kills: 8, bestFloor: 2 }); //bestFloor stays 2, not overwritten by a lower floor

	assert.deepEqual(stats.get(), after2);
});

test('the total survives being read back through a fresh instance over the same storage', () => {
	const storage = memoryStorage();
	new PlayerStats({ namespace: 'shared', storage, initial: { runs: 0, kills: 0, bestFloor: 0 }, combine }).record({
		kills: 1,
		floor: 1,
	});

	const reopened = new PlayerStats({ namespace: 'shared', storage, initial: { runs: 0, kills: 0, bestFloor: 0 }, combine });
	assert.deepEqual(reopened.get(), { runs: 1, kills: 1, bestFloor: 1 });
});

test('two namespaces never collide', () => {
	const storage = memoryStorage();
	const a = new PlayerStats({ namespace: 'a', storage, initial: { runs: 0, kills: 0, bestFloor: 0 }, combine });
	const b = new PlayerStats({ namespace: 'b', storage, initial: { runs: 0, kills: 0, bestFloor: 0 }, combine });

	a.record({ kills: 10, floor: 5 });
	assert.deepEqual(b.get(), { runs: 0, kills: 0, bestFloor: 0 });
});

test('reset() returns to initial', () => {
	const stats = new PlayerStats({ namespace: 'reset-test', initial: { runs: 0, kills: 0, bestFloor: 0 }, combine });
	stats.record({ kills: 1, floor: 1 });
	stats.reset();
	assert.deepEqual(stats.get(), { runs: 0, kills: 0, bestFloor: 0 });
});

test('the running total is unaffected by a run-history retention limit truncating older runs', () => {
	//the whole reason PlayerStats keeps its own persisted total rather than reducing over
	//RunHistory.all(): that list can shrink, a lifetime total must not
	const storage = memoryStorage();
	const stats = new PlayerStats({ namespace: 'limit-test', storage, initial: { runs: 0, kills: 0, bestFloor: 0 }, combine });
	for (let i = 0; i < 100; i++) stats.record({ kills: 1, floor: 1 });
	assert.equal(stats.get().runs, 100);
	assert.equal(stats.get().kills, 100);
});
