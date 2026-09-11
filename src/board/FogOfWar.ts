export interface VisionCell {
	x: number;
	y: number;
}

/**
 * Unions the visible cells of several units for each faction and retains explored memory.
 * The caller supplies visibility because board games differ in terrain, range, and blockers.
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
 * fog.sync('blue', [], () => []); // the scout moved away, nothing visible this turn
 * console.log(fog.isVisible('blue', 3, 2)); // false - no longer in sight
 * console.log(fog.isExplored('blue', 3, 2)); // true - stays remembered after leaving
 * ```
 */
export class FactionFog {
	readonly width: number;
	readonly height: number;
	private visible = new Map<string, Set<number>>();
	private explored = new Map<string, Set<number>>();

	constructor(width: number, height: number) {
		if (width < 1 || height < 1) throw new Error('fog needs positive dimensions');
		this.width = width;
		this.height = height;
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
		return this.visible.get(faction)?.has(this.index(x, y)) ?? false;
	}

	/**
	 * One faction's sight as a predicate, ready to hand to anything that asks what a side can see -
	 * `ai`'s score views, for one. It reads the shroud as it is when called, not as it was when the
	 * predicate was made, so a caller holding one across a `sync` sees the update.
	 */
	sees(faction: string): (x: number, y: number) => boolean {
		return (x, y) => this.isVisible(faction, x, y);
	}

	isExplored(faction: string, x: number, y: number): boolean {
		return this.explored.get(faction)?.has(this.index(x, y)) ?? false;
	}

	visibleCells(faction: string): readonly number[] {
		return [...(this.visible.get(faction) ?? [])];
	}
	exploredCells(faction: string): readonly number[] {
		return [...(this.explored.get(faction) ?? [])];
	}

	private inside(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}
	private index(x: number, y: number): number {
		return this.inside(x, y) ? y * this.width + x : -1;
	}
}
