import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BattleStats } from '../src/battle/BattleStats.ts';

test('an unrecorded category/unit-type combination is 0, not an error', () => {
	const stats = new BattleStats();
	assert.equal(stats.forType('kills', 'orc-grunt'), 0);
	assert.equal(stats.total('kills'), 0);
	assert.deepEqual(stats.breakdown('kills'), []);
});

test('record accumulates per unit type within a category', () => {
	const stats = new BattleStats();
	stats.record('kills', 'orc-grunt');
	stats.record('kills', 'orc-grunt');
	stats.record('kills', 'wolf-rider');
	assert.equal(stats.forType('kills', 'orc-grunt'), 2);
	assert.equal(stats.forType('kills', 'wolf-rider'), 1);
	assert.equal(stats.total('kills'), 3);
});

test('an explicit amount adds more than one, for damage-shaped categories', () => {
	const stats = new BattleStats();
	stats.record('damageDealt', 'elvish-archer', 12);
	stats.record('damageDealt', 'elvish-archer', 5);
	assert.equal(stats.forType('damageDealt', 'elvish-archer'), 17);
	assert.equal(stats.total('damageDealt'), 17);
});

test('categories never bleed into each other', () => {
	const stats = new BattleStats();
	stats.record('kills', 'orc-grunt');
	stats.record('deaths', 'orc-grunt');
	assert.equal(stats.forType('kills', 'orc-grunt'), 1);
	assert.equal(stats.forType('deaths', 'orc-grunt'), 1);
	assert.equal(stats.total('recruits'), 0);
});

test('breakdown lists every unit type a category has recorded, with its count', () => {
	const stats = new BattleStats();
	stats.record('recruits', 'elvish-archer');
	stats.record('recruits', 'elvish-archer');
	stats.record('recruits', 'elvish-fighter');
	assert.deepEqual(stats.breakdown('recruits'), [
		{ unitType: 'elvish-archer', count: 2 },
		{ unitType: 'elvish-fighter', count: 1 },
	]);
});

test('save and restore round-trips every category and unit type', () => {
	const stats = new BattleStats();
	stats.record('kills', 'orc-grunt', 3);
	stats.record('damageTaken', 'elvish-archer', 8);
	const restored = BattleStats.fromJSON(stats.toJSON());
	assert.equal(restored.forType('kills', 'orc-grunt'), 3);
	assert.equal(restored.forType('damageTaken', 'elvish-archer'), 8);
	assert.equal(restored.total('recalls'), 0);
});
