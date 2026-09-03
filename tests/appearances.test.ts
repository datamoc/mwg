import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assignAppearances, Appearances } from '../src/actors/Appearances.ts';
import * as Random from '../src/core/Random.ts';

const table = { kinds: ['healing', 'frost', 'venom'], labels: ['red', 'blue', 'green', 'clear'] };

test('every kind gets a distinct label', () => {
	const assigned = Random.withSeed(7, () => assignAppearances(table));
	assert.equal(assigned.size, 3);
	assert.equal(new Set(assigned.values()).size, 3);
});

test('the shuffle actually reorders the pool, not just picks the first N labels', () => {
	//a no-op swap (assigning pool[i] to itself instead of swapping in pool[j]) would still
	//pass "every kind gets a distinct label" - only checking against many seeds catches it
	const original = ['healing', 'frost', 'venom'].map((_, i) => table.labels[i]);
	const reordered = Array.from({ length: 30 }, (_, seed) => {
		const assigned = Random.withSeed(seed, () => assignAppearances(table));
		return [...assigned.values()].some((label, i) => label !== original[i]);
	}).some(Boolean);
	assert.ok(reordered, 'expected at least one seed to produce a different order than the unshuffled labels');
});

test('the same seed deals the same mapping', () => {
	const first = Random.withSeed(42, () => assignAppearances(table));
	const second = Random.withSeed(42, () => assignAppearances(table));
	assert.deepEqual([...first], [...second]);
});

test('too few labels throws rather than doubling one up', () => {
	assert.throws(() => assignAppearances({ kinds: ['a', 'b'], labels: ['only'] }), /not enough appearances/);
});

test('appearanceOf draws lazily per category and stays fixed afterwards', () => {
	const appearances = new Appearances({ potion: table });
	const first = appearances.appearanceOf('potion', 'healing');
	assert.equal(appearances.appearanceOf('potion', 'healing'), first);
	assert.notEqual(appearances.appearanceOf('potion', 'frost'), first);
});

test('unknown categories and kinds throw', () => {
	const appearances = new Appearances({ potion: table });
	assert.throws(() => appearances.appearanceOf('scroll', 'healing'), /no such appearance category/);
	assert.throws(() => appearances.appearanceOf('potion', 'unknown'), /not in appearance category/);
});

test('save and restore keeps the same mapping without re-drawing', () => {
	const appearances = new Appearances({ potion: table });
	const healing = appearances.appearanceOf('potion', 'healing');
	const restored = Appearances.fromJSON({ potion: table }, appearances.toJSON());
	assert.equal(restored.appearanceOf('potion', 'healing'), healing);
});
