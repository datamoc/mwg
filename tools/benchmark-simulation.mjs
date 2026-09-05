import { resolve } from 'node:path';

import { runScenario, advanceToInput } from '../src/simulation/index.ts';
import { readHistory, appendHistory, bestSeen } from './benchmark-history.mjs';

/**
 * Headless throughput for `mwg/simulation` - the one workload item 133/134's browser-focused
 * FPS gate (`benchmark-browser.mjs`) cannot measure at all, since neither runner touches a
 * frame, a canvas, or Pixi. A game driving a turn-heavy AI loop or a bulk command replay
 * through these runners has no other signal for whether a future change made that hot path
 * slower, so this gives it one: commands/actions processed per second, with the same
 * history-and-regression tracking `benchmark-browser.mjs` keeps for FPS.
 */

const root = resolve(import.meta.dirname, '..');
const commandsToRun = Number(process.env.MWG_BENCHMARK_COMMANDS ?? 200_000);
const turnStepsToRun = Number(process.env.MWG_BENCHMARK_TURN_STEPS ?? 200_000);
const maxRegression = Number(process.env.MWG_BENCHMARK_MAX_REGRESSION ?? 0.2);
const historyPath = resolve(root, 'benchmark-results', 'simulation.json');

function benchmarkScenario() {
	const commands = Array.from({ length: commandsToRun }, (_, i) => (i % 2 === 0 ? 1 : -1));
	const start = performance.now();
	const result = runScenario({
		state: { position: 0 },
		commands,
		random: null,
		step: (state, distance) => ({ state: { position: state.position + distance }, events: [], status: 'ready' }),
	});
	const elapsedMs = performance.now() - start;
	if (result.processedCommands !== commandsToRun) throw new Error('runScenario did not process every command');
	return { commandsPerSecond: (commandsToRun / elapsedMs) * 1000, elapsedMs };
}

function benchmarkTurns() {
	//a round-robin scheduler of a fixed size, cheap enough that the runner's own overhead
	//dominates the measurement rather than the fake scheduler's
	const actorCount = 100;
	let cursor = 0;
	let spent = 0;
	const scheduler = {
		peek: () => cursor,
		spend: (cost) => {
			spent += cost;
			cursor = (cursor + 1) % actorCount;
		},
	};
	const start = performance.now();
	const result = advanceToInput(
		{
			scheduler,
			finished: () => false,
			needsInput: () => false,
			act: () => 1,
		},
		turnStepsToRun,
	);
	const elapsedMs = performance.now() - start;
	if (result.status !== 'limit' || result.steps !== turnStepsToRun) throw new Error('advanceToInput did not run its full budget');
	void spent;
	return { stepsPerSecond: (turnStepsToRun / elapsedMs) * 1000, elapsedMs };
}

const scenario = benchmarkScenario();
const turns = benchmarkTurns();
const result = { timestamp: new Date().toISOString(), scenario, turns };
console.log(JSON.stringify(result, null, 2));

const history = await readHistory(historyPath);
const bestPrior = {
	commandsPerSecond: bestSeen(history, (entry) => entry.scenario.commandsPerSecond),
	stepsPerSecond: bestSeen(history, (entry) => entry.turns.stepsPerSecond),
};
await appendHistory(historyPath, history, result);

const regressions = [];
if (bestPrior.commandsPerSecond !== null && scenario.commandsPerSecond < bestPrior.commandsPerSecond * (1 - maxRegression)) {
	regressions.push(
		`runScenario throughput regressed: ${scenario.commandsPerSecond.toFixed(0)} commands/s now vs ` +
		`${bestPrior.commandsPerSecond.toFixed(0)} best-seen`,
	);
}
if (bestPrior.stepsPerSecond !== null && turns.stepsPerSecond < bestPrior.stepsPerSecond * (1 - maxRegression)) {
	regressions.push(
		`advanceToInput throughput regressed: ${turns.stepsPerSecond.toFixed(0)} steps/s now vs ` +
		`${bestPrior.stepsPerSecond.toFixed(0)} best-seen`,
	);
}
if (regressions.length > 0) throw new Error(regressions.join('; '));
