import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TrainingEnvironment, imitationFromReplay, runSeededEpisode } from '../src/simulation/index.ts';
import type { NeuralObservation } from '../src/ai/index.ts';
import { Generator } from '../src/core/Random.ts';

const env = (maxSteps = 12) =>
	new TrainingEnvironment<{ x: number }, number, number>(
		{
			observationVersion: 'walk-v1',
			initial: (random) => ({ x: random.int(3) }),
			observe: (state) => [{ input: [5 - state.x], mask: [state.x > 0, true] }],
			command: (_state, actions) => actions[0] ?? 0,
			rule: (state, action, random) => {
				state.x += action === 1 ? 1 + random.int(2) : -1;
				return { state, events: [state.x], status: state.x >= 5 ? 'finished' : 'ready' };
			},
			rewards: (before, _command, outcome) => [outcome.state.x - before.x],
		},
		{ maxSteps },
	);

test('imitation walks a recorded run against the same seeded environment it was played on', () => {
	const firstObservation = env().reset(7).observations[0];
	const result = imitationFromReplay(env(), {
		actions: ['up', 'down'],
		events: [
			{ frame: 0, action: 'down' },
			{ frame: 1, action: 'down' },
		],
		seed: 7,
	});

	assert.equal(result.steps, 2);
	assert.deepEqual(result.samples[0].observation, firstObservation);
	assert.equal(result.samples[0].action, 1);
	assert.equal(result.samples[0].frame, 0);
	//the second sample observes the state after the first step, not the initial one
	assert.notDeepEqual(result.samples[1].observation, result.samples[0].observation);
	assert.equal(result.samples[1].action, 1);
});

test('imitation is exact: the walked trajectory matches the same actions played by hand', () => {
	const events = [
		{ frame: 0, action: 'down' },
		{ frame: 1, action: 'down' },
		{ frame: 2, action: 'down' },
	];
	const byImitation = imitationFromReplay(env(), { actions: ['up', 'down'], events, seed: 7 });

	const byHand = env();
	byHand.reset(7);
	const states: number[] = [];
	for (const _event of events) {
		byHand.step([1]);
		states.push(byHand.snapshot().state.x);
	}

	assert.deepEqual(
		byImitation.samples.map((sample) => sample.observation.input),
		//sample i observes before its own step: the initial x, then each state but the last
		[[5 - new Generator(7).int(3)], ...states.slice(0, -1).map((x) => [5 - x])],
	);
});

test('a recorded action outside the list is a named error, not a skipped event', () => {
	assert.throws(
		() =>
			imitationFromReplay(env(), {
				actions: ['up', 'down'],
				events: [{ frame: 0, action: 'teleport' }],
				seed: 7,
			}),
		/teleport.*not in the action list/,
	);
});

test('imitation stops where the environment does, reporting which way it ended', () => {
	const truncated = imitationFromReplay(env(2), {
		actions: ['up', 'down'],
		events: Array.from({ length: 6 }, (_, index) => ({ frame: index, action: 'down' })),
		seed: 7,
	});
	assert.equal(truncated.steps, 2);
	assert.equal(truncated.truncated, true);
	assert.equal(truncated.terminated, false);

	const finished = imitationFromReplay(env(), {
		actions: ['up', 'down'],
		events: Array.from({ length: 20 }, (_, index) => ({ frame: index, action: 'down' })),
		seed: 7,
	});
	assert.equal(finished.terminated, true);
	assert.ok(finished.steps < 20, `the run finished before the recording ran out (${finished.steps})`);
});

test('imitation trains the recorded player alone: a multi-agent environment is refused by name', () => {
	const twoAgents = new TrainingEnvironment<{ x: number }, number, number>(
		{
			observationVersion: 'walk-v1',
			initial: () => ({ x: 0 }),
			observe: (state) => [
				{ input: [state.x], mask: [true, true] },
				{ input: [state.x], mask: [true, true] },
			],
			command: (_state, actions) => actions[0] ?? 0,
			rule: (state) => ({ state, events: [], status: 'ready' }),
			rewards: () => [0, 0],
		},
		{ maxSteps: 4 },
	);

	assert.throws(() => imitationFromReplay(twoAgents, { actions: ['a', 'b'], events: [], seed: 1 }), /one agent/);
});

test('a seeded AI run reproduces the same decisions and rewards for the same seed', () => {
	const choose = (_observations: readonly NeuralObservation[]) => [1];

	const first = runSeededEpisode(env(), choose, { seed: 7 });
	const second = runSeededEpisode(env(), choose, { seed: 7 });

	assert.deepEqual(first, second);
	assert.equal(first.terminated, true);
	assert.ok(first.steps >= 1);
	assert.deepEqual(
		first.actions,
		Array.from({ length: first.steps }, () => [1]),
	);
	//the cumulative reward is the distance walked: 5 minus the seeded start
	const start = new Generator(7).int(3);
	assert.equal(first.rewards[0], 5 - start);
});

test('a seeded AI run differs across seeds and refuses a malformed chooser', () => {
	const choose = (_observations: readonly NeuralObservation[]) => [1];
	const bySeed = (seed: number) => runSeededEpisode(env(), choose, { seed });
	const seeds = [1, 2, 3, 4, 5, 6].map(bySeed);

	//at least one seed starts somewhere else, so the runs cannot all be identical
	const distinct = new Set(seeds.map((run) => JSON.stringify(run.actions)));
	assert.ok(distinct.size > 1, `the seeds produced one identical run (${distinct.size})`);

	assert.throws(() => runSeededEpisode(env(), () => [], { seed: 7 }), /one action per agent/);
});

test('a seeded run that never finishes reports truncation rather than hanging', () => {
	const stuck = new TrainingEnvironment<{ x: number }, number, number>(
		{
			observationVersion: 'stuck-v1',
			initial: () => ({ x: 0 }),
			observe: (state) => [{ input: [state.x], mask: [true] }],
			command: () => 0,
			rule: (state) => ({ state, events: [], status: 'ready' }),
			rewards: () => [0],
		},
		{ maxSteps: 5 },
	);

	const run = runSeededEpisode(stuck, () => [0], { seed: 1 });

	assert.equal(run.steps, 5);
	assert.equal(run.truncated, true);
	assert.equal(run.terminated, false);
});
