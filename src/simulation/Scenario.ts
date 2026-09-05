export type SimulationStatus = 'ready' | 'finished';

export interface SimulationStep<State, Event> {
	state: State;
	events: readonly Event[];
	status: SimulationStatus;
}

/** The game owns state, rules, event types, and the random-source interface. */
export type SimulationRule<State, Command, Event, Random> =
	(state: State, command: Command, random: Random) => SimulationStep<State, Event>;

export interface Scenario<State, Command, Event, Random> {
	state: State;
	/** Finite command sequence; automatic work inside a rule needs its own budget. */
	commands: readonly Command[];
	random: Random;
	step: SimulationRule<State, Command, Event, Random>;
	/** Use finished when resuming an already terminal snapshot. */
	status?: SimulationStatus;
}

export interface ScenarioResult<State, Event> extends SimulationStep<State, Event> {
	processedCommands: number;
}

/**
 * Run commands without frames, input devices, or rendering, collecting ordered events.
 * The random object is passed through unchanged. Reproducibility requires identical
 * initial state, random state, commands, and rules that use only those inputs.
 * No cloning or rollback is implicit: mutable rules and throwing rules remain the game's
 * responsibility. Persist a game's snapshot and random state together to resume a run.
 */
export function runScenario<State, Command, Event, Random>(
	scenario: Scenario<State, Command, Event, Random>,
): ScenarioResult<State, Event> {
	let state = scenario.state;
	let status = scenario.status ?? 'ready';
	const events: Event[] = [];
	let processedCommands = 0;
	for (const command of scenario.commands) {
		if (status === 'finished') break;
		const next = scenario.step(state, command, scenario.random);
		state = next.state;
		status = next.status;
		for (const event of next.events) events.push(event);
		processedCommands++;
	}
	return { state, events, status, processedCommands };
}
