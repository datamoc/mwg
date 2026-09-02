/**
 * The map a roguelike reasons about.
 *
 * Deliberately separate from `TileMap`, which is how a map is *drawn*. This one holds what
 * the algorithms need — can something walk here, can light pass — and nothing about
 * appearance. A game maps its own terrain kinds onto these two flags, so it can invent
 * whatever terrain it likes without the framework knowing about lava or bookshelves.
 */

export interface TerrainKind {
	/** can a creature walk onto it */
	passable: boolean;

	/** can something be seen through it */
	transparent: boolean;
}

/** the two that every map needs; a game adds its own alongside */
export const WALL: TerrainKind = { passable: false, transparent: false };
export const FLOOR: TerrainKind = { passable: true, transparent: true };

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export class Level {
	readonly width: number;
	readonly height: number;

	/** terrain id per cell, indexing into `kinds` */
	readonly terrain: Uint8Array;

	private kinds: TerrainKind[];

	/** rooms the generator carved, for placing stairs, monsters and treasure */
	rooms: Rect[] = [];

	constructor(width: number, height: number, kinds: TerrainKind[], fill = 0) {
		this.width = width;
		this.height = height;
		this.kinds = kinds;
		this.terrain = new Uint8Array(width * height).fill(fill);
	}

	get cellCount(): number {
		return this.width * this.height;
	}

	index(x: number, y: number): number {
		return y * this.width + x;
	}

	xOf(cell: number): number {
		return cell % this.width;
	}

	yOf(cell: number): number {
		return Math.floor(cell / this.width);
	}

	inside(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}

	/**
	 * True only for cells with a full ring of neighbours.
	 *
	 * Anything that inspects a cell's surroundings should use this rather than `inside`,
	 * because a cell on the very edge has no neighbour on one side and every such check
	 * then needs its own bounds test. Generators keep the border solid for the same reason.
	 */
	insideWithBorder(x: number, y: number): boolean {
		return x > 0 && y > 0 && x < this.width - 1 && y < this.height - 1;
	}

	get(x: number, y: number): number {
		return this.inside(x, y) ? this.terrain[this.index(x, y)] : 0;
	}

	set(x: number, y: number, kind: number): void {
		if (this.inside(x, y)) this.terrain[this.index(x, y)] = kind;
	}

	kindAt(x: number, y: number): TerrainKind {
		return this.kinds[this.get(x, y)] ?? WALL;
	}

	passable(x: number, y: number): boolean {
		return this.inside(x, y) && this.kindAt(x, y).passable;
	}

	transparent(x: number, y: number): boolean {
		return this.inside(x, y) && this.kindAt(x, y).transparent;
	}

	fillRect(rect: Rect, kind: number): void {
		for (let y = rect.top; y <= rect.bottom; y++) {
			for (let x = rect.left; x <= rect.right; x++) this.set(x, y, kind);
		}
	}

	/** every passable cell, as indices — the pool to place things in */
	passableCells(): number[] {
		const out: number[] = [];
		for (let i = 0; i < this.terrain.length; i++) {
			if (this.kinds[this.terrain[i]]?.passable) out.push(i);
		}
		return out;
	}
}

export function rectCenter(rect: Rect): { x: number; y: number } {
	return {
		x: Math.floor((rect.left + rect.right) / 2),
		y: Math.floor((rect.top + rect.bottom) / 2),
	};
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
	return !(
		a.right + margin < b.left ||
		b.right + margin < a.left ||
		a.bottom + margin < b.top ||
		b.bottom + margin < a.top
	);
}
