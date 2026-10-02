import { Generator } from '../core/Random.ts';
import { createNeuralEvaluator } from '../ai/Neural.ts';
import type { NeuralModel, NeuralObservation } from '../ai/Neural.ts';
import { spawn } from '../threads/index.ts';
import type { SimulationRule, SimulationStep } from './Scenario.ts';

export interface TrainingRules<State, Command, Event> {
	observationVersion: string;
	initial(random: Generator): State;
	/** Same rule used by the playable game; a command may advance a turn or fixed ticks. */
	rule: SimulationRule<State, Command, Event, Generator>;
	observe(state: State): readonly NeuralObservation[];
	command(state: State, actions: readonly (number | null)[]): Command;
	/** One reward per agent, in the observation's stable roster order. */
	rewards(before: State, command: Command, outcome: SimulationStep<State, Event>): readonly number[];
	/** Detect an already-terminal reset, without taking a dummy action. */
	finished?(state: State): boolean;
}

export interface TrainingFrame {
	observations: readonly NeuralObservation[];
	rewards: readonly number[];
	terminated: boolean;
	truncated: boolean;
}

export interface TrainingSnapshot<State> {
	version: 1;
	observationVersion: string;
	state: State;
	seed: number;
	random: readonly [number, number, number, number];
	steps: number;
	maxSteps: number;
	terminated: boolean;
	truncated: boolean;
}

/** A trainer persists its optimizer/exploration state alongside the environment and model. */
export interface TrainingCheckpoint<State, TrainerState> {
	version: 1;
	model: NeuralModel;
	environment: TrainingSnapshot<State>;
	trainerState: TrainerState;
}

/**
 * Seeded, UI-free reset/step adapter over a game's existing SimulationRule.
 * Observations and rewards use a fixed agent roster within each episode. A null
 * action is legal only when all actions for that agent are masked. The rule owns
 * idle semantics. No presentation events or command journal are retained.
 *
 * @example
 * ```ts
 * import { TrainingEnvironment } from '@datamoc/mw_games/simulation';
 * const env = new TrainingEnvironment({ observationVersion: 'counter-v1',
 *   initial: () => ({ x: 0 }), observe: s => [{ input: [s.x], mask: [true] }],
 *   command: (_s, actions) => actions[0],
 *   rule: s => ({ state: { x: s.x + 1 }, events: [], status: 'ready' }),
 *   rewards: () => [1],
 * }, { maxSteps: 10 });
 * env.reset(7);
 * const frame = env.step([0]);
 * const checkpoint = env.snapshot();
 * env.restore(checkpoint); // resumes state and RNG, without replaying reset
 * ```
 */
export class TrainingEnvironment<State, Command, Event> {
	private state!: State;
	private random: Generator;
	private steps = 0;
	private terminated = false;
	private ready = false;
	private agentCount = 0;
	readonly maxSteps: number;
	readonly observationVersion: string;
	private readonly rules: TrainingRules<State, Command, Event>;
	private readonly Random: typeof Generator;

	private get truncated(): boolean {
		return !this.terminated && this.steps >= this.maxSteps;
	}

	constructor(rules: TrainingRules<State, Command, Event>, options: { maxSteps: number }, Random = Generator) {
		this.rules = rules;
		this.Random = Random;
		this.random = new this.Random(0);
		if (!Number.isInteger(options.maxSteps) || options.maxSteps < 1 || options.maxSteps > 1_000_000)
			throw new RangeError('training maxSteps must be in 1..1000000');
		if (typeof rules.observationVersion !== 'string' || !rules.observationVersion.length)
			throw new TypeError('training requires an observation version');
		this.maxSteps = options.maxSteps;
		this.observationVersion = rules.observationVersion;
	}

	reset(seed: number): TrainingFrame {
		if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
			throw new RangeError('training seed must be uint32');
		this.random = new this.Random(seed);
		this.state = this.rules.initial(this.random);
		this.steps = 0;
		this.terminated = this.rules.finished?.(this.state) ?? false;
		this.ready = true;
		const observations = this.observations();
		this.agentCount = observations.length;
		return { observations, rewards: observations.map(() => 0), terminated: this.terminated, truncated: false };
	}

