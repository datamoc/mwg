/**
 * Whose turn it is.
 *
 * Not "everyone moves once per turn": each actor has a *speed*, and an action costs time
 * scaled by it. A hasted creature gets two moves to your one, a heavy weapon costs more
 * than a dagger, and a slowed one loses turns, all of which fall out of one number rather
 * than needing special cases.
 *
 * The queue is ordered by the time at which each actor next acts. `now` only ever moves
 * forward, so effects that expire can be timestamped against it.
 *
 * @example
 * ```ts
 * import { Scheduler, type Actor } from '@datamoc/mw_games/roguelike';
 *
 * interface Monster extends Actor { name: string }
 *
 * const scheduler = new Scheduler<Monster>();
 * scheduler.add({ name: 'hero', speed: 1 });
 * scheduler.add({ name: 'fast rat', speed: 2 }); // acts twice as often
 *
 * const acting = scheduler.peek(); // whoever's turn it is
 * scheduler.spend(1); // charge them for a normal-speed action, hand the turn on
 * ```
 */

export interface Actor {
	/** actions per unit of time; 2 acts twice as often as 1 */
	speed?: number;
}

/** A serialisable record of a scheduler's queue, keyed by caller-supplied actor ids. */
export interface SchedulerSnapshot {
	now: number;
	sequence: number;
	entries: Array<{ id: string; time: number; sequence: number }>;
}

interface Entry<A> {
	actor: A;
	/** when this actor next acts */
	time: number;
	/** breaks ties in insertion order, so a turn is reproducible rather than arbitrary */
	sequence: number;
}

export class Scheduler<A extends Actor> {
	private entries: Entry<A>[] = [];
	private sequence = 0;

	/** the current time; advances to each actor's turn as it comes up */
	now = 0;

	get size(): number {
		return this.entries.length;
	}

	get actors(): A[] {
		return this.entries.map((entry) => entry.actor);
	}

	has(actor: A): boolean {
		return this.entries.some((entry) => entry.actor === actor);
	}

	/**
	 * Puts an actor in the queue.
	 *
	 * @param delay time before its first turn. Spawning a monster with a small random delay
	 * stops a room full of them from acting in lockstep.
	 */
	add(actor: A, delay = 0): void {
		this.entries.push({ actor, time: this.now + delay, sequence: this.sequence++ });
		this.sort();
	}

	remove(actor: A): void {
		const index = this.entries.findIndex((entry) => entry.actor === actor);
		if (index !== -1) this.entries.splice(index, 1);
	}

	clear(): void {
		this.entries.length = 0;
		this.now = 0;
		this.sequence = 0;
	}

	/** whoever acts next, without removing them; time advances to their turn */
	peek(): A | null {
		const next = this.entries[0];
		if (!next) return null;

		//time only moves forward, never back to an entry scheduled in the past
		this.now = Math.max(this.now, next.time);
		return next.actor;
	}

	/**
	 * Charges the current actor for what it did, and hands the turn on.
	 *
	 * @param cost time the action took at speed 1; divided by the actor's speed. A cost of 0
	 * is a free action: the actor keeps its place at `now` but still goes behind any other
	 * actor already tied with it, since its sequence number is refreshed like any other spend.
	 */
	spend(cost: number): void {
		const entry = this.entries[0];
		if (!entry) return;

		const speed = entry.actor.speed ?? 1;
		entry.time = this.now + cost / (speed > 0 ? speed : 1);
		//a fresh sequence number, so an actor that just acted goes behind anyone tied with it
		entry.sequence = this.sequence++;
		this.sort();
	}

	/**
	 * Pushes a specific actor's next turn back, independent of whose turn it currently is -
	 * a stun or slow effect landing on someone other than the current actor, for instance.
	 *
	 * @param delay time added to that actor's next scheduled turn
	 */
	postpone(actor: A, delay: number): void {
		const entry = this.entries.find((entry) => entry.actor === actor);
		if (!entry) return;

		entry.time += delay;
		entry.sequence = this.sequence++;
		this.sort();
	}

	/** the time at which an actor next acts, for a debug view or an interface */
	timeOf(actor: A): number | null {
		return this.entries.find((entry) => entry.actor === actor)?.time ?? null;
	}

	/**
	 * Captures the queue as plain data, identifying each actor by whatever id the caller
	 * assigns it - the scheduler holds actor references, not ids, so it cannot invent one
	 * itself.
	 */
	toJSON(actorId: (actor: A) => string): SchedulerSnapshot {
		return {
			now: this.now,
			sequence: this.sequence,
			entries: this.entries.map((entry) => ({ id: actorId(entry.actor), time: entry.time, sequence: entry.sequence })),
		};
	}

	/**
	 * Rebuilds a scheduler from a snapshot taken by `toJSON`, restoring `now` and the
	 * sequence counter so that ties among actors added afterwards resolve exactly as they
	 * would have if the scheduler had never been serialised.
	 *
	 * @param actorOf resolves a snapshot id back to the live actor object it names
	 */
	static restore<A extends Actor>(snapshot: SchedulerSnapshot, actorOf: (id: string) => A): Scheduler<A> {
		const scheduler = new Scheduler<A>();
		scheduler.now = snapshot.now;
		scheduler.sequence = snapshot.sequence;
		scheduler.entries = snapshot.entries.map((entry) => ({ actor: actorOf(entry.id), time: entry.time, sequence: entry.sequence }));
		scheduler.sort();
		return scheduler;
	}

	private sort(): void {
		//few actors are ever queued, so a sort per action is cheaper than a heap and far
		//easier to reason about; swap it out if a level ever holds thousands
		this.entries.sort((a, b) => a.time - b.time || a.sequence - b.sequence);
	}
}
