import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RunHistory } from '../src/core/RunHistory.ts';
import type { SaveStorage } from '../src/core/Save.ts';

interface RunSummary {
	score: number;
	cause: string;
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

test('all() is empty before any run is recorded', () => {
	const history = new RunHistory<RunSummary>({ namespace: 'test' });
	assert.deepEqual(history.all(), []);
});

test('record appends a run and returns the entry that was stored', () => {
	const history = new RunHistory<RunSummary>({ namespace: 'record-test' });
	const entry = history.record({ score: 100, cause: 'a goblin' });

	assert.equal(entry.summary.score, 100);
	assert.ok(entry.id);
	assert.ok(entry.endedAt > 0);
	assert.deepEqual(history.all().map((e) => e.summary), [{ score: 100, cause: 'a goblin' }]);
});

test('runs are kept oldest first, in the order they were recorded', () => {
	const history = new RunHistory<RunSummary>({ namespace: 'order-test' });
	history.record({ score: 10, cause: 'a' });
	history.record({ score: 30, cause: 'b' });
	history.record({ score: 20, cause: 'c' });

	assert.deepEqual(
		history.all().map((e) => e.summary.score),
		[10, 30, 20]
	);
});

test('a limit drops the oldest run once exceeded', () => {
	const history = new RunHistory<RunSummary>({ namespace: 'limit-test', limit: 2 });
	history.record({ score: 1, cause: 'a' });
	history.record({ score: 2, cause: 'b' });
	history.record({ score: 3, cause: 'c' });

	assert.deepEqual(
		history.all().map((e) => e.summary.score),
		[2, 3]
	);
});

test('ranked sorts by a field of the summary, descending by default', () => {
	const history = new RunHistory<RunSummary>({ namespace: 'ranked-test' });
	history.record({ score: 10, cause: 'a' });
	history.record({ score: 30, cause: 'b' });
	history.record({ score: 20, cause: 'c' });

	assert.deepEqual(
		history.ranked((s) => s.score).map((e) => e.summary.score),
		[30, 20, 10]
	);
	assert.deepEqual(
		history.ranked((s) => s.score, 'asc').map((e) => e.summary.score),
		[10, 20, 30]
	);
});

test('ranked does not mutate what all() returns afterward', () => {
	const history = new RunHistory<RunSummary>({ namespace: 'ranked-no-mutate' });
	history.record({ score: 5, cause: 'a' });
	history.record({ score: 1, cause: 'b' });

	history.ranked((s) => s.score);
	assert.deepEqual(
		history.all().map((e) => e.summary.score),
		[5, 1]
	);
});

test('two namespaces do not collide', () => {
	const storage = memoryStorage();
	const a = new RunHistory<RunSummary>({ namespace: 'a', storage });
	const b = new RunHistory<RunSummary>({ namespace: 'b', storage });

	a.record({ score: 1, cause: 'x' });
	b.record({ score: 2, cause: 'y' });

	assert.equal(a.all().length, 1);
	assert.equal(b.all().length, 1);
	assert.equal(a.all()[0]?.summary.score, 1);
});

test('clear drops every recorded run', () => {
	const history = new RunHistory<RunSummary>({ namespace: 'clear-test' });
	history.record({ score: 1, cause: 'a' });
	history.clear();
	assert.deepEqual(history.all(), []);
});
