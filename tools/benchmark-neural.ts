import { deepEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { TrainingEnvironment, runRollouts, runRolloutsAsync } from '../src/simulation/index.ts';
import { NeuralPolicy } from '../src/ai/index.ts';
import type { NeuralModel } from '../src/ai/index.ts';
import { courierEnvironment } from '../examples/neural/environment.ts';

const model = JSON.parse(readFileSync('examples/neural/generated/model.json', 'utf8')) as NeuralModel;
const config = { agents: 8, size: 8, horizon: 128 };
const seeds = Array.from({ length: 256 }, (_, i) => i + 1);
const run = async (jobs: number) => {
	const before = performance.now();
	const episodes = jobs
		? await runRolloutsAsync(courierEnvironment, config, model, { seeds, jobs })
		: runRollouts(courierEnvironment({ TrainingEnvironment }, config), model, { seeds });
	const ms = performance.now() - before;
	return {
		episodes,
		metrics: {
			jobs,
			ms,
			stepsPerSecond: (episodes.reduce((sum, episode) => sum + episode.steps, 0) * 1000) / ms,
			episodesPerSecond: (episodes.length * 1000) / ms,
			mainHeapMB: process.memoryUsage().heapUsed / 1048576,
			processRssMB: process.memoryUsage().rss / 1048576,
		},
	};
};
//Warm up outside the timed portion; workers still include startup and model transfer.
runRollouts(courierEnvironment({ TrainingEnvironment }, config), model, { seeds: [1, 2] });
const serial = await run(0);
const parallel = await run(4);
deepEqual(parallel.episodes, serial.episodes);
const policy = new NeuralPolicy(model);
const inputs = Array.from({ length: 4096 }, (_, i) => [((i % 8) - 4) / 8, 0.25]);
let before = performance.now();
const local = inputs.map((input) => policy.predict(input));
const synchronousInferenceMs = performance.now() - before;
before = performance.now();
const worker = await policy.predictBatchAsync(inputs);
const workerInferenceMs = performance.now() - before;
deepEqual(worker, local);
console.log(
	JSON.stringify(
		{
			machine: { cpu: cpus()[0]?.model, parallelism: availableParallelism(), node: process.version },
			workload: '256 episodes, 8 couriers, 8x8 board, 128 ticks',
			serial: serial.metrics,
			parallel: parallel.metrics,
			parallelSpeedup: serial.metrics.ms / parallel.metrics.ms,
			inference: { observations: inputs.length, synchronousInferenceMs, workerInferenceMs },
		},
		null,
		2,
	),
);
