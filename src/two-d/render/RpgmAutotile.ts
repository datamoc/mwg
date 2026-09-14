/** One of RPG Maker MV's four autotile atlas families. */
export type RpgmAutotileSlot = 0 | 1 | 2 | 3;

/** A source quadrant in the RPG Maker autotile atlas, in source pixels. */
export interface RpgmAutotileQuadrant {
	sourceX: number;
	sourceY: number;
	destinationX: number;
	destinationY: number;
}

/** The four source quadrants that make up one 48 by 48 RPG Maker autotile. */
export interface RpgmAutotileFrame {
	tileId: number;
	slot: RpgmAutotileSlot;
	shape: number;
	destinationX: number;
	destinationY: number;
	quadrants: readonly [
		RpgmAutotileQuadrant,
		RpgmAutotileQuadrant,
		RpgmAutotileQuadrant,
		RpgmAutotileQuadrant,
	];
}

/** Four atlas-cell offsets, in 24px source cells, for one autotile shape. */
export type RpgmAutotileShape = readonly [
	readonly [number, number],
	readonly [number, number],
	readonly [number, number],
	readonly [number, number],
];

export type RpgmAutotileShapeTable = readonly RpgmAutotileShape[];

const SOURCE_QUADRANT_SIZE = 24;
const OUTPUT_TILE_SIZE = 48;
const SLOT_BASE_KINDS = [0, 16, 48, 80] as const;

function assertInteger(name: string, value: number): void {
	if (!Number.isInteger(value)) throw new Error(`${name} must be an integer, got ${value}`);
}

function assertSlot(slot: number): asserts slot is RpgmAutotileSlot {
	if (slot !== 0 && slot !== 1 && slot !== 2 && slot !== 3) {
		throw new Error(`RPG Maker autotile slot must be 0, 1, 2, or 3, got ${slot}`);
	}
}

function validateShapeTable(table: RpgmAutotileShapeTable): void {
	if (table.length === 0) throw new Error('RPG Maker autotile shape table cannot be empty');
	for (let shape = 0; shape < table.length; shape++) {
		if (table[shape].length !== 4) {
			throw new Error(`RPG Maker autotile shape ${shape} needs exactly 4 quadrants`);
		}
		for (const quadrant of table[shape]) {
			if (quadrant.length !== 2 || !quadrant.every(Number.isInteger) || quadrant.some((value) => value < 0)) {
				throw new Error(`RPG Maker autotile shape ${shape} has an invalid quadrant offset`);
			}
		}
	}
}

function sourceBase(tileId: number, slot: RpgmAutotileSlot): readonly [number, number] {
	const kind = SLOT_BASE_KINDS[slot] + Math.floor(tileId / 48);
	const tx = kind % 8;
	const ty = Math.floor(kind / 8);

	if (slot === 0) {
		return [Math.floor(tx / 4) * 8, ty * 6 + (Math.floor(tx / 2) % 2) * 3];
	}
	if (slot === 1) return [tx * 2, (ty - 2) * 3];
	if (slot === 2) return [tx * 2, (ty - 6) * 2];
	return [tx * 2, Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0))];
}

/**
 * Describes how RPG Maker MV composes one autotile from four 24px atlas quadrants.
 *
 * The returned geometry is renderer-neutral: a Pixi, canvas, or native renderer can draw
 * each source rectangle into its destination rectangle without this module knowing about it.
 * `tileId` is the output atlas index used by RPG Maker's 16-column generated atlas, while
 * `slot` selects the source atlas family and `shape` indexes the caller's four-quadrant table.
 *
 * @example
 * ```ts
 * import { rpgmAutotileFrame } from '@datamoc/mw_games/two-d/render';
 *
 * const shapeTable = Array.from({ length: 48 }, () => [[0, 0], [1, 0], [0, 1], [1, 1]] as const);
 * const frame = rpgmAutotileFrame(7, 0, 3, shapeTable);
 * console.log(frame.quadrants[0].sourceX); // source pixel x coordinate
 * ```
 */
export function rpgmAutotileFrame(
	tileId: number,
	slot: RpgmAutotileSlot,
	shape: number,
	table: RpgmAutotileShapeTable,
): RpgmAutotileFrame {
	assertInteger('RPG Maker autotile tileId', tileId);
	if (tileId < 0) throw new Error(`RPG Maker autotile tileId must be non-negative, got ${tileId}`);
	assertSlot(slot);
	assertInteger('RPG Maker autotile shape', shape);
	validateShapeTable(table);
	if (shape < 0 || shape >= table.length) {
		throw new Error(`RPG Maker autotile shape ${shape} is outside the table, which holds ${table.length}`);
	}

	const [baseX, baseY] = sourceBase(tileId, slot);
	const destinationX = (tileId % 16) * OUTPUT_TILE_SIZE;
	const destinationY = Math.floor(tileId / 16) * OUTPUT_TILE_SIZE;
	const quadrants = table[shape].map(([x, y], quadrant) => ({
		sourceX: (baseX * 2 + x) * SOURCE_QUADRANT_SIZE,
		sourceY: (baseY * 2 + y) * SOURCE_QUADRANT_SIZE,
		destinationX: (quadrant % 2) * SOURCE_QUADRANT_SIZE,
		destinationY: Math.floor(quadrant / 2) * SOURCE_QUADRANT_SIZE,
	})) as unknown as RpgmAutotileFrame['quadrants'];

	return { tileId, slot, shape, destinationX, destinationY, quadrants };
}

/**
 * Caches RPG Maker autotile frame descriptions for one fixed shape table.
 *
 * @example
 * ```ts
 * import { RpgmAutotileAtlas, type RpgmAutotileShapeTable } from '@datamoc/mw_games/two-d/render';
 *
 * declare const shapeTable: RpgmAutotileShapeTable;
 * const atlas = new RpgmAutotileAtlas(shapeTable);
 * const frame = atlas.get(7, 0, 3);
 * console.log(frame.quadrants.length); // 4
 * ```
 */
export class RpgmAutotileAtlas {
	private readonly cache = new Map<string, RpgmAutotileFrame>();
	private readonly table: RpgmAutotileShapeTable;

	constructor(table: RpgmAutotileShapeTable) {
		this.table = table;
		validateShapeTable(table);
	}

	get(tileId: number, slot: RpgmAutotileSlot, shape: number): RpgmAutotileFrame {
		const key = `${tileId}:${slot}:${shape}`;
		const cached = this.cache.get(key);
		if (cached) return cached;
		const frame = rpgmAutotileFrame(tileId, slot, shape, this.table);
		this.cache.set(key, frame);
		return frame;
	}

	clear(): void {
		this.cache.clear();
	}
}
