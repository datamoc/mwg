import { Generator } from '../core/Random.ts';
import { runScenario, type Scenario, type ScenarioResult } from './Scenario.ts';

export interface HeadlessScenario<State, Command, Event> {
	readonly seed: number;
	readonly initialState: State;
	readonly commands: readonly Command[];
	readonly step: Scenario<State, Command, Event, Generator>['step'];
	readonly status?: Scenario<State, Command, Event, Generator>['status'];
}

export interface HeadlessScenarioResult<State, Event> extends ScenarioResult<State, Event> {
	readonly seed: number;
	readonly random: readonly [number, number, number, number];
}

/**
 * Execute a deterministic scenario without a renderer, returning state, outputs and RNG state for CI.
 * @example
 * ```ts
 * import { runHeadlessScenario } from '@datamoc/mw_games/simulation';
 * const result = runHeadlessScenario({
 *   seed: 7, initialState: { score: 0 }, commands: [1],
 *   step: (state, command) => ({ state: { score: state.score + command }, events: [], status: 'ready' }),
 * });
 * ```
 */
export function runHeadlessScenario<State, Command, Event>(
	scenario: HeadlessScenario<State, Command, Event>,
): HeadlessScenarioResult<State, Event> {
	const random = new Generator(scenario.seed);
	const result = runScenario({
		state: structuredClone(scenario.initialState),
		commands: scenario.commands,
		status: scenario.status,
		random,
		step: scenario.step,
	});
	return { ...result, seed: scenario.seed, random: random.getState() };
}
