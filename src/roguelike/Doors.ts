import type { Level } from './Level.ts';

/**
 * Open/closed/locked door state, the same shape `Secrets` already uses: the state itself is
 * just terrain (a door swaps between its own open and closed terrain kinds, so `passable`/
 * `transparent` need no door-specific code at all), and this class remembers the other half -
 * which cells are doors, and what they swap to.
 *
 * Locking is a separate flag from open/closed: a locked door is always closed and refuses to
 * open until `unlock` is called (typically once a game confirms the actor holds the right
 * key item), rather than open/closed and locked/unlocked being folded into one state.
 */
export class Doors {
	private level: Level;
	private openKind = new Map<number, number>();
	private closedKind = new Map<number, number>();
	private lockedBy = new Map<number, string>();
	private open_ = new Map<number, boolean>();

	constructor(level: Level) {
		this.level = level;
	}

	/** places a door at `(x, y)`, swapping between `open`/`closed` terrain kinds */
	place(
		x: number,
		y: number,
		options: { open: number; closed: number; locked?: string; startOpen?: boolean }
	): void {
		const cell = this.level.index(x, y);
		this.openKind.set(cell, options.open);
		this.closedKind.set(cell, options.closed);
		this.open_.set(cell, options.startOpen ?? false);
		if (options.locked !== undefined) this.lockedBy.set(cell, options.locked);
		else this.lockedBy.delete(cell);

		this.level.set(x, y, this.open_.get(cell) ? options.open : options.closed);
	}

	isDoor(x: number, y: number): boolean {
		return this.open_.has(this.level.index(x, y));
	}

	isOpen(x: number, y: number): boolean {
		return this.open_.get(this.level.index(x, y)) === true;
	}

	isLocked(x: number, y: number): boolean {
		return this.lockedBy.has(this.level.index(x, y));
	}

	/** the id of the key item that unlocks this door, or undefined if it is not locked */
	requiredKey(x: number, y: number): string | undefined {
		return this.lockedBy.get(this.level.index(x, y));
	}

	/** @returns false, changing nothing, for a locked door, an already-open one, or not a door */
	open(x: number, y: number): boolean {
		const cell = this.level.index(x, y);
		if (!this.open_.has(cell) || this.open_.get(cell) || this.lockedBy.has(cell)) return false;

		this.open_.set(cell, true);
		this.level.set(x, y, this.openKind.get(cell)!);
		return true;
	}

	/** @returns false, changing nothing, for an already-closed door or not a door */
	close(x: number, y: number): boolean {
		const cell = this.level.index(x, y);
		if (!this.open_.has(cell) || !this.open_.get(cell)) return false;

		this.open_.set(cell, false);
		this.level.set(x, y, this.closedKind.get(cell)!);
		return true;
	}

	/** removes a door's lock, leaving it closed but now openable; false if it was not locked */
	unlock(x: number, y: number): boolean {
		const cell = this.level.index(x, y);
		if (!this.lockedBy.has(cell)) return false;

		this.lockedBy.delete(cell);
		return true;
	}

	toJSON(): { doors: { cell: number; open: number; closed: number; locked?: string; isOpen: boolean }[] } {
		const doors: { cell: number; open: number; closed: number; locked?: string; isOpen: boolean }[] = [];
		for (const [cell, open] of this.openKind) {
			doors.push({
				cell,
				open,
				closed: this.closedKind.get(cell)!,
				locked: this.lockedBy.get(cell),
				isOpen: this.open_.get(cell) === true,
			});
		}
		return { doors };
	}

	/**
	 * Rebuilds doors from save data onto a (separately restored) level, re-applying each
	 * door's terrain so an open door still reads as open to `passable`/`transparent`.
	 */
	static fromJSON(
		level: Level,
		data: { doors: { cell: number; open: number; closed: number; locked?: string; isOpen: boolean }[] }
	): Doors {
		const doors = new Doors(level);
		for (const saved of data.doors) {
			const x = level.xOf(saved.cell);
			const y = level.yOf(saved.cell);
			doors.place(x, y, {
				open: saved.open,
				closed: saved.closed,
				locked: saved.locked,
				startOpen: saved.isOpen,
			});
		}
		return doors;
	}
}
