/**
 * Whose turn it is.
 *
 * Not "everyone moves once per turn": each actor has a *speed*, and an action costs time
 * scaled by it. A hasted creature gets two moves to your one, a heavy weapon costs more
 * than a dagger, and a slowed one loses turns — all of which fall out of one number rather
 * than needing special cases.
 *
 * The queue is ordered by the time at which each actor next acts. `now` only ever moves
 * forward, so effects that expire can be timestamped against it.
 */

export interface Actor {
	/** actions per unit of time; 2 acts twice as often as 1 */
	speed?: number;
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
	 * @param cost time the action took at speed 1; divided by the actor's speed
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

	/** the time at which an actor next acts, for a debug view or an interface */
	timeOf(actor: A): number | null {
		return this.entries.find((entry) => entry.actor === actor)?.time ?? null;
	}

	private sort(): void {
		//few actors are ever queued, so a sort per action is cheaper than a heap and far
		//easier to reason about; swap it out if a level ever holds thousands
		this.entries.sort((a, b) => a.time - b.time || a.sequence - b.sequence);
	}
}
