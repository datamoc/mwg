import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EntityRegistry } from '../src/core/Entity.ts';

interface Monster {
	name: string;
}

test('add assigns an id that get and idOf agree on', () => {
	const registry = new EntityRegistry<Monster>();
	const rat: Monster = { name: 'rat' };

	const id = registry.add(rat);

	assert.equal(registry.get(id), rat);
	assert.equal(registry.idOf(rat), id);
	assert.equal(registry.has(id), true);
});

test('ids are stable and distinct across several entities', () => {
	const registry = new EntityRegistry<Monster>();
	const a = registry.add({ name: 'a' });
	const b = registry.add({ name: 'b' });

	assert.notEqual(a, b);
	assert.equal(registry.get(a)?.name, 'a');
	assert.equal(registry.get(b)?.name, 'b');
});

test('adding the same entity twice returns the same id rather than a duplicate', () => {
	const registry = new EntityRegistry<Monster>();
	const rat: Monster = { name: 'rat' };

	const first = registry.add(rat);
	const second = registry.add(rat);

	assert.equal(first, second);
	assert.equal(registry.size, 1);
});

test('remove drops both directions of the lookup', () => {
	const registry = new EntityRegistry<Monster>();
	const rat: Monster = { name: 'rat' };
	const id = registry.add(rat);

	assert.equal(registry.remove(id), true);
	assert.equal(registry.get(id), undefined);
	assert.equal(registry.idOf(rat), undefined);
	assert.equal(registry.has(id), false);
});

test('removing an unknown id is safe and reports nothing happened', () => {
	const registry = new EntityRegistry<Monster>();
	assert.equal(registry.remove('nope'), false);
});

test('get/idOf on an unregistered id or entity return undefined rather than throwing', () => {
	const registry = new EntityRegistry<Monster>();
	assert.equal(registry.get('nope'), undefined);
	assert.equal(registry.idOf({ name: 'stranger' }), undefined);
});

test('size tracks the number of registered entities', () => {
	const registry = new EntityRegistry<Monster>();
	assert.equal(registry.size, 0);
	const id = registry.add({ name: 'a' });
	assert.equal(registry.size, 1);
	registry.remove(id);
	assert.equal(registry.size, 0);
});
