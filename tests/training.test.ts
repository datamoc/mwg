import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrainingEnvironment, runRollouts, runRolloutsAsync, runScenario } from '../src/simulation/index.ts';
import type { TrainingFactory, TrainingRules, TrainingCheckpoint } from '../src/simulation/index.ts';
import type { NeuralModel } from '../src/ai/index.ts';
import { Generator } from '../src/core/Random.ts';

const model: NeuralModel = {
	version: 1,
	observationVersion: 'walk-v1',
	layers: [{ inputSize: 1, outputSize: 2, weights: [-1, 1], biases: [0, 0] }],
};
const factory: TrainingFactory<{ limit: number }, { x: number }, number | null, number> = (
	{ TrainingEnvironment },
	config,
) => {
	return new TrainingEnvironment(
		{
			observationVersion: 'walk-v1',
			initial: (random) => ({ x: random.int(3) }),
			observe: (state) => [{ input: [5 - state.x], mask: [state.x > 0, true] }],
			command: (_state, actions) => actions[0],
			rule: (state, action, random) => {
				state.x += action === 1 ? 1 + random.int(2) : -1;
				return { state, events: [state.x], status: state.x >= 5 ? 'finished' : 'ready' };
			},
			rewards: (before, _action, outcome) => [outcome.state.x - before.x],
		},
		{ maxSteps: config.limit },
	);
};
const env = (limit = 10) => factory({ TrainingEnvironment }, { limit });

test('training episodes share simulation rules and advance without presentation or a predetermined command list', () => {
	const environment = env();
	const first = environment.reset(7);
	assert.equal(first.rewards[0], 0);
	const random = new Generator(7);
	const x = random.int(3);
	const step = (state: { x: number }, action: number, rng: Generator) => {
		state.x += action === 1 ? 1 + rng.int(2) : -1;
		return { state, events: [state.x], status: state.x >= 5 ? ('finished' as const) : ('ready' as const) };
	};
	const scenario = runScenario({ state: { x }, commands: [1], random, step });
	const frame = environment.step([1]);
	assert.deepEqual(environment.snapshot().state, scenario.state);
	assert.deepEqual(
		environment.snapshot().random,
		random.getState().map((value) => value >>> 0),
	);
	assert.equal(frame.rewards[0], scenario.state.x - x);
});

test('training distinguishes termination from time-limit truncation and refuses actions after either', () => {
	const short = env(1);
	short.reset(3);
	const frame = short.step([1]);
	assert.equal(frame.terminated, false);
	assert.equal(frame.truncated, true);
	assert.throws(() => short.step([1]), /reset/);
	const full = env();
	full.reset(3);
	let end = full.step([1]);
	while (!end.terminated) end = full.step([1]);
	assert.equal(end.truncated, false);
	assert.throws(() => full.step([1]), /reset/);
	assert.throws(() => env().step([1]), /reset/);
	assert.throws(() => env().snapshot(), /reset/);
});

test('training validates legal actions, idle masks, rewards, agent rosters and configuration', () => {
	assert.throws(() => env(0), RangeError);
	const environment = env();
	environment.reset(3);
	assert.throws(() => environment.reset(-1), RangeError);
	assert.throws(() => environment.step([]), RangeError);
	assert.throws(() => environment.step([null]), RangeError);
	assert.throws(() => environment.step([-1]), RangeError);
	assert.throws(() => environment.step([2]), RangeError);
	const rules: TrainingRules<number, number | null, never> = {
		observationVersion: 'idle',
		initial: () => 0,
		observe: () => [{ input: [0], mask: [false] }],
		command: (_state, actions) => actions[0],
		rule: (state) => ({ state: state + 1, status: 'ready', events: [] }),
		rewards: () => [0],
	};
	const idle = new TrainingEnvironment(rules, { maxSteps: 1 });
	idle.reset(1);
	assert.throws(() => idle.step([0]), RangeError);
	assert.equal(idle.step([null]).truncated, true);
	const bad = new TrainingEnvironment({ ...rules, rewards: () => [NaN] }, { maxSteps: 1 });
	bad.reset(1);
	assert.throws(() => bad.step([null]), TypeError);
	const roster = new TrainingEnvironment(
		{ ...rules, observe: (state) => Array.from({ length: state + 1 }, () => ({ input: [0], mask: [false] })) },
		{ maxSteps: 2 },
	);
	roster.reset(1);
	assert.throws(() => roster.step([null]), RangeError);
	const terminal = new TrainingEnvironment({ ...rules, finished: () => true }, { maxSteps: 1 });
	assert.equal(terminal.reset(1).terminated, true);
});

