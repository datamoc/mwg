import { Generator } from '../core/Random.ts';
import { ActionJournal, type ActionJournalEntry } from '../core/ActionJournal.ts';
import { stateChecksum } from '../core/SyncGuard.ts';
import { UndoHistory, type UndoHistoryOptions } from '../core/UndoHistory.ts';
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
	/** Commands already committed, retained for replay, undo checkpoints, and diagnostics. */
	readonly journal?: readonly ActionJournalEntry<unknown, unknown>[];
}

export interface SimulationReplayMismatch<Command, Event> {
	readonly index: number;
	readonly action: Command;
	readonly expectedEvents: readonly Event[];
	readonly actualEvents: readonly Event[];
	readonly reason: 'sequence' | 'events' | 'execution' | 'final-state';
	readonly error?: string;
}

export interface SimulationReplayResult<State, Command, Event> {
	readonly valid: boolean;
	readonly checked: number;
	readonly state: State;
	readonly journal: readonly ActionJournalEntry<Command, Event>[];
	readonly mismatch?: SimulationReplayMismatch<Command, Event>;
}

export interface SimulationRuntimeHistoryOptions<A extends Actor = Actor> extends UndoHistoryOptions {
	/** Resolves scheduler actor ids when an undo or redo restores a checkpoint. */
	readonly actorOf: (id: string) => A;
}

/**
 * Replays a journal from an initial snapshot and compares deterministic event batches. The
 * initial snapshot is treated as a checkpoint, so any journal it carries is ignored. An optional
 * final-state check catches rules that changed state without emitting an event.
 *
 * @example
 * ```ts
 * import { validateSimulationReplay, type SimulationRuntimeRule, type SimulationSnapshot } from '@datamoc/mw_games/simulation';
 * import type { ActionJournalEntry } from '@datamoc/mw_games/core';
 * import type { Actor } from '@datamoc/mw_games/roguelike';
 *
 * declare const initialSnapshot: SimulationSnapshot<unknown>;
 * declare const recordedJournal: readonly ActionJournalEntry<unknown, unknown>[];
 * declare const rule: SimulationRuntimeRule<unknown, unknown, unknown, Actor>;
 * declare const actorOf: (id: string) => Actor;
 * declare const actorId: (actor: Actor) => string;
 * const result = validateSimulationReplay(initialSnapshot, recordedJournal, {
 *   rule, actorOf, actorId,
 * });
 * if (!result.valid) console.error('replay diverged at', result.mismatch?.index);
 * ```
 */