	step(actions: readonly (number | null)[]): TrainingFrame {
		if (!this.ready || this.terminated || this.truncated)
			throw new Error('training episode needs reset before step');
		const observations = this.observations();
		if (actions.length !== this.agentCount)
			throw new RangeError('training action count must match the agent roster');
		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];
			const mask = observations[i].mask;
			if (
				action === null
					? !mask || mask.some(Boolean)
					: !Number.isInteger(action) || action < 0 || (mask && (action >= mask.length || !mask[action]))
			)
				throw new RangeError('training action is not legal');
		}
		//Rewards can inspect a mutable rule's pre-transition state without keeping a history.
		const before = structuredClone(this.state);
		const command = this.rules.command(this.state, actions);
		const outcome = this.rules.rule(this.state, command, this.random);
		const rewards = Array.from(this.rules.rewards(before, command, outcome));
		if (rewards.length !== this.agentCount || !rewards.every(Number.isFinite))
			throw new TypeError('training rewards must be finite and match the agent roster');
		this.state = outcome.state;
		this.steps++;
		this.terminated = outcome.status === 'finished';
		const next = this.observations();
		if (next.length !== this.agentCount) throw new RangeError('training agent roster changed during an episode');
		return { observations: next, rewards, terminated: this.terminated, truncated: this.truncated };
	}

	snapshot(): TrainingSnapshot<State> {
		if (!this.ready) throw new Error('training environment needs reset before snapshot');
		return structuredClone({
			version: 1,
			observationVersion: this.observationVersion,
			state: this.state,
			seed: this.random.seed,
			random: this.random.getState().map((value) => value >>> 0) as [number, number, number, number],
			steps: this.steps,
			maxSteps: this.maxSteps,
			terminated: this.terminated,
			truncated: this.truncated,
		});
	}

	restore(snapshot: TrainingSnapshot<State>): TrainingFrame {
		if (
			snapshot.version !== 1 ||
			snapshot.observationVersion !== this.observationVersion ||
			snapshot.maxSteps !== this.maxSteps
		)
			throw new TypeError('training snapshot version, schema or step limit does not match');
		if (
			!Number.isInteger(snapshot.steps) ||
			snapshot.steps < 0 ||
			snapshot.steps > this.maxSteps ||
			!Number.isInteger(snapshot.seed) ||
			snapshot.seed < 0 ||
			snapshot.seed > 0xffffffff ||
			!Array.isArray(snapshot.random) ||
			snapshot.random.length !== 4 ||
			!snapshot.random.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff) ||
			!snapshot.random.some((value) => value !== 0) ||
			typeof snapshot.terminated !== 'boolean' ||
			typeof snapshot.truncated !== 'boolean' ||
			(snapshot.terminated && snapshot.truncated) ||
			snapshot.truncated !== (!snapshot.terminated && snapshot.steps === this.maxSteps)
		)
			throw new TypeError('invalid training snapshot');
		this.state = structuredClone(snapshot.state);
		this.random = new this.Random(snapshot.seed);
		this.random.setState(snapshot.random);
		this.steps = snapshot.steps;
		this.terminated = snapshot.terminated;
		this.ready = true;
		const observations = this.observations();
		this.agentCount = observations.length;
		return {
			observations,
			rewards: observations.map(() => 0),
			terminated: this.terminated,
			truncated: this.truncated,
		};
	}

	private observations(): NeuralObservation[] {
		const observations = structuredClone(Array.from(this.rules.observe(this.state)));
		if (!observations.length || observations.length > 4096)
			throw new RangeError('training requires 1..4096 agents');
		for (const observation of observations) {
			if (
				!observation.input.length ||
				observation.input.length > 4096 ||
				!Array.from(observation.input).every(Number.isFinite) ||
				(observation.mask &&
					(!observation.mask.length ||
						observation.mask.length > 4096 ||
						!Array.from(observation.mask).every((value) => typeof value === 'boolean')))
			)
				throw new TypeError('invalid training observation');
		}
		return observations;
	}
}

