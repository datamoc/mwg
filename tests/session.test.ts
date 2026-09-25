import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Session } from '../src/core/Session.ts';
import { memoryStorage } from '../src/testing/index.ts';

test('the first launch counts as one', () => {
	const session = new Session({ storage: memoryStorage() });
	assert.equal(session.launches, 1);
});

test('each new Session against the same storage counts one more launch', () => {
	const storage = memoryStorage();
	assert.equal(new Session({ storage }).launches, 1);
	assert.equal(new Session({ storage }).launches, 2);
	assert.equal(new Session({ storage }).launches, 3);
});

test("namespaces keep two games sharing storage from counting each other's launches", () => {
	const storage = memoryStorage();
	assert.equal(new Session({ storage, namespace: 'game-a' }).launches, 1);
	assert.equal(new Session({ storage, namespace: 'game-b' }).launches, 1);
	assert.equal(new Session({ storage, namespace: 'game-a' }).launches, 2);
});

test('a corrupt or non-numeric stored value is treated as no prior launches, not NaN', () => {
	const storage = memoryStorage();
	storage.write('mwg-session:default', 'not-a-number');
	assert.equal(new Session({ storage }).launches, 1);
});

test('defaults to a fresh in-memory count when no storage is given', () => {
	//just confirms the default path (real localStorage, or its in-memory fallback under
	//node --test) doesn't throw and returns a sane first count
	assert.equal(new Session().launches, 1);
});