export function validateSimulationReplay<State, Command, Event, A extends Actor>(
	initial: SimulationSnapshot<State>,
	entries: readonly ActionJournalEntry<Command, Event>[],
	options: {
		rule: SimulationRuntimeRule<State, Command, Event, A>;
		actorOf: (id: string) => A;
		actorId: (actor: A) => string;
		expectedFinalState?: State;
	},
): SimulationReplayResult<State, Command, Event> {
	const runtime = SimulationRuntime.restore({ ...initial, journal: [] }, options);
	const failed = (
		value: SimulationReplayMismatch<Command, Event>,
	): SimulationReplayResult<State, Command, Event> => ({
		valid: false,
		checked: value.index,
		state: runtime.state,
		journal: runtime.journal.toJSON(),
		mismatch: value,
	});
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (entry.sequence !== index)
			return failed({
				index,
				action: entry.action,
				expectedEvents: entry.events,
				actualEvents: [],
				reason: 'sequence',
			});
		let outcome: SimulationOutcome<State, Event>;
		try {
			outcome = runtime.dispatch(entry.action);
		} catch (error) {
			return failed({
				index,
				action: entry.action,
				expectedEvents: entry.events,
				actualEvents: [],
				reason: 'execution',
				error: error instanceof Error ? error.message : String(error),
			});
		}
		if (stateChecksum(outcome.events) !== stateChecksum(entry.events))
			return failed({
				index,
				action: entry.action,
				expectedEvents: entry.events,
				actualEvents: outcome.events,
				reason: 'events',
			});
	}
	if (
		options.expectedFinalState !== undefined &&
		stateChecksum(runtime.state) !== stateChecksum(options.expectedFinalState)
	)
		return failed({
			index: entries.length,
			action: entries.at(-1)?.action as Command,
			expectedEvents: [],
			actualEvents: [],
			reason: 'final-state',
		});
	return { valid: true, checked: entries.length, state: runtime.state, journal: runtime.journal.toJSON() };
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
	private _scheduler: Scheduler<A>;
	readonly random: Generator;
	readonly journal: ActionJournal<Command, Event>;
	private readonly rule: SimulationRuntimeRule<State, Command, Event, A>;
	private readonly actorId: (actor: A) => string;
	private readonly history: UndoHistory<SimulationSnapshot<State>> | null;
	private readonly actorOf: ((id: string) => A) | null;

	constructor(options: {
		state: State;
		scheduler: Scheduler<A>;
		random: Generator;
		rule: SimulationRuntimeRule<State, Command, Event, A>;
		actorId: (actor: A) => string;
		journal?: ActionJournal<Command, Event>;
		history?: SimulationRuntimeHistoryOptions<A>;
	}) {
		this._state = options.state;
		this._scheduler = options.scheduler;
		this.random = options.random;
		this.rule = options.rule;
		this.actorId = options.actorId;
		this.journal = options.journal ?? new ActionJournal<Command, Event>();
		this.actorOf = options.history?.actorOf ?? null;
		this.history = options.history ? new UndoHistory<SimulationSnapshot<State>>(options.history) : null;
		if (this.history) this.history.push(this.historySnapshot());
	}

	get scheduler(): Scheduler<A> {
		return this._scheduler;
	}

	get state(): State {
		return this._state;
	}

	/** Runs one command through the rule, commits the resulting state, and charges its cost
	 * to the scheduler's current actor when one is given. */
	dispatch(command: Command): SimulationOutcome<State, Event> {
		const outcome = this.rule(this._state, command, { random: this.random, scheduler: this._scheduler });
		this._state = outcome.state;
		if (outcome.cost != null) this._scheduler.spend(outcome.cost);
		this.journal.append(command, outcome.events);
		if (this.history) this.history.push(this.historySnapshot());
		return outcome;
	}

	get canUndo(): boolean {
		return this.history?.canUndo ?? false;
	}

	get canRedo(): boolean {
		return this.history?.canRedo ?? false;
	}

	/** Restores the previous committed simulation checkpoint, or null when undo is disabled. */
	undo(): SimulationSnapshot<State> | null {
		if (!this.history || !this.actorOf) return null;
		const snapshot = this.history.undo();
		if (!snapshot) return null;
		this.restoreCheckpoint(snapshot);
		return this.snapshot();
	}

	/** Restores the next checkpoint after an undo, or null when no redo is available. */
	redo(): SimulationSnapshot<State> | null {
		if (!this.history || !this.actorOf) return null;
		const snapshot = this.history.redo();
		if (!snapshot) return null;
		this.restoreCheckpoint(snapshot);
		return this.snapshot();
	}

	snapshot(version = 1): SimulationSnapshot<State> {
		return {
			version,
			state: this._state,
			scheduler: this.scheduler.toJSON(this.actorId),
			random: this.random.getState(),
			journal: this.journal.toJSON() as readonly ActionJournalEntry<unknown, unknown>[],
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
			journal: ActionJournal.fromJSON<Command, Event>(
				(snapshot.journal ?? []) as readonly ActionJournalEntry<Command, Event>[],
			),
			rule: options.rule,
			actorId: options.actorId,
		});
	}

	private historySnapshot(): SimulationSnapshot<State> {
		return structuredClone(this.snapshot());
	}

	private restoreCheckpoint(snapshot: SimulationSnapshot<State>): void {
		if (!this.actorOf) throw new Error('simulation history needs actorOf to restore a checkpoint');
		this._state = structuredClone(snapshot.state);
		this._scheduler = Scheduler.restore(snapshot.scheduler, this.actorOf);
		this.random.setState(snapshot.random);
		this.journal.replace((snapshot.journal ?? []) as readonly ActionJournalEntry<Command, Event>[]);
	}
}
