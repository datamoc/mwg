import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Generator } from '../src/core/Random.ts';
import { runRollouts, TrainingEnvironment } from '../src/simulation/index.ts';
import type { TrainingCheckpoint } from '../src/simulation/index.ts';
import type { NeuralModel } from '../src/ai/index.ts';
import { courierEnvironment } from '../examples/neural/environment.ts';
import type { CourierState } from '../examples/neural/environment.ts';

//Game-owned evolution optimizer: framework training support does not choose an algorithm.
const config = { agents: 8, size: 8, horizon: 64 };
const environment = courierEnvironment({ TrainingEnvironment }, config);
const seeds = Array.from({ length: 16 }, (_, i) => i + 1);
const random = new Generator(395);
const initial: NeuralModel = {
	version: 1,
	observationVersion: 'courier-v1',
	layers: [{ inputSize: 2, outputSize: 4, weights: new Array(8).fill(0), biases: new Array(4).fill(0) }],
};
const score = (model: NeuralModel, evaluationSeeds = seeds): number => {
	const episodes = runRollouts(environment, model, { seeds: evaluationSeeds });
	return episodes.reduce((sum, episode) => sum + episode.rewards.reduce((a, b) => a + b, 0), 0) / episodes.length;
};
type Trainer = { iteration: number; random: [number, number, number, number]; score: number };
const directory = resolve('examples/neural/generated');
mkdirSync(directory, { recursive: true });
let best = structuredClone(initial);
let bestScore = score(best);
let iteration = 0;
if (process.argv.includes('--resume')) {
	const checkpoint = JSON.parse(readFileSync(resolve(directory, 'checkpoint.json'), 'utf8')) as TrainingCheckpoint<
		CourierState,
		Trainer
	>;
	if (checkpoint.version !== 1) throw new TypeError('unsupported trainer checkpoint');
	environment.restore(checkpoint.environment);
	best = checkpoint.model;
	bestScore = score(best);
	iteration = checkpoint.trainerState.iteration;
	random.setState(checkpoint.trainerState.random);
}
const countArgument = process.argv.indexOf('--iterations');
const iterations = countArgument < 0 ? 120 : Number(process.argv[countArgument + 1]);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000)
	throw new RangeError('--iterations must be in 1..10000');
const start = performance.now();
const baseline = score(
	initial,
	Array.from({ length: 32 }, (_, i) => i + 1001),
);
for (let i = 0; i < iterations; i++, iteration++) {
	const candidate = structuredClone(best);
	const amplitude = 1 / Math.sqrt(1 + iteration / 20);
	candidate.layers[0].weights = candidate.layers[0].weights.map(
		(value) => value + (random.float() * 2 - 1) * amplitude,
	);
	candidate.layers[0].biases = candidate.layers[0].biases.map(
		(value) => value + (random.float() * 2 - 1) * amplitude * 0.1,
	);
	const candidateScore = score(candidate);
	if (candidateScore > bestScore) {
		best = candidate;
		bestScore = candidateScore;
	}
}
const holdout = score(
	best,
	Array.from({ length: 32 }, (_, i) => i + 1001),
);
const checkpoint: TrainingCheckpoint<CourierState, Trainer> = {
	version: 1,
	model: best,
	environment: environment.snapshot(),
	trainerState: { iteration, random: random.getState(), score: bestScore },
};
writeFileSync(resolve(directory, 'model.json'), JSON.stringify(best, null, '\t') + '\n');
writeFileSync(resolve(directory, 'checkpoint.json'), JSON.stringify(checkpoint, null, '\t') + '\n');
console.log(
	JSON.stringify(
		{
			workload: '8 couriers, 8x8 board, 64 ticks',
			iterations: iteration,
			seconds: (performance.now() - start) / 1000,
			baselineHoldoutDeliveries: baseline,
			trainedHoldoutDeliveries: holdout,
			model: 'examples/neural/generated/model.json',
		},
		null,
		2,
	),
);
if (holdout <= baseline) throw new Error('trained policy did not improve on held-out seeds');
