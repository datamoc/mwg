import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BossPhases, AbilityCycle } from '../src/roguelike/Boss.ts';

test('thresholds must descend', () => {
	assert.throws(() => new BossPhases([0.33, 0.66]), /descend/);
});

test('a fresh fight sits at phase 0 and reports nothing new', () => {
	const phases = new BossPhases([0.66, 0.33]);
	assert.equal(phases.phase, 0);
	assert.deepEqual(phases.update(1), []);
	assert.equal(phases.phase, 0);
});

test('crossing one threshold enters exactly that phase', () => {
	const phases = new BossPhases([0.66, 0.33]);
	assert.deepEqual(phases.update(0.5), [1]);
	assert.equal(phases.phase, 1);
	assert.deepEqual(phases.update(0.5), [], 'same fraction twice fires nothing');
});

test('a massive hit enters every skipped phase at once, in order', () => {
	const phases = new BossPhases([0.66, 0.33]);
	assert.deepEqual(phases.update(0.1), [1, 2]);
});

test('healing back up never leaves a phase', () => {
	const phases = new BossPhases([0.66]);
	phases.update(0.5);
	phases.update(1);
	assert.equal(phases.phase, 1);
});

test('reset restarts the ladder for a rematch', () => {
	const phases = new BossPhases([0.66]);
	phases.update(0.1);
	phases.reset();
	assert.equal(phases.phase, 0);
	assert.deepEqual(phases.update(0.1), [1]);
});

test('save and restore keeps the current phase', () => {
	const phases = new BossPhases([0.66, 0.33]);
	phases.update(0.5);
	const restored = BossPhases.fromJSON([0.66, 0.33], phases.toJSON());
	assert.equal(restored.phase, 1);
	assert.deepEqual(restored.update(0.1), [2]);
});

test('everything starts ready, use spends a cooldown, tick counts it down', () => {
	const cycle = new AbilityCycle({ slam: 3, summon: 0 });
	assert.deepEqual(cycle.ready(), ['slam', 'summon']);
	assert.equal(cycle.use('slam'), true);
	assert.deepEqual(cycle.ready(), ['summon']);
	cycle.tick();
	cycle.tick();
	assert.deepEqual(cycle.ready(), ['summon'], 'still cooling down');
	cycle.tick();
	assert.deepEqual(cycle.ready(), ['slam', 'summon']);
});

test('a zero-cooldown ability fires every turn', () => {
	const cycle = new AbilityCycle({ jab: 0 });
	assert.equal(cycle.use('jab'), true);
	assert.deepEqual(cycle.ready(), ['jab']);
});

test('unknown ids and cooling abilities refuse without changing anything', () => {
	const cycle = new AbilityCycle({ slam: 2 });
	assert.equal(cycle.use('unknown'), false);
	assert.equal(cycle.use('slam'), true);
	assert.equal(cycle.use('slam'), false);
});

test('save and restore keeps the remaining cooldowns', () => {
	const cycle = new AbilityCycle({ slam: 3 });
	cycle.use('slam');
	const restored = AbilityCycle.fromJSON({ slam: 3 }, cycle.toJSON());
	assert.deepEqual(restored.ready(), []);
	restored.tick();
	restored.tick();
	restored.tick();
	assert.deepEqual(restored.ready(), ['slam']);
});
