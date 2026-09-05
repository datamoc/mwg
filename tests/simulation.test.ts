import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceToInput, runScenario, type SimulationRule } from '../src/simulation/index.ts';
import { Scheduler } from '../src/roguelike/Scheduler.ts';
import { Generator } from '../src/core/Random.ts';

test('scheduled actions retain speeds and leave input actors unspent', () => {
	const queue = new Scheduler<{ speed?: number; player?: boolean }>();
	const player = { player: true }, automatic = { speed: 2 };
	queue.add(automatic); queue.add(player, 0.75);
	const result = advanceToInput({ scheduler: queue, finished: () => false,
		needsInput: a => !!a.player, act: () => 1 }, 10);
	assert.deepEqual(result, { status: 'input', actor: player, steps: 2 });
	assert.equal(queue.timeOf(player), 0.75);
});

test('finished, empty, and exhausted budget have distinct outcomes', () => {
	const rules = { scheduler: { peek: () => null, spend: () => assert.fail('spend') },
		finished: () => false, needsInput: () => false, act: () => 1 };
	assert.deepEqual(advanceToInput(rules, 10), { status: 'empty', steps: 0 });
	assert.deepEqual(advanceToInput({ ...rules, finished: () => true }, 10), { status: 'finished', steps: 0 });
	assert.deepEqual(advanceToInput(rules, 0), { status: 'limit', steps: 0 });
});

test('a bounded zero-cost loop can be resumed without inventing an input turn', () => {
	let actions = 0;
	const rules = { scheduler: { peek: () => 'npc', spend: (cost: number) => assert.equal(cost, 0) },
		finished: () => false, needsInput: () => false, act: () => { actions++; return 0; } };
	assert.equal(advanceToInput(rules, 3).status, 'limit');
	advanceToInput(rules, 2);
	assert.equal(actions, 5);
});

test('act can remove itself without charging a different actor', () => {
	const queue = new Scheduler<{ player?: boolean; speed?: number }>();
	const npc = {}, player = { player: true };
	queue.add(npc); queue.add(player);
	const result = advanceToInput({ scheduler: queue, finished: () => false,
		needsInput: a => !!a.player, act: a => { queue.remove(a); return null; } }, 5);
	assert.deepEqual(result, { status: 'input', actor: player, steps: 1 });
	assert.equal(queue.timeOf(player), 0);
});

test('cost applies to the post-action current entry when explicitly returned', () => {
	let finished = false;
	const calls: unknown[] = [];
	const result = advanceToInput({ scheduler: { peek: () => 0, spend: c => calls.push(c) },
		finished: () => finished, needsInput: () => false,
		act: () => { calls.push('act'); finished = true; return 0.5; } }, 10);
	assert.deepEqual(calls, ['act', 0.5]);
	assert.deepEqual(result, { status: 'finished', steps: 1 });
});

test('invalid budgets and costs fail explicitly; action failures propagate', () => {
	const rules = { scheduler: { peek: () => 'npc', spend: () => assert.fail('spend') },
		finished: () => false, needsInput: () => false, act: () => -1 };
	for (const budget of [-1, 0.5, Infinity, NaN]) assert.throws(() => advanceToInput(rules, budget), RangeError);
	for (const cost of [-1, Infinity, NaN]) assert.throws(() => advanceToInput({ ...rules, act: () => cost }, 1), RangeError);
	assert.throws(() => advanceToInput({ ...rules, act: () => { throw new Error('rule failed'); } }, 1), /rule failed/);
});

type Counter = { value: number };
const count: SimulationRule<Counter, number, number, Generator> = (state, command, random) => {
	const value = state.value + command + random.int(3);
	return { state: { value }, events: [value], status: value >= 10 ? 'finished' : 'ready' };
};

test('headless scenarios use the supplied random state and stop at terminal output', () => {
	const run = () => runScenario({ state: { value: 0 }, commands: [1, 2, 100, 200], random: new Generator(7), step: count });
	const result = run();
	assert.deepEqual(result, run());
	assert.equal(result.status, 'finished');
	assert.equal(result.processedCommands, 3);
	assert.equal(result.events.length, 3);
});

test('splitting a scenario preserves ordered events and generator state', () => {
	const random = new Generator(5);
	const first = runScenario({ state: { value: 0 }, commands: [1], random, step: count });
	const saved = JSON.parse(JSON.stringify({ state: first.state, random: random.getState() }));
	const resumed = new Generator(0); resumed.setState(saved.random);
	const second = runScenario({ state: saved.state as Counter, commands: [2], random: resumed, step: count });
	const completeRandom = new Generator(5);
	const complete = runScenario({ state: { value: 0 }, commands: [1, 2], random: completeRandom, step: count });
	assert.deepEqual(second.state, complete.state);
	assert.deepEqual([...first.events, ...second.events], complete.events);
	assert.deepEqual(resumed.getState(), completeRandom.getState());
});

test('empty and already finished scenarios do not call the rules', () => {
	const state = { value: 7 };
	const step: typeof count = () => assert.fail('called');
	for (const [commands, status] of [[[], 'ready'], [[1], 'finished']] as const) {
		const result = runScenario({ state, commands, status, random: new Generator(0), step });
		assert.equal(result.state, state);
		assert.deepEqual(result.events, []);
		assert.equal(result.processedCommands, 0);
	}
});

test('rule errors propagate without claiming a partial scenario succeeded', () => {
	assert.throws(() => runScenario({ state: 0, commands: [1], random: null,
		step: () => { throw new Error('bad command'); } }), /bad command/);
});
