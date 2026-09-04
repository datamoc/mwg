export interface VisionCell { x: number; y: number; }

/**
 * Unions the visible cells of several units for each faction and retains explored memory.
 * The caller supplies visibility because board games differ in terrain, range, and blockers.
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
		for (const source of sources) for (const cell of cells(source)) {
			if (this.inside(cell.x, cell.y)) next.add(this.index(cell.x, cell.y));
		}
		this.visible.set(faction, next);
		const memory = this.explored.get(faction) ?? new Set<number>();
		for (const cell of next) memory.add(cell);
		this.explored.set(faction, memory);
	}

	isVisible(faction: string, x: number, y: number): boolean {
		return this.visible.get(faction)?.has(this.index(x, y)) ?? false;
	}

	isExplored(faction: string, x: number, y: number): boolean {
		return this.explored.get(faction)?.has(this.index(x, y)) ?? false;
	}

	visibleCells(faction: string): readonly number[] { return [...(this.visible.get(faction) ?? [])]; }
	exploredCells(faction: string): readonly number[] { return [...(this.explored.get(faction) ?? [])]; }

	private inside(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
	private index(x: number, y: number): number { return this.inside(x, y) ? y * this.width + x : -1; }
}
