import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Advancement, type AdvancementTrack } from '../src/actors/Advancement.ts';

const track: AdvancementTrack = {
	tiers: [
		{ threshold: 2, kind: 'points', points: 2 },
		{ threshold: 7, kind: 'branch', options: [{ id: 'a' }, { id: 'b' }] },
		{ threshold: 13, kind: 'capstone', options: [{ id: 'x' }] },
	],
};

test('no tier opens below the first threshold', () => {
	const advancement = new Advancement(track);
	assert.deepEqual(advancement.openTiers(1), []);
	assert.equal(advancement.grant(1), 0);
	assert.equal(advancement.points, 0);
});

test('grant opens tiers in order and pays points tiers exactly once', () => {
	const advancement = new Advancement(track);
	assert.equal(advancement.grant(5), 2);
	assert.equal(advancement.points, 2);
	assert.equal(advancement.grant(5), 0, 're-granting the same level pays nothing');
	assert.deepEqual(advancement.openTiers(5), [0]);
});

test('a branch choice commits permanently and refuses a second pick', () => {
	const advancement = new Advancement(track);
	advancement.grant(7);
	advancement.choose(1, 'b', 7);
	assert.equal(advancement.choice(1), 'b');
	assert.throws(() => advancement.choose(1, 'a', 7), /already decided/);
});

test('choosing early, unknown, or on a points tier throws', () => {
	const advancement = new Advancement(track);
	assert.throws(() => advancement.choose(1, 'a', 6), /not opened/);
	assert.throws(() => advancement.choose(1, 'zzz', 7), /no option/);
	assert.throws(() => advancement.choose(0, 'a', 7), /grants points/);
	assert.throws(() => advancement.choose(9, 'a', 30), /no such advancement tier/);
});

test('spending refuses more than the balance holds', () => {
	const advancement = new Advancement(track);
	advancement.grant(5);
	assert.equal(advancement.spend(3), false);
	assert.equal(advancement.spend(2), true);
	assert.equal(advancement.points, 0);
});

test('a capstone choice works the same as a branch choice', () => {
	const advancement = new Advancement(track);
	advancement.grant(13);
	advancement.choose(2, 'x', 13);
	assert.equal(advancement.choice(2), 'x');
	assert.equal(advancement.choice(1), null, 'undecided tiers read null');
});

test('save and restore round-trips granted tiers, balance and choices', () => {
	const advancement = new Advancement(track);
	advancement.grant(13);
	advancement.choose(1, 'a', 13);
	advancement.spend(1);

	const restored = Advancement.fromJSON(track, advancement.toJSON());
	assert.equal(restored.points, 1);
	assert.equal(restored.choice(1), 'a');
	assert.deepEqual(restored.openTiers(13), [0, 1, 2]);
	assert.throws(() => restored.choose(1, 'b', 13), /already decided/);
});
