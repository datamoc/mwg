import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Field } from '../src/battle/Field.ts';

test('a condition is absent until set', () => {
	const field = new Field();
	assert.equal(field.has('rain'), false);
});

test('set makes a condition present, readable by get', () => {
	const field = new Field();
	field.set({ id: 'rain', duration: 5 });

	assert.equal(field.has('rain'), true);
	assert.deepEqual(field.get('rain'), { id: 'rain', duration: 5 });
});

test('clear removes a condition immediately', () => {
	const field = new Field();
	field.set({ id: 'rain' });
	field.clear('rain');
	assert.equal(field.has('rain'), false);
});

test('a condition with no duration never expires on its own', () => {
	const field = new Field();
	field.set({ id: 'reflect' }); // e.g. cleared explicitly on the holder's next switch-out

	for (let i = 0; i < 10; i++) field.advance();
	assert.equal(field.has('reflect'), true);
});

test('advance ticks a timed condition down, clearing it once it runs out', () => {
	const field = new Field();
	field.set({ id: 'rain', duration: 2 });

	field.advance();
	assert.equal(field.has('rain'), true);
	assert.equal(field.get('rain')!.duration, 1);

	field.advance();
	assert.equal(field.has('rain'), false);
});

test('active lists every current condition', () => {
	const field = new Field();
	field.set({ id: 'rain', duration: 3 });
	field.set({ id: 'sandstorm' });

	const ids = field.active.map((c) => c.id).sort();
	assert.deepEqual(ids, ['rain', 'sandstorm']);
});

test('re-setting a condition replaces its previous duration rather than stacking', () => {
	const field = new Field();
	field.set({ id: 'rain', duration: 2 });
	field.set({ id: 'rain', duration: 5 });

	assert.equal(field.get('rain')!.duration, 5);
	assert.equal(field.active.length, 1);
});