export interface RolloutOptions {
	seeds: readonly number[];
	/** Sample softmax scores using a separate seeded stream, leaving game RNG unchanged. */
	sample?: boolean;
	/** First transitions per episode to keep; defaults to zero, at most 10000 total per batch. */
	trajectoryLimit?: number;
	signal?: AbortSignal;
}

export interface TrainingTransition {
	before: TrainingFrame;
	actions: readonly (number | null)[];
	after: TrainingFrame;
}

export interface RolloutEpisode {
	seed: number;
	steps: number;
	rewards: number[];
	terminated: boolean;
	truncated: boolean;
	trajectory: TrainingTransition[];
}

/**
 * Interactive rollouts at simulation speed, with a fresh seeded reset per episode.
 * The evaluator is created once per batch and shares its buffers across agents.
 * A synchronous signal is checked between steps; cancellation from another event
 * on the same thread requires the async worker path.
 *
 * @example
 * ```ts
 * import { runRollouts, TrainingEnvironment } from '@datamoc/mw_games/simulation';
 * import type { NeuralModel } from '@datamoc/mw_games/ai';
 * declare const env: TrainingEnvironment<{ x: number }, number, never>;
 * declare const model: NeuralModel;
 * const episodes = runRollouts(env, model, { seeds: [1, 2, 3], trajectoryLimit: 2 });
 * ```
 */
export function runRollouts<State, Command, Event>(
	environment: TrainingEnvironment<State, Command, Event>,
	model: NeuralModel,
	options: RolloutOptions,
): RolloutEpisode[] {
	validateRolloutOptions(options);
	return rolloutKernel(environment, model, options, { Generator, createNeuralEvaluator });
}

function validateRolloutOptions(options: RolloutOptions): void {
	const limit = options.trajectoryLimit ?? 0;
	if (
		!options.seeds.length ||
		options.seeds.length > 10000 ||
		!Array.from(options.seeds).every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) ||
		!Number.isInteger(limit) ||
		limit < 0 ||
		limit * options.seeds.length > 10000
	)
		throw new RangeError('rollouts require 1..10000 uint32 seeds and at most 10000 stored transitions');
}

//Explicit dependencies survive identifier renaming in a bundled file:// game.
function rolloutKernel<State, Command, Event>(
	environment: TrainingEnvironment<State, Command, Event>,
	model: NeuralModel,
	options: RolloutOptions,
	tools: { Generator: typeof Generator; createNeuralEvaluator: typeof createNeuralEvaluator },
): RolloutEpisode[] {
	if (model.observationVersion !== environment.observationVersion)
		throw new TypeError('model observation schema does not match environment');
	const limit = options.trajectoryLimit ?? 0;
	const policy = tools.createNeuralEvaluator(model);
	return Array.from(options.seeds, (seed) => {
		if (options.signal?.aborted) throw options.signal.reason;
		const random = new tools.Generator((seed ^ 0x9e3779b9) >>> 0);
		let frame = environment.reset(seed);
		const rewards = frame.rewards.map(() => 0);
		const trajectory: TrainingTransition[] = [];
		let steps = 0;
		while (!frame.terminated && !frame.truncated) {
			if (options.signal?.aborted) throw options.signal.reason;
			const actions = frame.observations.map((observation) =>
				policy.select(observation, options.sample ? () => random.float() : undefined),
			);
			const next = environment.step(actions);
			for (let i = 0; i < rewards.length; i++) {
				rewards[i] += next.rewards[i];
				if (!Number.isFinite(rewards[i])) throw new RangeError('training cumulative reward overflow');
			}
			if (trajectory.length < limit) trajectory.push({ before: frame, actions, after: next });
			frame = next;
			steps++;
		}
		return { seed, steps, rewards, terminated: frame.terminated, truncated: frame.truncated, trajectory };
	});
}

