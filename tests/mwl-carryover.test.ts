import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, createWorld, type MwlWorld } from '../src/mwl/runtime.ts';
import {
	carryoverIntoScenario,
	endLevelCarryover,
	MWL_DEFAULT_CARRYOVER_PERCENTAGE,
	type MwlSideRef,
} from '../src/mwl/carryover.ts';

/**
 * Carry-over is arithmetic over a finished scenario: a share of the side's gold, a bonus, the
 * units still standing, and where the campaign goes. It is checked as arithmetic first, and then
 * through the real runtime, because `[endlevel]` is what a scenario actually writes.
 */

const side: MwlSideRef = { id: '1', unitSide: 1 };

const world = (overrides: Partial<MwlWorld> = {}): MwlWorld => ({
	...createWorld(),
	gold: { '1': 200 },
	sides: { '1': { gold: 0, income: 2, controller: 'human' } },
	units: {
		hero: { hp: 30, x: 1, y: 1, alive: true, side: 1 },
		fallen: { hp: 0, x: 2, y: 1, alive: false, side: 1 },
		rat: { hp: 4, x: 3, y: 3, alive: true, side: 2 },
	},
	...overrides,
});

test('a victory carries 80% of the side s gold by default, and the bonus on top', () => {
	const carried = endLevelCarryover(world(), side, { result: 'victory', bonus: 50 });

	assert.equal(MWL_DEFAULT_CARRYOVER_PERCENTAGE, 80, 'the reference s own default, not an invented one');
	assert.equal(carried.gold, 210, '160 of the 200, plus 50');
	assert.deepEqual(carried.recall, ['hero'], 'the dead one and the other side stay behind');
	assert.equal(carried.nextScenario, null, 'nothing said where to go, so the campaign ends here');
	assert.equal(carried.add, false);
});

test('carryover_percentage replaces the share, and the share floors rather than rounds up', () => {
	assert.equal(endLevelCarryover(world(), side, { result: 'victory', carryoverPercentage: 50 }).gold, 100);
	assert.equal(endLevelCarryover(world(), side, { result: 'victory', carryoverPercentage: 0 }).gold, 0);

	// 3 gold at 80% is 2.4 of a coin, and a side keeps the coins it has
	const poor = world({ gold: { '1': 3 } });
	assert.equal(endLevelCarryover(poor, side, { result: 'victory' }).gold, 2);
});

test('the carried share meets the next scenario s gold, as a floor or as an addition', () => {
	const floored = endLevelCarryover(world(), side, { result: 'victory' });
	const added = endLevelCarryover(world(), side, { result: 'victory', carryoverAdd: true });

	assert.equal(carryoverIntoScenario(floored, 100), 160, 'a share above what is declared wins');
	assert.equal(carryoverIntoScenario(floored, 300), 300, 'and one below it does not drag it down');
	assert.equal(carryoverIntoScenario(added, 100), 260, 'asked to add, it adds');
	assert.equal(added.add, true);
});

test('a scenario with no side to carry still records how it ended', () => {
	const carried = endLevelCarryover(world(), null, { result: 'defeat', nextScenario: 'retreat' });

	assert.deepEqual(carried, {
		result: 'defeat',
		gold: 0,
		add: false,
		recall: [],
		nextScenario: 'retreat',
	});
});

test('a side with no running gold falls back to what its own scenario declared', () => {
	const declared = world({ gold: {}, sides: { '1': { gold: 120, income: 2, controller: 'human' } } });

	assert.equal(endLevelCarryover(declared, side, { result: 'victory' }).gold, 96);
});

const SOURCE = `[game]
[side]
id=1
controller=human
gold=100
[/side]
[event]
id=finish
[endlevel]
result=victory
bonus=50
next_scenario=siege
[/endlevel]
[/event]
[event]
id=give_up
[endlevel]
result=defeat
[/endlevel]
[/event]
[/game]`;

test('[endlevel] ends the scenario, records the carry-over, and says where the campaign goes', () => {
	const runtime = new MwlRuntime(compile(SOURCE));
	runtime.world.gold['1'] = 200;
	runtime.world.units.hero = { hp: 30, x: 1, y: 1, alive: true, side: 1 };

	assert.equal(runtime.world.status, 'playing');

	assert.equal(runtime.fireEvent('finish'), true, 'the event ran');

	assert.equal(runtime.world.status, 'won');
	assert.deepEqual(runtime.world.carryover, {
		result: 'victory',
		gold: 210,
		add: false,
		recall: ['hero'],
		nextScenario: 'siege',
	});
});

test('[endlevel] result=defeat loses the scenario, and a defeat may carry nothing', () => {
	const runtime = new MwlRuntime(compile(SOURCE));
	runtime.world.gold['1'] = 200;

	runtime.fireEvent('give_up');

	assert.equal(runtime.world.status, 'lost');
	assert.equal(runtime.world.carryover?.result, 'defeat');
	assert.equal(runtime.world.carryover?.gold, 160, 'the same arithmetic: a defeat is not a special case');
});

test('carrying the side a scenario names, rather than the human one', () => {
	const runtime = new MwlRuntime(compile(SOURCE));
	runtime.world.sides['2'] = { gold: 0, income: 0, controller: 'ai' };
	runtime.world.gold['2'] = 50;
	runtime.world.units.enemy = { hp: 10, x: 5, y: 5, alive: true, side: 2 };

	const carried = endLevelCarryover(runtime.world, { id: '2', unitSide: 2 }, { result: 'defeat' });

	assert.equal(carried.gold, 40);
	assert.deepEqual(carried.recall, ['enemy']);
});
