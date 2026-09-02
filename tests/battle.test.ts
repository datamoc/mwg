import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Creature, type Species } from '../src/battle/Species.ts';
import { TypeMatrix } from '../src/battle/TypeMatrix.ts';
import { Party } from '../src/battle/Party.ts';
import { battleOrder } from '../src/battle/Move.ts';
import { checkEvolution, type EvolutionRule } from '../src/battle/Evolution.ts';

const RAT: Species = { id: 'rat', types: ['normal'], baseStats: { attack: 5, vitality: 5 } };

test('a creature starts with the species base stats at level 1', () => {
	const rat = new Creature({ species: RAT });
	assert.equal(rat.progression.level, 1);
	assert.equal(rat.stats.get('attack'), 5);
});

test('deriveStats scales stats with level, and refreshStats applies it after levelling', () => {
	const rat = new Creature({
		species: RAT,
		deriveStats: (base, level) => ({ attack: base.attack * level }),
	});

	rat.progression.addExperience(1_000_000); // however many levels that is
	rat.refreshStats();

	assert.equal(rat.stats.get('attack'), 5 * rat.progression.level);
});

test('a creature keeps its own StatBlock, so equipment modifiers still work', () => {
	const rat = new Creature({ species: RAT });
	rat.stats.addModifier({ stat: 'attack', op: 'add', value: 10 });
	assert.equal(rat.stats.get('attack'), 15);
});

test('an unset type pairing multiplies by 1', () => {
	const matrix = new TypeMatrix();
	assert.equal(matrix.get('fire', 'water'), 1);
});

test('a set pairing is used, and multiple defending types combine multiplicatively', () => {
	const matrix = new TypeMatrix();
	matrix.set('fire', 'grass', 2);
	matrix.set('fire', 'water', 0.5);

	assert.equal(matrix.multiplierFor('fire', ['grass']), 2);
	assert.equal(matrix.multiplierFor('fire', ['grass', 'water']), 1);
});

test('a party fills active slots first, then overflows to storage', () => {
	const party = new Party<string>(2);
	party.add('a');
	party.add('b');
	party.add('c');

	assert.deepEqual(party.members, ['a', 'b']);
	assert.deepEqual(party.boxed, ['c']);
});

test('storing an active member frees its slot and boxes it', () => {
	const party = new Party<string>(1);
	party.add('a');
	party.store(0);

	assert.deepEqual(party.members, [null]);
	assert.deepEqual(party.boxed, ['a']);
});

test('withdrawing swaps a boxed member into an active slot, boxing whoever was there', () => {
	const party = new Party<string>(1);
	party.add('a');
	party.add('b'); // active is full, so b goes to storage

	party.withdraw(0, 0);
	assert.deepEqual(party.members, ['b']);
	assert.deepEqual(party.boxed, ['a']);
});

test('activeMembers skips empty slots', () => {
	const party = new Party<string>(3);
	party.add('a');
	assert.deepEqual(party.activeMembers, ['a']);
});

test('battleOrder sorts by priority first, then speed, both descending', () => {
	const actions = [
		{ name: 'slow', speed: 1 },
		{ name: 'fast', speed: 10 },
		{ name: 'priority', speed: 1, priority: 1 },
	];

	const order = battleOrder(actions).map((a) => a.name);
	assert.deepEqual(order, ['priority', 'fast', 'slow']);
});

test('checkEvolution returns the last matching rule, or null', () => {
	const rules: EvolutionRule<string>[] = [
		{ at: (level) => level >= 16, into: 'adult' },
		{ at: (level) => level >= 32, into: 'elder' },
	];

	assert.equal(checkEvolution(rules, 10), null);
	assert.equal(checkEvolution(rules, 20), 'adult');
	//last match wins, so a level past every threshold reaches the final form, not the first
	assert.equal(checkEvolution(rules, 40), 'elder');
});
