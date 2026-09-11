export interface VisionCell {
	x: number;
	y: number;
}

/**
 * Unions the visible cells of several units for each faction and retains explored memory.
 * The caller supplies visibility because board games differ in terrain, range, and blockers.
 *
 * Factions that `share` see through one another's eyes - one map for the group, what is lit now
 * and what they remember having seen, which is what Wesnoth's `share_vision` means. Nothing shares
 * until asked, and sharing is a property of the sides rather than of any unit, so it survives every
 * `sync`.
 *
 * @example
 * ```ts
 * import { FactionFog } from '@datamoc/mw_games/board';
 *
 * const fog = new FactionFog(10, 10);
 *
 * const sources = [{ x: 2, y: 2 }];
 * fog.sync('blue', sources, (source) => [
 * 	source,
 * 	{ x: source.x + 1, y: source.y },
 * ]);
 *
 * console.log(fog.isVisible('blue', 3, 2)); // true - lit by the scout right now
 * console.log(fog.isVisible('blue', 5, 5)); // false - never seen
 *
 * fog.share(['blue', 'green']); // the two now see one map
 * console.log(fog.isVisible('green', 3, 2)); // true - blue's scout is watching for both
 *
 * fog.sync('blue', [], () => []); // the scout moved away, nothing visible this turn
 * console.log(fog.isVisible('green', 3, 2)); // false - no longer in sight, for either of them
 * console.log(fog.isExplored('green', 3, 2)); // true - stays remembered, for both
 * ```
 */
export class FactionFog {
	readonly width: number;
	readonly height: number;
	private visible = new Map<string, Set<number>>();
	private explored = new Map<string, Set<number>>();

	/** faction to the factions it shares vision with, itself included. Absent means it shares with nobody. */
	private readonly shared = new Map<string, Set<string>>();

	constructor(width: number, height: number) {
		if (width < 1 || height < 1) throw new Error('fog needs positive dimensions');
		this.width = width;
		this.height = height;
	}

	/**
	 * Makes these factions see with one pair of eyes: each one's cells count as the others', both
	 * for what is visible now and for the shroud they remember.
	 *
	 * Calling it again widens the group rather than replacing it, so `share(['blue', 'green'])`
	 * after `share(['green', 'teal'])` leaves all three on one map. A side may also be told to share
	 * with itself, or with nobody at all, without harm.
	 */
	share(factions: readonly string[]): void {
		const named = [...new Set(factions)].filter((faction) => Boolean(faction));
		if (named.length === 0) return;

		const group = new Set<string>(named);
		for (const faction of named) {
			for (const mate of this.shared.get(faction) ?? []) group.add(mate);
		}
		for (const faction of group) this.shared.set(faction, group);
	}

	sync(faction: string, sources: readonly VisionCell[], cells: (source: VisionCell) => Iterable<VisionCell>): void {
		if (!faction) throw new Error('fog needs a faction id');
		const next = new Set<number>();
		for (const source of sources)
			for (const cell of cells(source)) {
				if (this.inside(cell.x, cell.y)) next.add(this.index(cell.x, cell.y));
			}
		this.visible.set(faction, next);
		const memory = this.explored.get(faction) ?? new Set<number>();
		for (const cell of next) memory.add(cell);
		this.explored.set(faction, memory);
	}

	/**
	 * Mark cells explored without changing what is currently visible: the
	 * shroud-clearing half of `sync`, for effects (a revealed map, a scouted
	 * region) that lift the shroud where no unit stands watch.
	 */
	reveal(faction: string, cells: Iterable<VisionCell>): void {
		if (!faction) throw new Error('fog needs a faction id');
		const memory = this.explored.get(faction) ?? new Set<number>();
		for (const cell of cells) {
			if (this.inside(cell.x, cell.y)) memory.add(this.index(cell.x, cell.y));
		}
		this.explored.set(faction, memory);
	}

	isVisible(faction: string, x: number, y: number): boolean {
		return this.seenBy(this.visible, faction, this.index(x, y));
	}

	/**
	 * One faction's sight as a predicate, ready to hand to anything that asks what a side can see -
	 * `ai`'s score views, for one. It reads the shroud as it is when called, not as it was when the
	 * predicate was made, so a caller holding one across a `sync` sees the update, and it follows
	 * whatever `share` the faction later joins.
	 */
	sees(faction: string): (x: number, y: number) => boolean {
		return (x, y) => this.isVisible(faction, x, y);
	}

	isExplored(faction: string, x: number, y: number): boolean {
		return this.seenBy(this.explored, faction, this.index(x, y));
	}

	visibleCells(faction: string): readonly number[] {
		return this.cellsSeenBy(this.visible, faction);
	}
	exploredCells(faction: string): readonly number[] {
		return this.cellsSeenBy(this.explored, faction);
	}

	/** one cell, as the faction or anyone it shares with sees it */
	private seenBy(cells: Map<string, Set<number>>, faction: string, cell: number): boolean {
		const group = this.shared.get(faction);
		if (!group) return cells.get(faction)?.has(cell) ?? false;
		for (const mate of group) {
			if (cells.get(mate)?.has(cell)) return true;
		}
		return false;
	}

	/** one faction's cells, or the union over the group it shares with */
	private cellsSeenBy(cells: Map<string, Set<number>>, faction: string): readonly number[] {
		const group = this.shared.get(faction);
		if (!group) return [...(cells.get(faction) ?? [])];

		const union = new Set<number>();
		for (const mate of group) {
			for (const cell of cells.get(mate) ?? []) union.add(cell);
		}
		//sorted because a union of sets has no order of its own, and a caller comparing two of these
		//should not have to care which of the group was synced first
		return [...union].sort((a, b) => a - b);
	}

	private inside(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}
	private index(x: number, y: number): number {
		return this.inside(x, y) ? y * this.width + x : -1;
	}
}
