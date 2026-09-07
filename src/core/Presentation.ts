export interface PresentationQueueOptions<Event> {
	/**
	 * Presents one event - starts a tween, plays a sound, shows a floating number - and
	 * returns how many seconds to wait before the next one starts. Return 0 or nothing for an
	 * event with no visual duration of its own (a sound cue riding along another animation);
	 * several of those in a row drain in the same `enqueue`/`update` call rather than costing
	 * a frame each.
	 */
	play: (event: Event) => number | void;
}

/**
 * Plays simulation events one at a time, at whatever pace their presentation actually takes,
 * entirely separate from the commit that already happened: `simulation.SimulationRuntime.
 * dispatch` (or `runScenario`) returns its events synchronously and completely, and this is
 * what a scene hands them to afterwards. `mwg` never sees what an event *means* - `play` is
 * the game's own mapping from event to animation/sound/UI, this only sequences the calls.
 *
 * The same shape as `two-d.ui.Toast`'s queued, timed presentation, generalised to any event
 * type and freed of `Toast`'s own Pixi container, since queuing which event plays next needs
 * no renderer at all.
 *
 * @example
 * ```ts
 * import { PresentationQueue } from '@datamoc/mw_games/core';
 *
 * type GameEvent = { type: 'move' } | { type: 'damage'; amount: number };
 *
 * const presentation = new PresentationQueue<GameEvent>({
 *   play: (event) => {
 *     if (event.type === 'move') return 0.2; // a move tween takes 200ms
 *     console.log('damage:', event.amount); // a floating number, shown instantly
 *   },
 * });
 *
 * presentation.enqueue([{ type: 'move' }, { type: 'damage', amount: 7 }]);
 * presentation.update(0.2); // the move finishes; the damage event plays right behind it
 * console.log(presentation.isBusy); // false - nothing left queued
 * ```
 */
export class PresentationQueue<Event> {
	private readonly play: (event: Event) => number | void;
	private queue: Event[] = [];
	private busy = false;
	private remaining = 0;

	constructor(options: PresentationQueueOptions<Event>) {
		this.play = options.play;
	}

	/** adds events to the end of the queue, starting them immediately if nothing is playing */
	enqueue(events: readonly Event[]): void {
		this.queue.push(...events);
		if (!this.busy) this.advance();
	}

	/** advances the current event's timer; starts the next one once it elapses */
	update(dt: number): void {
		if (!this.busy) return;
		this.remaining -= dt;
		if (this.remaining <= 0) this.advance();
	}

	/** true while an event is playing or others are waiting behind it */
	get isBusy(): boolean {
		return this.busy;
	}

	/** drops every queued and in-progress event without playing it */
	clear(): void {
		this.queue = [];
		this.busy = false;
		this.remaining = 0;
	}

	private advance(): void {
		const next = this.queue.shift();
		if (next === undefined) {
			this.busy = false;
			this.remaining = 0;
			return;
		}

		this.busy = true;
		const duration = this.play(next) || 0;
		if (duration > 0) {
			this.remaining = duration;
		} else {
			this.advance(); //no visual duration: chain straight into the next one
		}
	}
}
