import { Signal } from '../core/Signal.ts';

export interface WhiteboardEntry {
	/** the unit the plan is for; one plan per unit, the way a turn's moves are planned */
	unit: string;
}

/**
 * The planned-but-uncommitted orders of a turn - Wesnoth's whiteboard - with undo across them.
 *
 * A plan is one entry per unit, so replanning a unit replaces its earlier order in place rather
 * than stacking a second one for the same unit: what is on the board is the turn as it would be
 * played, not the history of how a player got there. Undo pops the last plan onto a redo stack
 * (planning again clears that stack, the usual undo contract), and `commit` hands the plans to the
 * caller, which is where the framework stops - actually executing them is the game's turn.
 *
 * @example
 * ```ts
 * import { Whiteboard } from '@datamoc/mw_games/battle';
 *
 * const board = new Whiteboard<{ unit: string; x: number; y: number }>();
 * board.plan({ unit: 'hero', x: 2, y: 3 });
 * board.plan({ unit: 'archer', x: 5, y: 1 });
 * board.undo();
 * console.log(board.plans); // [{ unit: 'hero', x: 2, y: 3 }]
 * ```
 */
export class Whiteboard<T extends WhiteboardEntry = WhiteboardEntry> {
	readonly onChange = new Signal<void>();

	private planned: T[] = [];
	private undone: T[] = [];

	get plans(): readonly T[] {
		return this.planned;
	}

	get isEmpty(): boolean {
		return this.planned.length === 0;
	}

	get canUndo(): boolean {
		return this.planned.length > 0;
	}

	get canRedo(): boolean {
		return this.undone.length > 0;
	}

	/** the plan for a unit, if it has one on the board */
	plannedFor(unit: string): T | undefined {
		return this.planned.find((entry) => entry.unit === unit);
	}

	/** adds or replaces a unit's plan; clears the redo stack, as planning after undo does */
	plan(action: T): void {
		const index = this.planned.findIndex((entry) => entry.unit === action.unit);
		if (index >= 0) this.planned[index] = action;
		else this.planned.push(action);
		this.undone = [];
		this.onChange.dispatch();
	}

	/** takes the last plan off the board, returning it so a caller can put it back */
	undo(): T | null {
		const entry = this.planned.pop();
		if (!entry) return null;
		this.undone.push(entry);
		this.onChange.dispatch();
		return entry;
	}

	/** puts the last undone plan back, replacing any plan the unit has picked up since */
	redo(): T | null {
		const entry = this.undone.pop();
		if (!entry) return null;
		this.planned = this.planned.filter((candidate) => candidate.unit !== entry.unit);
		this.planned.push(entry);
		this.onChange.dispatch();
		return entry;
	}

	/** empties the board, both the plans and anything undone */
	clear(): void {
		if (this.planned.length === 0 && this.undone.length === 0) return;
		this.planned = [];
		this.undone = [];
		this.onChange.dispatch();
	}

	/**
	 * Hands the plans to the caller and empties the board - the moment a turn stops being a plan.
	 * The orders are returned in planning order.
	 */
	commit(): T[] {
		const committed = this.planned;
		this.planned = [];
		this.undone = [];
		if (committed.length > 0) this.onChange.dispatch();
		return committed;
	}
}
