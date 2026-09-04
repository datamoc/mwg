/**
 * A bounded, generic back/forward step through recent turns - a mode a game opts into
 * (useless in a permadeath roguelike, useful elsewhere), agnostic about what "a turn's
 * state" actually contains the same way `SaveSystem` is agnostic about what "the save"
 * contains: a game serializes its own turn-scoped state (a `Level`, a `BoardGrid`, whatever
 * it has) and this only ever stores and replays snapshots of it, never interprets them.
 *
 * Distinct from `Recorder`/`Player` (item 42), which replay a whole `Input.onAction` log
 * deterministically for testing, not a bounded, player-facing "undo my last move".
 */
export interface UndoHistoryOptions {
	/** states retained before the oldest is dropped; defaults to 50 */
	limit?: number;
}

export class UndoHistory<T> {
	private history: T[] = [];
	private cursor = -1;
	private readonly limit: number;

	constructor(options: UndoHistoryOptions = {}) {
		this.limit = Math.max(1, options.limit ?? 50);
	}

	/**
	 * Records `state` as the new current point - the normal "a turn was taken" case. Any
	 * redo history beyond the current point is discarded, the same rule undo/redo everywhere
	 * follows: taking a new turn after undoing invalidates whatever future it undid away from.
	 */
	push(state: T): void {
		this.history.length = this.cursor + 1;
		this.history.push(state);
		if (this.history.length > this.limit) this.history.shift();
		this.cursor = this.history.length - 1;
	}

	get canUndo(): boolean {
		return this.cursor > 0;
	}

	get canRedo(): boolean {
		return this.cursor < this.history.length - 1;
	}

	/** steps back one state and returns it; null when already at the oldest retained state */
	undo(): T | null {
		if (!this.canUndo) return null;
		this.cursor--;
		return this.history[this.cursor];
	}

	/** steps forward one state and returns it; null when already at the newest state */
	redo(): T | null {
		if (!this.canRedo) return null;
		this.cursor++;
		return this.history[this.cursor];
	}

	/** the state at the current point, or null before anything has ever been pushed */
	get current(): T | null {
		return this.cursor >= 0 ? this.history[this.cursor] : null;
	}

	/** drops everything - a new game, a floor transition, anywhere undoing across the boundary makes no sense */
	clear(): void {
		this.history = [];
		this.cursor = -1;
	}
}
