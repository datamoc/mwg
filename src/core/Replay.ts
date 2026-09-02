import type { Signal } from './Signal.ts';

/**
 * One action dispatched on one frame of the game loop.
 *
 * The frame is a count of frames since recording started, not a timestamp: a
 * replay re-dispatches the same actions at the same frame counts while driving
 * the loop itself with `Game.step(dt)`, so wall-clock timing never matters.
 */
export interface ReplayEvent {
	frame: number;
	action: string;
}

/**
 * Records every action dispatched on a signal, stamped with the current frame.
 *
 * In a game the two signals are `Input.onAction` and `Game.onFrame`:
 *
 * ```ts
 * const recorder = new Recorder(Input.onAction, game.onFrame);
 * // ...play...
 * const saved = serializeReplay(recorder.toJSON());
 * ```
 *
 * The signals are parameters rather than imports so tests can drive a
 * recorder with plain `Signal` instances instead of a whole `Game`.
 */
export class Recorder {
	private frame = 0;
	private readonly recorded: ReplayEvent[] = [];
	private readonly actions: Signal<string>;
	private readonly frames: Signal<number>;
	private readonly onAction: (action: string) => void;
	private readonly onFrame: () => void;

	constructor(actions: Signal<string>, frames: Signal<number>) {
		this.actions = actions;
		this.frames = frames;
		//returns void, never true: recording must not swallow the action
		this.onAction = (action) => {
			this.recorded.push({ frame: this.frame, action });
		};
		this.onFrame = () => {
			this.frame++;
		};
		actions.add(this.onAction);
		frames.add(this.onFrame);
	}

	get events(): readonly ReplayEvent[] {
		return this.recorded;
	}

	/** A deep copy, safe to serialise or hand to a `Player`. */
	toJSON(): ReplayEvent[] {
		return this.recorded.map((e) => ({ frame: e.frame, action: e.action }));
	}

	/** Detaches both listeners; safe to call twice. */
	stop(): void {
		this.actions.remove(this.onAction);
		this.frames.remove(this.onFrame);
	}
}

/**
 * Re-dispatches recorded events at their recorded frames.
 *
 * ```ts
 * const player = new Player(deserializeReplay(saved), (a) => Input.onAction.dispatch(a), game.onFrame);
 * // ...drive the loop by hand: game.step(1 / 60) per frame...
 * ```
 *
 * Events are dispatched on the frame signal whose count has reached their
 * stamp, before the player's own count advances - the same relative point a
 * live action held during recording. `dispatch` usually forwards into
 * `Input.onAction`, but tests pass a collector instead.
 */
export class Player {
	private frame = 0;
	private index = 0;
	private readonly events: readonly ReplayEvent[];
	private readonly dispatch: (action: string) => void;
	private readonly frames: Signal<number>;
	private readonly onFrame: () => void;

	constructor(
		events: readonly ReplayEvent[],
		dispatch: (action: string) => void,
		frames: Signal<number>,
	) {
		this.events = events;
		this.dispatch = dispatch;
		this.frames = frames;
		this.onFrame = () => this.pump();
		frames.add(this.onFrame);
	}

	/** True once every event has been dispatched. */
	get done(): boolean {
		return this.index >= this.events.length;
	}

	/** Detaches the frame listener; safe to call twice. */
	stop(): void {
		this.frames.remove(this.onFrame);
	}

	private pump(): void {
		while (this.index < this.events.length && this.events[this.index].frame <= this.frame) {
			this.dispatch(this.events[this.index].action);
			this.index++;
		}
		this.frame++;
	}
}

export function serializeReplay(events: readonly ReplayEvent[]): string {
	return JSON.stringify(events);
}

/** Parses what `serializeReplay` wrote, rejecting anything else. */
export function deserializeReplay(json: string): ReplayEvent[] {
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) throw new Error('a replay must be an array of {frame, action}');
	return parsed.map((entry) => {
		if (
			typeof entry !== 'object' ||
			entry === null ||
			!Number.isInteger((entry as { frame: unknown }).frame) ||
			(entry as { frame: number }).frame < 0 ||
			typeof (entry as { action: unknown }).action !== 'string'
		) {
			throw new Error('a replay entry must be {frame: a non-negative integer, action: a string}');
		}
		return { frame: (entry as ReplayEvent).frame, action: (entry as ReplayEvent).action };
	});
}
