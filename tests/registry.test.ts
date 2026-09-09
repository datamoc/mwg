import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Registry } from '../src/core/Registry.ts';

test('register then get returns the same value back', () => {
	const registry = new Registry<number>();
	registry.register('gold', 42);
	assert.equal(registry.get('gold'), 42);
});

test('registering the same name twice throws', () => {
	const registry = new Registry<number>();
	registry.register('gold', 1);
	assert.throws(() => registry.register('gold', 2), /"gold" is already registered/);
});

test('get on an unknown name throws by name', () => {
	const registry = new Registry<number>();
	assert.throws(() => registry.get('missing'), /no registration named "missing"/);
});

test('has reports whether a name is registered', () => {
	const registry = new Registry<number>();
	assert.equal(registry.has('gold'), false);
	registry.register('gold', 1);
	assert.equal(registry.has('gold'), true);
});

test('list returns every registered name in registration order', () => {
	const registry = new Registry<number>();
	registry.register('b', 2);
	registry.register('a', 1);
	assert.deepEqual(registry.list(), ['b', 'a']);
});