test('training snapshots resume mutable game state and random streams without reseeding', () => {
	const environment = env();
	environment.reset(7);
	environment.step([1]);
	const checkpoint: TrainingCheckpoint<{ x: number }, { iteration: number }> = {
		version: 1,
		model,
		environment: environment.snapshot(),
		trainerState: { iteration: 3 },
	};
	const restored = env();
	restored.restore(JSON.parse(JSON.stringify(checkpoint)).environment);
	assert.deepEqual(restored.step([1]), environment.step([1]));
	assert.deepEqual(restored.snapshot(), environment.snapshot());
	const invalid = environment.snapshot();
	invalid.observationVersion = 'different';
	assert.throws(() => restored.restore(invalid), TypeError);
	invalid.observationVersion = 'walk-v1';
	invalid.random = [0, 0, 0, 0];
	assert.throws(() => restored.restore(invalid), TypeError);
	assert.throws(() => env(1).restore(environment.snapshot()), TypeError);
});

test('rollouts replay seeds, preserve order and isolate environments across worker lanes', async () => {
	const options = { seeds: [7, 3, 7, 12], sample: true, trajectoryLimit: 2 };
	const sync = runRollouts(env(), model, options);
	assert.deepEqual(sync[0], sync[2]);
	assert.ok(sync.every((episode) => episode.trajectory.length <= 2));
	const async = await runRolloutsAsync(factory, { limit: 10 }, model, { ...options, jobs: 2 });
	assert.deepEqual(async, sync);
	assert.deepEqual(runRollouts(env(), model, { seeds: [7] })[0].trajectory, []);
});

test('rollout validation rejects schemas, excessive storage, bad seeds and invalid worker limits', async () => {
	assert.throws(() => runRollouts(env(), { ...model, observationVersion: 'bad' }, { seeds: [1] }), TypeError);
	for (const options of [
		{ seeds: [] },
		{ seeds: [-1] },
		{ seeds: new Array<number>(1) },
		{ seeds: [1, 2], trajectoryLimit: 5001 },
	]) {
		assert.throws(() => runRollouts(env(), model, options), RangeError);
		await assert.rejects(runRolloutsAsync(factory, { limit: 10 }, model, options), RangeError);
	}
	await assert.rejects(runRolloutsAsync(factory, { limit: 10 }, model, { seeds: [1], jobs: 0 }), RangeError);
	const abort = new AbortController();
	abort.abort(new Error('stopped'));
	assert.throws(() => runRollouts(env(), model, { seeds: [1], signal: abort.signal }), /stopped/);
	await assert.rejects(
		runRolloutsAsync(factory, { limit: 10 }, model, { seeds: [1], signal: abort.signal }),
		/stopped/,
	);
});

test('worker rollouts cancel hung factories and report closure errors instead of hanging', async () => {
	const hung = (() => {
		for (;;) {
			/* terminate externally */
		}
	}) as TrainingFactory<null, number, number, never>;
	const abort = new AbortController();
	const pending = runRolloutsAsync(hung, null, model, { seeds: [1, 2], jobs: 2, signal: abort.signal });
	abort.abort(new Error('cancelled'));
	await assert.rejects(pending, /cancelled/);
	await assert.rejects(runRolloutsAsync(hung, null, model, { seeds: [1], timeout: 30 }), /did not answer/);
	const closure = (() => env()) as TrainingFactory<null, { x: number }, number | null, number>;
	await assert.rejects(runRolloutsAsync(closure, null, model, { seeds: [1] }), /env is not defined/);
});