/** Factory must be self-contained, like threads.spawn; use the supplied constructor rather than imports. */
export type TrainingFactory<Config, State, Command, Event> = (
	tools: { TrainingEnvironment: typeof TrainingEnvironment },
	config: Config,
) => TrainingEnvironment<State, Command, Event>;

//Rehydrate the very same classes and runner, not a second implementation of simulation or inference.
function rolloutBatch(
	sources: string[],
	config: unknown,
	model: NeuralModel,
	options: RolloutOptions,
): RolloutEpisode[] {
	const Generator = new Function(`return (${sources[0]});`)();
	const createNeuralEvaluator = new Function(`return (${sources[1]});`)();
	const Environment = new Function(`return (${sources[2]});`)();
	//The serialized class's optional RNG default may be renamed by a bundler.
	//Always inject it explicitly, so that expression is never evaluated in a worker.
	const TrainingEnvironment = class extends Environment {
		constructor(rules: unknown, options: unknown) {
			super(rules, options, Generator);
		}
	};
	const run = new Function(`return (${sources[3]});`)();
	const factory = new Function(`return (${sources[4]});`)();
	return run(factory({ TrainingEnvironment }, config), model, options, { Generator, createNeuralEvaluator });
}

/**
 * One worker per episode shard, with isolated environments and bounded concurrency.
 * A model and environment stay loaded for the shard's whole batch. Returned episodes
 * stay in seed order independent of worker completion order. Abort or failure kills
 * every lane; no partial result is applied to a game. Keep the factory self-contained
 * and pass structured-cloneable configuration, not closures or class instances.
 *
 * @example
 * ```ts
 * import { runRolloutsAsync, type TrainingFactory } from '@datamoc/mw_games/simulation';
 * import type { NeuralModel } from '@datamoc/mw_games/ai';
 * declare const factory: TrainingFactory<{ maxSteps: number }, { x: number }, number, never>;
 * declare const model: NeuralModel;
 * const episodes = await runRolloutsAsync(factory, { maxSteps: 20 }, model, { seeds: [1, 2], jobs: 2 });
 * ```
 */
export async function runRolloutsAsync<Config, State, Command, Event>(
	factory: TrainingFactory<Config, State, Command, Event>,
	config: Config,
	model: NeuralModel,
	options: RolloutOptions & { jobs?: number; timeout?: number },
): Promise<RolloutEpisode[]> {
	const jobs = options.jobs ?? 4;
	if (!Number.isInteger(jobs) || jobs < 1 || jobs > 64) throw new RangeError('rollout jobs must be in 1..64');
	if (options.signal?.aborted) throw options.signal.reason;
	//Validate and bound the whole batch before sharding, without taking a simulation step.
	const limit = options.trajectoryLimit ?? 0;
	validateRolloutOptions(options);
	createNeuralEvaluator(model);
	const abort = new AbortController();
	const cancel = (): void => abort.abort(options.signal?.reason);
	options.signal?.addEventListener('abort', cancel, { once: true });
	const sources = [
		Generator.toString(),
		createNeuralEvaluator.toString(),
		TrainingEnvironment.toString(),
		rolloutKernel.toString(),
		factory.toString(),
	];
	const lanes = Math.min(jobs, options.seeds.length);
	try {
		return (
			await Promise.all(
				Array.from({ length: lanes }, (_, lane) => {
					const start = Math.floor((lane * options.seeds.length) / lanes);
					const end = Math.floor(((lane + 1) * options.seeds.length) / lanes);
					const seeds = options.seeds.slice(start, end);
					return spawn(
						rolloutBatch,
						[sources, config, model, { seeds, sample: options.sample, trajectoryLimit: limit }],
						{ signal: abort.signal, timeout: options.timeout },
					);
				}),
			)
		).flat();
	} finally {
		abort.abort();
		options.signal?.removeEventListener('abort', cancel);
	}
}
