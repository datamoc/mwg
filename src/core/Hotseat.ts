import type { Action } from './Input.ts';
import type { PlayerInput } from './PlayerInput.ts';

export interface HotseatOptions {
	/** seconds per turn, when this game runs on a clock; omit for a turn that lasts until `next()` */
	turnSeconds?: number;

	/**
	 * Whether an expired turn clock moves to the next player by itself. When false (the
	 * default) the clock stops at zero and `expired` turns true, leaving the decision to the
	 * game - a countdown that must be confirmed, or a "pass the controller" prompt.
	 */
	autoAdvance?: boolean;

	/** fires after the turn's player becomes active */
	onTurnStart?: (player: string, index: number) => void;

	/** fires as the turn ends, before any hand-over */
	onTurnEnd?: (player: string, index: number) => void;

	/**
	 * Runs between two turns, so a game can show a "pass the controller to player 2" screen
	 * first. The next player is not active until the returned promise (when there is one)
	 * resolves, which is also when `active` starts reporting them.
	 */
	requestHandOver?: (from: string, to: string) => Promise<void> | void;
}

/** the three queries a game polls per frame on a hotseat-gated input */
export interface GatedInput {
	isDown(action: Action): boolean;
	justPressed(action: Action): boolean;
	justReleased(action: Action): boolean;
}

function isThenable(value: unknown): value is PromiseLike<void> {
	return typeof (value as { then?: unknown } | undefined)?.then === 'function';
}

/**
 * Turn order and optional turn clock for hotseat play: several people sharing one screen
 * and one controller, one of them allowed to act at a time.
 *
 * The class owns only the bookkeeping a game would otherwise rewrite in every scene: whose
 * turn it is, when the turn began, and whether a countdown ran out. It does not touch input
 * or drawing. `gatedInput` wraps a `PlayerInput` so a game can poll all four players' inputs
 * every frame without branching on whose turn it is, and `requestHandOver` is the hook for
 * the "pass the controller" screen between turns.
 *
 * @example
 * ```ts
 * import { Hotseat, PlayerInput } from '@datamoc/mwg/core';
 *
 * const hotseat = new Hotseat(['p1', 'p2'], {
 * 	turnSeconds: 30,
 * 	autoAdvance: true,
 * 	onTurnStart: (player) => console.log('now playing:', player),
 * });
 * hotseat.begin(); // player "p1" starts
 *
 * // in the frame update:
 * hotseat.update(1 / 60); // the clock, and the hand-over it triggers when it runs out
 * if (hotseat.acceptsInput('p2')) console.log('p2 may act now');
 *
 * // hand over at the end of a turn, awaiting any pass-the-controller screen first:
 * void hotseat.next();
 * ```
 */
export class Hotseat {
	private readonly playerList: readonly string[];
	private readonly options: HotseatOptions;
	private readonly clock: number | null;
	private index = 0;
	private started = false;
	private remaining: number | null;
	private timedOut = false;
	private pending: Promise<void> | null = null;

	constructor(players: readonly string[], options: HotseatOptions = {}) {
		if (players.length < 2) throw new Error(`a hotseat game needs at least two players, not ${players.length}`);
		const seen = new Set<string>();
		for (const player of players) {
			if (typeof player !== 'string' || player.length === 0)
				throw new Error('every hotseat player needs a non-empty id');
			if (seen.has(player)) throw new Error(`hotseat player "${player}" is listed twice`);
			seen.add(player);
		}
		if (options.turnSeconds !== undefined && !(Number.isFinite(options.turnSeconds) && options.turnSeconds > 0))
			throw new Error(`hotseat turnSeconds must be a positive, finite number, not ${options.turnSeconds}`);

		this.playerList = Object.freeze([...players]);
		this.options = options;
		this.clock = options.turnSeconds ?? null;
		this.remaining = this.clock;
	}

	/** the player allowed to act, or null between turns, before `begin()` and during a hand-over */
	get active(): string | null {
		return this.started ? this.playerList[this.index] : null;
	}

