import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Session } from '../src/core/Session.ts';
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

test('the first launch counts as one', () => {
	const session = new Session({ storage: memory() });
	assert.equal(session.launches, 1);
});

test('each new Session against the same storage counts one more launch', () => {
	const storage = memory();
	assert.equal(new Session({ storage }).launches, 1);
	assert.equal(new Session({ storage }).launches, 2);
	assert.equal(new Session({ storage }).launches, 3);
});

test('namespaces keep two games sharing storage from counting each other\'s launches', () => {
	const storage = memory();
	assert.equal(new Session({ storage, namespace: 'game-a' }).launches, 1);
	assert.equal(new Session({ storage, namespace: 'game-b' }).launches, 1);
	assert.equal(new Session({ storage, namespace: 'game-a' }).launches, 2);
});

test('a corrupt or non-numeric stored value is treated as no prior launches, not NaN', () => {
	const storage = memory();
	storage.write('mwg-session:default', 'not-a-number');
	assert.equal(new Session({ storage }).launches, 1);
});

test('defaults to a fresh in-memory count when no storage is given', () => {
	//just confirms the default path (real localStorage, or its in-memory fallback under
	//node --test) doesn't throw and returns a sane first count
	assert.equal(new Session().launches, 1);
});
