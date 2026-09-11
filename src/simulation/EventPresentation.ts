import { PresentationQueue } from '../core/Presentation.ts';
import type { Actor } from '../roguelike/Scheduler.ts';
import { SimulationRuntime } from './Runtime.ts';
import type { SimulationOutcome, SimulationSnapshot, SimulationRuntimeRule } from './Runtime.ts';

export interface EventPresentationOptions<State, Command, Event, A extends Actor> {
	/** the simulation whose commands this presents */
	runtime: SimulationRuntime<State, Command, Event, A>;

	/**
	 * The game's own mapping from one event to what it looks like: a tween, a sound, a
	 * floating number. Returns how many seconds the next event should wait, the same contract
	 * `PresentationQueue`'s own `play` has.
	 */
	play: (event: Event) => number | void;

	/**
	 * Commands a secondary actor should take once the batch that just resolved has finished
	 * presenting - a counter-attack, the next actor the scheduler calls. Receives the outcome
	 * that just resolved and returns whatever commands follow from it, in order; return an
	 * empty list (or omit the option) when nothing follows. A game reads the scheduler through
	 * its own closure to decide who is next.
	 *
	 * Must eventually return nothing: this is what chains a turn forward, so a function that
	 * always returns a command would spin forever.
	 */
	followUp?: (outcome: SimulationOutcome<State, Event>) => readonly Command[];
}

/**
 * The documented integration between a turn-based simulation and its presentation, over the
 * two pieces that already exist (`simulation.SimulationRuntime` and `core.PresentationQueue`)
 * rather than a third kind of thing. It fixes the five interactions that are easy to get
 * subtly wrong when a game wires them by hand:
 *
 * - **A command result**: `submit` dispatches through the runtime and hands the returned
 *   events to the queue, in one call, so the state commit and the animation are never started
 *   from two places that can drift apart.
 * - **An animation lock**: `locked` is the queue's own `isBusy`, and `submit` refuses while it
 *   is true - a click during an attack cannot commit a second attack on top of the first.
 * - **A scheduled secondary actor**: `followUp` returns the commands that follow an outcome,
 *   and they are dispatched only once the batch before them has finished presenting, so the
 *   counter-attack animation starts after the attack animation, not underneath it.
 * - **Cancellation**: `cancel` drops everything not yet played. The simulation state is not
 *   rolled back, because the commands it already committed *did* happen; cancelling stops the
 *   show, it does not undo the turn.
 * - **Save/load**: `snapshot` saves the simulation only, deliberately not the queue. A
 *   restored run comes back idle, so loading mid-animation skips the rest of that batch
 *   instead of replaying it on top of the loaded state.
 *
 * @example
 * ```ts
 * import { EventPresentation } from '@datamoc/mw_games/simulation';
 * import type { SimulationRuntime } from '@datamoc/mw_games/simulation';
 * import type { Actor } from '@datamoc/mw_games/roguelike';
 *
 * interface Fighter extends Actor {
 *   id: string;
 * }
 *
 * declare const runtime: SimulationRuntime<{ hp: number }, 'attack' | 'counter', { amount: number }, Fighter>;
 *
 * const presentation = new EventPresentation({
 *   runtime,
 *   play: (event) => 0.25 * event.amount, // a hit is a quarter second per point
 *   followUp: (outcome): readonly ('attack' | 'counter')[] =>
 *     outcome.events.length > 0 ? ['counter'] : [],
 * });
 *
 * presentation.submit('attack'); // commits the attack and starts its animation
 * presentation.submit('attack'); // null - the first is still playing
 * presentation.update(1 / 60); // drains the queue, then the scheduled counter
 * presentation.cancel(); // abandons whatever is left; the committed state stands
 * const saved = presentation.snapshot(); // the simulation only
 * ```
 */
export class EventPresentation<State, Command, Event, A extends Actor> {
	readonly runtime: SimulationRuntime<State, Command, Event, A>;
	readonly queue: PresentationQueue<Event>;

	private readonly followUpOf?: (outcome: SimulationOutcome<State, Event>) => readonly Command[];
	private followUps: Command[] = [];

	constructor(options: EventPresentationOptions<State, Command, Event, A>) {
		this.runtime = options.runtime;
		this.queue = new PresentationQueue<Event>({ play: options.play });
		this.followUpOf = options.followUp;
	}

	/** true while events are presenting or waiting behind the current one; input belongs to the animation */
	get locked(): boolean {
		return this.queue.isBusy;
	}

	/**
	 * Runs `command`, enqueues its events, and returns the outcome - or null when `locked`, so
	 * a command issued mid-animation is refused rather than committed ahead of the show.
	 */
	submit(command: Command): SimulationOutcome<State, Event> | null {
		if (this.locked) return null;
		return this.commit(command);
	}

	/** advances the current animation and starts whatever follows it */
	update(dt: number): void {
		this.queue.update(dt);
		this.drainFollowUps();
	}

	/**
	 * Abandons every event not yet presented, current one included, and any scheduled
	 * follow-ups. The simulation's committed state is untouched: cancellation stops the
	 * presentation, not the turn.
	 */
	cancel(): void {
		this.queue.clear();
		this.followUps = [];
	}

	/** saves the simulation state; the queue is deliberately not part of a save */
	snapshot(version = 1): SimulationSnapshot<State> {
		return this.runtime.snapshot(version);
	}

	/**
	 * Rebuilds a runtime from `snapshot` and wraps it in a fresh, idle presentation, so a
	 * loaded run does not replay the animation that was interrupted.
	 */
	static restore<State, Command, Event, A extends Actor>(
		snapshot: SimulationSnapshot<State>,
		options: {
			play: (event: Event) => number | void;
			followUp?: (outcome: SimulationOutcome<State, Event>) => readonly Command[];
			rule: SimulationRuntimeRule<State, Command, Event, A>;
			actorOf: (id: string) => A;
			actorId: (actor: A) => string;
		},
	): EventPresentation<State, Command, Event, A> {
		const runtime = SimulationRuntime.restore<State, Command, Event, A>(snapshot, {
			rule: options.rule,
			actorOf: options.actorOf,
			actorId: options.actorId,
		});
		return new EventPresentation<State, Command, Event, A>({
			runtime,
			play: options.play,
			followUp: options.followUp,
		});
	}

	private commit(command: Command): SimulationOutcome<State, Event> {
		const outcome = this.runtime.dispatch(command);
		this.queue.enqueue(outcome.events);
		if (this.followUpOf) this.followUps.push(...this.followUpOf(outcome));
		this.drainFollowUps();
		return outcome;
	}

	/** runs scheduled follow-ups while the queue is idle, so each starts after the last finished */
	private drainFollowUps(): void {
		while (!this.queue.isBusy && this.followUps.length > 0) {
			const command = this.followUps.shift() as Command;
			this.commit(command);
		}
	}
}
