import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime } from '../src/mwl/runtime.ts';

/**
 * The turn limit is a scenario's `turn_limit`, and "time over" is what the framework says when it
 * passes: `time_over` as a variable content can test and as an event trigger it can answer. The
 * framework deliberately does not end anything itself - a limit is usually a defeat and sometimes
 * the point of the scenario - so these tests check what it reports and that it fires once.
 *
 * The limit is a turn *count*, so it is passed when the turn counter goes beyond it: a scenario of
 * three turns plays turns one to three and is over on the fourth.
 */

const source = (gameAttributes: string, onTimeOver = '[gold]\nside=1\ndelta=5\n[/gold]') => `[game]
${gameAttributes}
[side]
id=1
controller=human
[/side]
[event]
on=wait
[end_turn]
[/end_turn]
[/event]
[event]
on=time_over
${onTimeOver}
[/event]
[/game]`;

const runtimeWith = (attributes: string, onTimeOver?: string) => {
	const runtime = new MwlRuntime(compile(source(attributes, onTimeOver)));
	runtime.world.gold['1'] = 0;
	return runtime;
};

const wait = (runtime: MwlRuntime, turns: number) => {
	for (let turn = 0; turn < turns; turn++) runtime.run('wait');
};

test('a scenario with no turn limit never runs out of time', () => {
	const runtime = runtimeWith('');

	wait(runtime, 5);

	assert.equal(runtime.world.turn, 6);
	assert.equal(runtime.world.variables.time_over, undefined);
	assert.equal(runtime.world.gold['1'], 0, 'and nothing answered a time that never ran out');
});

test('time over arrives after the declared number of turns, not on the last one', () => {
	const runtime = runtimeWith('turn_limit=3');

	wait(runtime, 2);
	assert.equal(runtime.world.turn, 3);
	assert.equal(runtime.world.variables.time_over, undefined, 'three turns played is not over the limit');

	wait(runtime, 1);
	assert.equal(runtime.world.turn, 4);
	assert.equal(runtime.world.variables.time_over, 'yes', 'a fourth turn is');
	assert.equal(runtime.world.gold['1'], 5, 'and the content answered it');
});

test('time over is reported once, however many turns follow it', () => {
	const runtime = runtimeWith('turn_limit=1');

	wait(runtime, 6);

	assert.equal(runtime.world.turn, 7);
	assert.equal(runtime.world.gold['1'], 5, 'the trigger ran once, not once per turn after the limit');
});

test('content decides what time over means, including a defeat', () => {
	const runtime = runtimeWith('turn_limit=3', '[endlevel]\nresult=defeat\n[/endlevel]');

	wait(runtime, 2);
	assert.equal(runtime.world.status, 'playing', 'two turns in, the scenario is still on');

	wait(runtime, 1);

	assert.equal(runtime.world.status, 'lost', 'the scenario ends the way its content said');
	assert.equal(runtime.world.carryover?.result, 'defeat', 'and 248 records what it hands on');
});
