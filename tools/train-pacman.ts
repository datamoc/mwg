import { mkdirSync, writeFileSync } from 'node:fs';
import { Generator } from '../src/core/Random.ts';
import { NeuralPolicy } from '../src/ai/index.ts';
import type { NeuralModel, NeuralObservation } from '../src/ai/index.ts';
import { TrainingEnvironment } from '../src/simulation/index.ts';
import { createMazeGame, expertScores } from '../examples/pacman/game.ts';

//Game-owned imitation training: fit action scores from the path-and-risk heuristic.
const game = createMazeGame();
const random = new Generator(395);
const choose = (observation: NeuralObservation): number => {
	const scores = expertScores(observation);
	return observation.mask!.reduce(
		(best, allowed, action) => (allowed && (best < 0 || scores[action] > scores[best]) ? action : best),
		-1,
	);
};
const environment = new TrainingEnvironment(
	{
		observationVersion: 'maze-chase-v1',
		initial: (random) => game.initial(random),
		observe: (state) => [game.observe(state)],
		command: (state, actions) => ({
			player: actions[0],
			ghosts: state.ghosts.map((_ghost, index) => choose(game.observe(state, index))),
		}),
		rule: game.rule,
		rewards: (before, _command, outcome) => [
			outcome.state.score - before.score - (before.lives - outcome.state.lives) * 200,
		],
		finished: (state) => state.status !== 'playing',
	},
	{ maxSteps: 500 },
);
const start = performance.now();
const samples: NeuralObservation[] = [];
for (let episode = 0; episode < 48; episode++) {
	let frame = environment.reset(episode);
	while (!frame.terminated && !frame.truncated) {
		const state = environment.snapshot().state;
		samples.push(frame.observations[0], ...state.ghosts.map((_ghost, index) => game.observe(state, index)));
		const legal = frame.observations[0].mask!.flatMap((allowed, action) => (allowed ? [action] : []));
		frame = environment.step([
			random.float() < 0.2 ? legal[random.int(legal.length)] : choose(frame.observations[0]),
		]);
	}
}
const model: NeuralModel = {
	version: 1,
	observationVersion: 'maze-chase-v1',
	layers: [
		{
			inputSize: 16,
			outputSize: 16,
			weights: Array.from({ length: 256 }, (_, i) => (i % 17 === 0 ? 1 : 0)),
			biases: new Array(16).fill(0),
		},
		{ inputSize: 16, outputSize: 4, weights: new Array(64).fill(0), biases: new Array(4).fill(0) },
	],
};
const weights = [...model.layers[1].weights],
	biases = [...model.layers[1].biases];
for (let epoch = 0; epoch < 12; epoch++)
	for (let sample = 0; sample < 8000; sample++) {
		const observation = samples[random.int(samples.length)];
		const targets = expertScores(observation);
		for (let action = 0; action < 4; action++) {
			let output = biases[action];
			for (let i = 0; i < 16; i++) output += weights[action * 16 + i] * observation.input[i];
			const gradient = Math.max(-10, Math.min(10, output - targets[action])) * 0.025;
			for (let i = 0; i < 16; i++) weights[action * 16 + i] -= gradient * observation.input[i];
			biases[action] -= gradient;
		}
	}
model.layers[1].weights = weights;
model.layers[1].biases = biases;
const policy = new NeuralPolicy(model);
let agree = 0,
	count = 0;
for (let episode = 0; episode < 8; episode++) {
	let frame = environment.reset(1000 + episode);
	while (!frame.terminated && !frame.truncated) {
		const state = environment.snapshot().state;
		for (const observation of [
			frame.observations[0],
			...state.ghosts.map((_ghost, index) => game.observe(state, index)),
		]) {
			if (policy.selectAction(observation) === choose(observation)) agree++;
			count++;
		}
		frame = environment.step([policy.selectAction(frame.observations[0])]);
	}
}
mkdirSync('examples/pacman/generated', { recursive: true });
writeFileSync('examples/pacman/generated/model.json', JSON.stringify(model, null, '\t') + '\n');
console.log(
	JSON.stringify(
		{
			training: 'headless imitation of path-and-risk heuristic',
			samples: samples.length,
			seconds: (performance.now() - start) / 1000,
			heldoutActionAgreement: agree / count,
		},
		null,
		2,
	),
);
if (agree / count < 0.8) throw new Error('maze imitation policy did not reach 80% held-out agreement');
