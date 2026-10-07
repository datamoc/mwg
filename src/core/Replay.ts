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
 * recorder with plain `Signal` instances instead of a whole `Game`. A restored
 * run continues its recording mid-run: pass the checkpoint's frame as `fromFrame`
 * and new actions stamp from there, never from zero.
 *
 * @example
 * ```ts
 * import { Recorder, Signal, serializeReplay } from '@datamoc/mw_games/core';
 *
 * const onAction = new Signal<string>();
 * const onFrame = new Signal<number>();
 *
 * const recorder = new Recorder(onAction, onFrame);
 * onFrame.dispatch(0);
 * onAction.dispatch('confirm');
 *
 * const saved = serializeReplay(recorder.toJSON());
 * recorder.stop();
 * ```
 */
export class Recorder {
	private frameStamp: number;
	private readonly fromFrame: number;
	private readonly recorded: ReplayEvent[] = [];
	private readonly actions: Signal<string>;
	private readonly frames: Signal<number>;
	private readonly onAction: (action: string) => void;
	private readonly onFrame: () => void;

	constructor(actions: Signal<string>, frames: Signal<number>, options?: { fromFrame?: number }) {
		this.fromFrame = options?.fromFrame ?? 0;
		if (!Number.isInteger(this.fromFrame) || this.fromFrame < 0)
			throw new RangeError('a resumed recorder needs a non-negative fromFrame');
		this.frameStamp = this.fromFrame;
		this.actions = actions;
		this.frames = frames;
		//returns void, never true: recording must not swallow the action
		this.onAction = (action) => {
			this.recorded.push({ frame: this.frameStamp, action });
		};
		this.onFrame = () => {
			this.frameStamp++;
		};
		actions.add(this.onAction);
		frames.add(this.onFrame);
	}

	get events(): readonly ReplayEvent[] {
		return this.recorded;
	}

	/** The frame count the recording is currently stamped with, so a run can be checkpointed. */
	get frame(): number {
		return this.frameStamp;
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
 *
 * @example
 * ```ts
 * import { Player, Signal, deserializeReplay } from '@datamoc/mw_games/core';
 *
 * declare const saved: string; // written by serializeReplay, see Recorder
 *
 * const onFrame = new Signal<number>();
 * const replayed: string[] = [];
 *
 * const player = new Player(deserializeReplay(saved), (action) => replayed.push(action), onFrame);
 * onFrame.dispatch(0);
 *
 * console.log(player.done);
 * player.stop();
 * ```
 */
export class Player {
	private frame: number;
	private index: number;
	private readonly fromFrame: number;
	private readonly events: readonly ReplayEvent[];
	private readonly dispatch: (action: string) => void;
	private readonly frames: Signal<number>;
	private readonly onFrame: () => void;

	constructor(
		events: readonly ReplayEvent[],
		dispatch: (action: string) => void,
		frames: Signal<number>,
		options?: { fromFrame?: number },
	) {
		this.events = events;
		this.dispatch = dispatch;
		this.frames = frames;
		this.fromFrame = options?.fromFrame ?? 0;
		if (!Number.isInteger(this.fromFrame) || this.fromFrame < 0)
			throw new RangeError('a resumed player needs a non-negative fromFrame');
		this.index = this.events.findIndex((event) => event.frame >= this.fromFrame);
		if (this.index < 0) this.index = this.events.length;
		this.frame = this.fromFrame;
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
	return parseReplayEvents(JSON.parse(json));
}

/**
 * Validates an already-parsed replay - the same `{ frame, action }` checks `deserializeReplay`
 * applies, for the callers that hold parsed JSON rather than a string: a replay-file envelope
 * nests its events as an array, and re-stringifying them to parse them again would be the only
 * reason this half could not exist.
 *
 * @example
 * ```ts
 * import { parseReplayEvents } from '@datamoc/mw_games/core';
 *
 * const events = parseReplayEvents([{ frame: 3, action: 'confirm' }]);
 * ```
 */
export function parseReplayEvents(parsed: unknown): ReplayEvent[] {
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
