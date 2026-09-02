import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { SkillPoints } from '../src/actors/SkillPoints.ts';
import { Progression, powerCurve } from '../src/actors/Progression.ts';

function heroStats(): StatBlock {
	return new StatBlock({ base: { strength: 5, lockpicking: 0 } });
}

test('a fresh SkillPoints ledger starts with nothing to spend', () => {
	const budget = new SkillPoints(heroStats());
	assert.equal(budget.points, 0);
	assert.equal(budget.canSpend('lockpicking'), false);
});

test('grant adds to the ledger, and spend raises the stat by exactly one rank', () => {
	const stats = heroStats();
	const budget = new SkillPoints(stats);

	budget.grant(1);
	assert.equal(budget.canSpend('lockpicking'), true);
	assert.equal(budget.spend('lockpicking'), true);

	assert.equal(stats.base('lockpicking'), 1);
	assert.equal(budget.points, 0);
});

test('spend fails, and changes nothing, once the ledger cannot afford the next rank', () => {
	const stats = heroStats();
	const budget = new SkillPoints(stats); // default cost: a flat 1 per rank

	assert.equal(budget.spend('lockpicking'), false);
	assert.equal(stats.base('lockpicking'), 0);
});

test('a named stat with no base value yet starts at rank 0, same as StatBlock.base does', () => {
	const stats = new StatBlock({ base: {} });
	const budget = new SkillPoints(stats);
	budget.grant(1);

	assert.equal(budget.spend('persuasion'), true);
	assert.equal(stats.base('persuasion'), 1);
});

test('a cap refuses to spend past it, even with points to spare', () => {
	const stats = heroStats();
	const budget = new SkillPoints(stats, { cap: () => 2 });
	budget.grant(5);

	assert.equal(budget.spend('lockpicking'), true); // 0 -> 1
	assert.equal(budget.spend('lockpicking'), true); // 1 -> 2
	assert.equal(budget.canSpend('lockpicking'), false);
	assert.equal(budget.spend('lockpicking'), false);

	assert.equal(stats.base('lockpicking'), 2);
	assert.equal(budget.points, 3); // the refused spend cost nothing
});

test('a cap is per stat, named by the callback', () => {
	const stats = heroStats();
	const budget = new SkillPoints(stats, { cap: (stat) => (stat === 'lockpicking' ? 1 : Infinity) });
	budget.grant(10);

	budget.spend('lockpicking');
	assert.equal(budget.canSpend('lockpicking'), false);
	assert.equal(budget.canSpend('strength'), true); // uncapped by the callback's default
});

test('a rising cost per rank is charged against the ledger correctly', () => {
	const stats = heroStats();
	//rank 1 costs 1, rank 2 costs 2, rank 3 costs 3 - a classic rising-cost curve
	const budget = new SkillPoints(stats, { cost: (_stat, rank) => rank });
	budget.grant(3);

	assert.equal(budget.spend('lockpicking'), true); // costs 1 (rank 1), 2 left
	assert.equal(budget.points, 2);
	assert.equal(budget.spend('lockpicking'), true); // costs 2 (rank 2), 0 left
	assert.equal(budget.points, 0);
	assert.equal(budget.spend('lockpicking'), false); // rank 3 costs 3, unaffordable
	assert.equal(stats.base('lockpicking'), 2);
});

test('the cost callback receives the rank being bought, one ahead of the current base', () => {
	const stats = heroStats();
	const seen: number[] = [];
	const budget = new SkillPoints(stats, {
		cost: (_stat, rank) => {
			seen.push(rank);
			return 0;
		},
	});
	budget.grant(0);

	budget.spend('lockpicking');
	budget.spend('lockpicking');
	assert.deepEqual(seen, [1, 2]);
});

test('spending one stat does not affect another', () => {
	const stats = heroStats();
	const budget = new SkillPoints(stats);
	budget.grant(1);

	budget.spend('lockpicking');
	assert.equal(stats.base('strength'), 5);
});

test('a real Progression/StatBlock pairing: levelling up grants points the game then spends', () => {
	const stats = heroStats();
	const budget = new SkillPoints(stats);
	const progression = new Progression(powerCurve(10, 2, 10));

	const gained = progression.addExperience(10); // enough for at least one level
	assert.ok(gained > 0);

	budget.grant(gained);
	assert.equal(budget.points, gained);

	for (let i = 0; i < gained; i++) budget.spend('lockpicking');
	assert.equal(stats.base('lockpicking'), gained);
	assert.equal(budget.points, 0);
});
