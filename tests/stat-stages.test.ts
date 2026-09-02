import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { StatStages } from '../src/battle/StatStages.ts';

//a simple linear curve for tests: stage 1 = x1.5, stage 2 = x2, stage -1 = x0.5, etc.
const LINEAR = (stage: number): number => 1 + stage * 0.5;

test('a fresh stat starts at stage 0, with no modifier applied', () => {
	const stats = new StatBlock({ base: { attack: 10 } });
	const stages = new StatStages(stats, { max: 6, multiplier: LINEAR });

	assert.equal(stages.get('attack'), 0);
	assert.equal(stats.get('attack'), 10);
});

test('change raises a stage and applies the matching multiplier', () => {
	const stats = new StatBlock({ base: { attack: 10 } });
	const stages = new StatStages(stats, { max: 6, multiplier: LINEAR });

	assert.equal(stages.change('attack', 2), 2);
	assert.equal(stages.get('attack'), 2);
	assert.equal(stats.get('attack'), 20); // 10 * (1 + 2*0.5)
});

test('a later change replaces the modifier rather than stacking a second one', () => {
	const stats = new StatBlock({ base: { attack: 10 } });
	const stages = new StatStages(stats, { max: 6, multiplier: LINEAR });

	stages.change('attack', 1);
	stages.change('attack', 1);
	assert.equal(stages.get('attack'), 2);
	assert.equal(stats.get('attack'), 20, 'exactly the stage-2 multiplier, not two stacked stage-1s');
});

test('change clamps at max, returning only the actual change applied', () => {
	const stats = new StatBlock({ base: { attack: 10 } });
	const stages = new StatStages(stats, { max: 2, multiplier: LINEAR });

	assert.equal(stages.change('attack', 5), 2, 'clamped to +2');
	assert.equal(stages.get('attack'), 2);

	assert.equal(stages.change('attack', 1), 0, 'already at the cap');
});

test('change clamps symmetrically at -max', () => {
	const stats = new StatBlock({ base: { attack: 10 } });
	const stages = new StatStages(stats, { max: 2, multiplier: LINEAR });

	assert.equal(stages.change('attack', -5), -2);
	assert.equal(stages.get('attack'), -2);
});

test('returning to stage 0 removes the modifier entirely', () => {
	const stats = new StatBlock({ base: { attack: 10 } });
	const stages = new StatStages(stats, { max: 6, multiplier: LINEAR });

	stages.change('attack', 2);
	stages.change('attack', -2);
	assert.equal(stats.get('attack'), 10);
});

test('resetAll clears every stage and removes every modifier - the switch-out rule', () => {
	const stats = new StatBlock({ base: { attack: 10, defense: 8 } });
	const stages = new StatStages(stats, { max: 6, multiplier: LINEAR });

	stages.change('attack', 2);
	stages.change('defense', -1);
	stages.resetAll();

	assert.equal(stages.get('attack'), 0);
	assert.equal(stages.get('defense'), 0);
	assert.equal(stats.get('attack'), 10);
	assert.equal(stats.get('defense'), 8);
});

test('two different stats are tracked independently', () => {
	const stats = new StatBlock({ base: { attack: 10, defense: 8 } });
	const stages = new StatStages(stats, { max: 6, multiplier: LINEAR });

	stages.change('attack', 3);
	assert.equal(stages.get('defense'), 0);
	assert.equal(stats.get('defense'), 8);
});