	/** the slot the next `begin()` or `reset()` refers to, and the active player's index while one is active */
	get activeIndex(): number {
		return this.index;
	}

	get players(): readonly string[] {
		return this.playerList;
	}

	/** seconds left in the active turn, or null when this game runs no clock */
	get turnRemaining(): number | null {
		return this.remaining;
	}

	/** true once the clock reached zero and `autoAdvance` left the turn where it is */
	get expired(): boolean {
		return this.timedOut;
	}

	/** starts the first turn; a no-op once one is already running */
	begin(): void {
		if (this.started) return;
		this.startTurn(this.index);
	}

	/**
	 * Ends the active turn and starts the next player's, wrapping back to the first. Fires
	 * `onTurnEnd`, then awaits `requestHandOver` when it returns a promise, then makes the
	 * next player active and fires `onTurnStart`. Called before `begin()` it simply starts
	 * the first turn.
	 */
	next(): Promise<void> {
		if (this.pending) return this.pending;

		const ending = this.started ? this.index : -1;
		const from = ending >= 0 ? this.playerList[ending] : null;
		const nextIndex = ending >= 0 ? (ending + 1) % this.playerList.length : this.index;

		//the finished player is no longer active while the hand-over screen runs, so their
		//input is gated off the moment the turn ends, not once the next player appears
		this.started = false;
		if (from !== null) this.options.onTurnEnd?.(from, ending);

		const handOver = from === null ? undefined : this.options.requestHandOver?.(from, this.playerList[nextIndex]);
		//the common case is a synchronous hand-over, or none at all: the next turn starts
		//right here rather than a microtask later, so a caller polling `active` in the same
		//frame sees the new player
		if (!isThenable(handOver)) {
			this.startTurn(nextIndex);
			return Promise.resolve();
		}

		const running = (async () => {
			await handOver;
			this.startTurn(nextIndex);
		})();
		this.pending = running;
		//clear the in-flight marker on both outcomes, without turning a rejection the
		//caller is about to handle into an unhandled one of our own
		running.then(
			() => {
				if (this.pending === running) this.pending = null;
			},
			() => {
				if (this.pending === running) this.pending = null;
			},
		);
		return running;
	}

	/**
	 * Advances the turn clock by `dt` seconds. At zero it calls `next()` when `autoAdvance` is
	 * true; otherwise it stops at zero and `expired` reports it. A clock started by a turn
	 * that is already handing over is not advanced, so a slow hand-over cannot skip a player.
	 */
	update(dt: number): void {
		if (!this.started || this.remaining === null || this.pending) return;

		this.remaining = Math.max(0, this.remaining - Math.max(0, dt));
		if (this.remaining > 0) return;
		if (!this.options.autoAdvance) {
			this.timedOut = true;
			return;
		}
		//update() cannot await; a rejecting requestHandOver is only observable through an
		//explicit `await hotseat.next()`
		this.next().catch(() => {});
	}

	/** true only for the player whose turn it is */
	acceptsInput(player: string): boolean {
		const active = this.active;
		return active !== null && active === player;
	}

	/**
	 * A `PlayerInput` that reports nothing at all while its player is not active, so a game
	 * can poll every player's input unconditionally instead of asking who is allowed to act.
	 */
	gatedInput(input: PlayerInput): GatedInput {
		const allowed = (): boolean => this.acceptsInput(input.id);
		return {
			isDown: (action) => allowed() && input.isDown(action),
			justPressed: (action) => allowed() && input.justPressed(action),
			justReleased: (action) => allowed() && input.justReleased(action),
		};
	}

	/** stops the current turn without firing a callback, and makes `index` the next one to begin */
	reset(index = 0): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.playerList.length)
			throw new Error(`hotseat reset index must be 0 to ${this.playerList.length - 1}, not ${index}`);
		this.index = index;
		this.started = false;
		this.remaining = this.clock;
		this.timedOut = false;
	}

	private startTurn(index: number): void {
		this.index = index;
		this.started = true;
		this.remaining = this.clock;
		this.timedOut = false;
		this.options.onTurnStart?.(this.playerList[index], index);
	}
}
