import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Collection } from '../src/core/Collection.ts';
import type { SaveStorage } from '../src/core/Save.ts';

function memory(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

function quests(storage?: SaveStorage) {
	return new Collection('quests', { namespace: 'test', storage });
}

test('put stores a record and get reads it back', () => {
	const db = quests(memory());
	db.put({ id: 'rats', done: false, slain: 3 });

	assert.deepEqual(db.get('rats'), { id: 'rats', done: false, slain: 3 });
	assert.equal(db.get('missing'), undefined);
});

test('putting the same id twice replaces, and nothing else moves', () => {
	const db = quests(memory());
	db.put({ id: 'rats', done: false });
	db.put({ id: 'amulet', done: false });
	db.put({ id: 'rats', done: true });

	assert.deepEqual(db.get('rats'), { id: 'rats', done: true });
	assert.equal(db.size, 2);
});

test('all returns records in insertion order, and remove deletes', () => {
	const db = quests(memory());
	db.put({ id: 'b', n: 2 });
	db.put({ id: 'a', n: 1 });
	db.put({ id: 'c', n: 3 });
	db.remove('b');
	db.remove('never-there'); //a missing id is a no-op, not an error

	assert.deepEqual(
		db.all().map((r) => r.id),
		['a', 'c']
	);
});

test('where answers the query the save system cannot ask', () => {
	const db = quests(memory());
	db.put({ id: 'rats', done: true });
	db.put({ id: 'amulet', done: false });
	db.put({ id: 'escort', done: false });

	assert.deepEqual(
		db.where((q) => !q.done).map((q) => q.id),
		['amulet', 'escort']
	);
});

test('collections sharing one storage never see each other, and clear stays inside its own', () => {
	const storage = memory();
	const questsDb = new Collection('quests', { namespace: 'test', storage });
	const bestiary = new Collection('bestiary', { namespace: 'test', storage });
	questsDb.put({ id: 'rats', done: false });
	bestiary.put({ id: 'rat', seen: true });

	questsDb.clear();
	assert.equal(questsDb.size, 0);
	assert.equal(bestiary.size, 1, 'clear must not touch the neighbouring collection');
});

test('a record without a usable id is refused', () => {
	const db = quests(memory());
	assert.throws(() => db.put({} as never), /string id/);
	assert.throws(() => db.put({ id: '' }), /string id/);
	assert.throws(() => db.put(null as never), /string id/);
	assert.throws(() => db.put([{ id: 'x' }] as never), /string id/);
	assert.equal(db.size, 0);
});

test('a collection needs a name', () => {
	assert.throws(() => new Collection(''), /needs a name/);
});

test('without a storage it still works - the memory fallback, as under file://', () => {
	const db = quests();
	db.put({ id: 'rats', done: false });
	assert.equal(db.get('rats')?.done, false);
});
