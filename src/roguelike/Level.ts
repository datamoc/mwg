import { hexNeighbors } from '../core/Hex.ts';

/**
 * The map a roguelike reasons about.
 *
 * Deliberately separate from `TileMap`, which is how a map is *drawn*. This one holds what
 * the algorithms need (can something walk here, can light pass) and nothing about
 * appearance. A game maps its own terrain kinds onto these two flags, so it can invent
 * whatever terrain it likes without the framework knowing about lava or bookshelves.
 */

/** the grid a `Level` reasons over - a parameter, not a forked class, per the roadmap */
export type LevelShape = 'square' | 'hex';

/** the four or eight cell offsets around a point, shared by every square-grid algorithm here */
export function neighbourOffsets(topology: 4 | 8): ReadonlyArray<readonly [number, number]> {
	return topology === 4
		? [
				[0, -1],
				[1, 0],
				[0, 1],
				[-1, 0],
			]
		: [
				[0, -1],
				[1, -1],
				[1, 0],
				[1, 1],
				[0, 1],
				[-1, 1],
				[-1, 0],
				[-1, -1],
			];
}

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
	readonly shape: LevelShape;

	/** terrain id per cell, indexing into `kinds` */
	readonly terrain: Uint8Array;

	private kinds: TerrainKind[];

	/** rooms the generator carved, for placing stairs, monsters and treasure */
	rooms: Rect[] = [];

	constructor(width: number, height: number, kinds: TerrainKind[], fill = 0, shape: LevelShape = 'square') {
		this.width = width;
		this.shape = shape;
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
	 * The cells adjacent to `(x, y)` - six of them on a hex `Level`, four or eight on a
	 * square one, regardless of which. This is the seam that lets `Pathfinder` and
	 * `FieldOfView` work over either shape unchanged: they walk neighbours, and only this
	 * method knows what a neighbour is.
	 *
	 * @param topology ignored on a hex `Level` - it only has the one neighbourhood shape
	 */
	neighbors(x: number, y: number, topology: 4 | 8 = 8): Array<{ x: number; y: number }> {
		if (this.shape === 'hex') return hexNeighbors(x, y);
		return neighbourOffsets(topology).map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
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

	/** every passable cell, as indices: the pool to place things in */
	passableCells(): number[] {
		const out: number[] = [];
		for (let i = 0; i < this.terrain.length; i++) {
			if (this.kinds[this.terrain[i]]?.passable) out.push(i);
		}
		return out;
	}

	toJSON(): { width: number; height: number; shape: LevelShape; terrain: number[]; rooms: Rect[] } {
		return {
			width: this.width,
			height: this.height,
			shape: this.shape,
			terrain: [...this.terrain],
			rooms: this.rooms.map((room) => ({ ...room })),
		};
	}

	/**
	 * Rebuilds a level from save data - the `kinds` table is supplied fresh (it holds a
	 * game's own terrain meanings, the same way `QuestLog` takes its definitions fresh),
	 * so only the terrain ids and rooms are ever save data.
	 */
	static fromJSON(
		kinds: TerrainKind[],
		data: { width: number; height: number; shape: LevelShape; terrain: number[]; rooms: Rect[] }
	): Level {
		const level = new Level(data.width, data.height, kinds, 0, data.shape);
		level.terrain.set(data.terrain.slice(0, level.terrain.length));
		level.rooms = data.rooms.map((room) => ({ ...room }));
		return level;
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
