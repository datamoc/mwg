import { Generator } from '../core/Random.ts';
import { Scheduler, type Actor, type SchedulerSnapshot } from '../roguelike/Scheduler.ts';
import type { SimulationStatus } from './Scenario.ts';

/** What a rule receives besides state and command: the two sources of non-determinism a
 * simulation must route explicitly rather than reach for globally. */
export interface SimulationContext<A extends Actor> {
	readonly random: Generator;
	readonly scheduler: Scheduler<A>;
}

export interface SimulationOutcome<State, Event> {
	state: State;
	events: readonly Event[];
	status: SimulationStatus;
	/** time this command cost its actor at speed 1, charged via `scheduler.spend`; omit or
	 * null for a command that does not consume a scheduler turn (a menu action, a query). */
	cost?: number | null;
}

export type SimulationRuntimeRule<State, Command, Event, A extends Actor> = (
	state: State,
	command: Command,
	context: SimulationContext<A>,
) => SimulationOutcome<State, Event>;

/** The logical state a game needs to resume a run bit-for-bit: not the storage format
 * (`core.SaveSystem` owns that), but what it wraps. */
export interface SimulationSnapshot<State> {
	version: number;
	state: State;
	scheduler: SchedulerSnapshot;
	random: readonly [number, number, number, number];
}

/**
 * A small facade over one state + one scheduler + one RNG, for the interactive half of a
 * turn-based simulation: the command a player just issued, dispatched through the game's own
 * rule. `advanceToInput`/`runScenario` (`simulation/Turns.ts`/`Scenario.ts`) still cover the
 * automatic-actor loop and fixed-command replay respectively; a game composes both against
 * the same `scheduler` rather than choosing one over the other.
 *
 * @example
 * ```ts
 * import { SimulationRuntime, type SimulationRuntimeRule } from '@datamoc/mw_games/simulation';
 * import { Scheduler, type Actor } from '@datamoc/mw_games/roguelike';
 * import { Generator } from '@datamoc/mw_games/core';
 *
 * interface Fighter extends Actor { id: string; hp: number }
 * type State = { hero: Fighter; rat: Fighter };
 * type Command = 'attack';
 * type Event = { type: 'damage'; targetId: string; amount: number };
 *
 * const rule: SimulationRuntimeRule<State, Command, Event, Fighter> = (state, _cmd, { random }) => {
 *   const amount = random.int(3) + 1;
 *   const rat = { ...state.rat, hp: state.rat.hp - amount };
 *   const next = { ...state, rat };
 *   return { state: next, events: [{ type: 'damage', targetId: rat.id, amount }], status: 'ready', cost: 1 };
 * };
 *
 * const hero: Fighter = { id: 'hero', hp: 10 };
 * const rat: Fighter = { id: 'rat', hp: 5 };
 * const scheduler = new Scheduler<Fighter>();
 * scheduler.add(hero);
 * scheduler.add(rat);
 *
 * const runtime = new SimulationRuntime<State, Command, Event, Fighter>({
 *   state: { hero, rat },
 *   scheduler,
 *   random: new Generator(1),
 *   rule,
 *   actorId: (fighter) => fighter.id,
 * });
 *
 * const { events } = runtime.dispatch('attack');
 * ```
 */
export class SimulationRuntime<State, Command, Event, A extends Actor> {
	private _state: State;
	readonly scheduler: Scheduler<A>;
	readonly random: Generator;
	private readonly rule: SimulationRuntimeRule<State, Command, Event, A>;
	private readonly actorId: (actor: A) => string;

	constructor(options: {
		state: State;
		scheduler: Scheduler<A>;
		random: Generator;
		rule: SimulationRuntimeRule<State, Command, Event, A>;
		actorId: (actor: A) => string;
	}) {
		this._state = options.state;
		this.scheduler = options.scheduler;
		this.random = options.random;
		this.rule = options.rule;
		this.actorId = options.actorId;
	}

	get state(): State {
		return this._state;
	}

	/** Runs one command through the rule, commits the resulting state, and charges its cost
	 * to the scheduler's current actor when one is given. */
	dispatch(command: Command): SimulationOutcome<State, Event> {
		const outcome = this.rule(this._state, command, { random: this.random, scheduler: this.scheduler });
		this._state = outcome.state;
		if (outcome.cost != null) this.scheduler.spend(outcome.cost);
		return outcome;
	}

	snapshot(version = 1): SimulationSnapshot<State> {
		return {
			version,
			state: this._state,
			scheduler: this.scheduler.toJSON(this.actorId),
			random: this.random.getState(),
		};
	}

	/**
	 * Rebuilds a runtime from a snapshot taken by `snapshot()`. The caller supplies
	 * `actorOf` to resolve the scheduler's ids back to live actor objects, the same way
	 * `Scheduler.restore` does - the runtime has no identity primitive of its own to lean on.
	 */
	static restore<State, Command, Event, A extends Actor>(
		snapshot: SimulationSnapshot<State>,
		options: {
			rule: SimulationRuntimeRule<State, Command, Event, A>;
			actorOf: (id: string) => A;
			actorId: (actor: A) => string;
		},
	): SimulationRuntime<State, Command, Event, A> {
		const random = new Generator();
		random.setState(snapshot.random);
		const scheduler = Scheduler.restore<A>(snapshot.scheduler, options.actorOf);
		return new SimulationRuntime<State, Command, Event, A>({
			state: snapshot.state,
			scheduler,
			random,
			rule: options.rule,
			actorId: options.actorId,
		});
	}
}
