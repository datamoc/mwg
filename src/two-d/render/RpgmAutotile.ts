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
	quadrants: readonly [RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant];
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

/**
 * The first MV tile id of each autotile family (A1-A4): slot 0 covers
 * 2048-2815, slot 1 covers 2816-4351, slot 2 covers 4352-5887 and slot 3
 * covers 5888-8191. Measured against real A-sheets rather than assumed.
 */
export const RPGM_AUTOTILE_SLOT_BASES = [2048, 2816, 4352, 5888] as const;

/**
 * How many MV tile ids each family holds: 16, 32, 32 and 48 kinds of
 * 48 shapes each. A sheet holding fewer cells than its slot needs is a
 * truncated custom sheet, not a different layout.
 */
export const RPGM_AUTOTILE_SLOT_COUNTS = [768, 1536, 1536, 2304] as const;

/**
 * Which MV autotile family a raw map tile id belongs to, or null when the id
 * is not an autotile at all (an `EMPTY` cell, a static B-E tile, an A5 tile).
 *
 * @example
 * ```ts
 * import {
 * 	rpgmAutotileSlot,
 * 	RPGM_AUTOTILE_SLOT_BASES,
 * 	RPGM_AUTOTILE_SLOT_COUNTS,
 * } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(rpgmAutotileSlot(2048)); // 0 - the first A1 tile
 * console.log(rpgmAutotileSlot(3000)); // 1 - inside the A2 range
 * console.log(rpgmAutotileSlot(42)); // null - a static tile, not an autotile
 * console.log(rpgmAutotileSlot(-1)); // null - EMPTY reads as blank, never as a slot
 * console.log(RPGM_AUTOTILE_SLOT_BASES[0]); // 2048 - where slot 0 starts
 * console.log(RPGM_AUTOTILE_SLOT_COUNTS[0]); // 768 - 16 kinds times 48 shapes
 * ```
 */
export function rpgmAutotileSlot(tile: number): RpgmAutotileSlot | null {
	if (!Number.isInteger(tile)) return null;
	for (let slot = 0; slot < 4; slot++) {
		if (
			tile >= RPGM_AUTOTILE_SLOT_BASES[slot] &&
			tile < RPGM_AUTOTILE_SLOT_BASES[slot] + RPGM_AUTOTILE_SLOT_COUNTS[slot]
		) {
			return slot as RpgmAutotileSlot;
		}
	}
	return null;
}

/**
 * The standard MV floor-autotile shape table (48 shapes), for slots 0-1:
 * which four atlas quadrants each baked shape assembles, in 24px source
 * cells. Entries are `[x, y]` offsets, row-major `[topLeft, topRight,
 * bottomLeft, bottomRight]`, exactly the shape numbering MV bakes into map
 * tile ids (`shape = (tile - base) % 48`).
 *
 * Functional interop data, the same category as `BLOB_SHAPES`: every game
 * reading MV maps needs these numbers, so they live here once rather than
 * pasted into every port.
 *
 * @example
 * ```ts
 * import { RPGM_FLOOR_AUTOTILE_TABLE, RPGM_WALL_AUTOTILE_TABLE } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(RPGM_FLOOR_AUTOTILE_TABLE.length); // 48 - one entry per baked shape
 * console.log(RPGM_WALL_AUTOTILE_TABLE.length); // 16 - walls cycle every 16 shapes
 * console.log(RPGM_FLOOR_AUTOTILE_TABLE[47]); // [[0,0],[1,0],[0,1],[1,1]] - the full tile
 * ```
 */
export const RPGM_FLOOR_AUTOTILE_TABLE: RpgmAutotileShapeTable = [
	[
		[2, 4],
		[1, 4],
		[2, 3],
		[1, 3],
	],
	[
		[2, 0],
		[1, 4],
		[2, 3],
		[1, 3],
	],
	[
		[2, 4],
		[3, 0],
		[2, 3],
		[1, 3],
	],
	[
		[2, 0],
		[3, 0],
		[2, 3],
		[1, 3],
	],
	[
		[2, 4],
		[1, 4],
		[2, 3],
		[3, 1],
	],
	[
		[2, 0],
		[1, 4],
		[2, 3],
		[3, 1],
	],
	[
		[2, 4],
		[3, 0],
		[2, 3],
		[3, 1],
	],
	[
		[2, 0],
		[3, 0],
		[2, 3],
		[3, 1],
	],
	[
		[2, 4],
		[1, 4],
		[2, 1],
		[1, 3],
	],
	[
		[2, 0],
		[1, 4],
		[2, 1],
		[1, 3],
	],
	[
		[2, 4],
		[3, 0],
		[2, 1],
		[1, 3],
	],
	[
		[2, 0],
		[3, 0],
		[2, 1],
		[1, 3],
	],
	[
		[2, 4],
		[1, 4],
		[2, 1],
		[3, 1],
	],
	[
		[2, 0],
		[1, 4],
		[2, 1],
		[3, 1],
	],
	[
		[2, 4],
		[3, 0],
		[2, 1],
		[3, 1],
	],
	[
		[2, 0],
		[3, 0],
		[2, 1],
		[3, 1],
	],
	[
		[0, 4],
		[1, 4],
		[0, 3],
		[1, 3],
	],
	[
		[0, 4],
		[3, 0],
		[0, 3],
		[1, 3],
	],
	[
		[0, 4],
		[1, 4],
		[0, 3],
		[3, 1],
	],
	[
		[0, 4],
		[3, 0],
		[0, 3],
		[3, 1],
	],
	[
		[2, 2],
		[1, 2],
		[2, 3],
		[1, 3],
	],
	[
		[2, 2],
		[1, 2],
		[2, 3],
		[3, 1],
	],
	[
		[2, 2],
		[1, 2],
		[2, 1],
		[1, 3],
	],
	[
		[2, 2],
		[1, 2],
		[2, 1],
		[3, 1],
	],
	[
		[2, 4],
		[3, 4],
		[2, 3],
		[3, 3],
	],
	[
		[2, 4],
		[3, 4],
		[2, 1],
		[3, 3],
	],
	[
		[2, 0],
		[3, 4],
		[2, 3],
		[3, 3],
	],
	[
		[2, 0],
		[3, 4],
		[2, 1],
		[3, 3],
	],
	[
		[2, 4],
		[1, 4],
		[2, 5],
		[1, 5],
	],
	[
		[2, 0],
		[1, 4],
		[2, 5],
		[1, 5],
	],
	[
		[2, 4],
		[3, 0],
		[2, 5],
		[1, 5],
	],
	[
		[2, 0],
		[3, 0],
		[2, 5],
		[1, 5],
	],
	[
		[0, 4],
		[3, 4],
		[0, 3],
		[3, 3],
	],
	[
		[2, 2],
		[1, 2],
		[2, 5],
		[1, 5],
	],
	[
		[0, 2],
		[1, 2],
		[0, 3],
		[1, 3],
	],
	[
		[0, 2],
		[1, 2],
		[0, 3],
		[3, 1],
	],
	[
		[2, 2],
		[3, 2],
		[2, 3],
		[3, 3],
	],
	[
		[2, 2],
		[3, 2],
		[2, 1],
		[3, 3],
	],
	[
		[2, 4],
		[3, 4],
		[2, 5],
		[3, 5],
	],
	[
		[2, 0],
		[3, 4],
		[2, 5],
		[3, 5],
	],
	[
		[0, 4],
		[1, 4],
		[0, 5],
		[1, 5],
	],
	[
		[0, 4],
		[3, 0],
		[0, 5],
		[1, 5],
	],
	[
		[0, 2],
		[3, 2],
		[0, 3],
		[3, 3],
	],
	[
		[0, 2],
		[1, 2],
		[0, 5],
		[1, 5],
	],
	[
		[0, 4],
		[3, 4],
		[0, 5],
		[3, 5],
	],
	[
		[2, 2],
		[3, 2],
		[2, 5],
		[3, 5],
	],
	[
		[0, 2],
		[3, 2],
		[0, 3],
		[3, 5],
	],
	[
		[0, 0],
		[1, 0],
		[0, 1],
		[1, 1],
	],
];

/**
 * The standard MV wall-autotile shape table (16 shapes), for slots 2-3.
 * Wall shapes cycle every 16 (`table[shape % 16]`), so a wall family holds
 * three full cycles where a floor family holds one run of 48.
 */
export const RPGM_WALL_AUTOTILE_TABLE: RpgmAutotileShapeTable = [
	[
		[2, 2],
		[1, 2],
		[2, 1],
		[1, 1],
	],
	[
		[0, 2],
		[1, 2],
		[0, 1],
		[1, 1],
	],
	[
		[2, 0],
		[1, 0],
		[2, 1],
		[1, 1],
	],
	[
		[0, 0],
		[1, 0],
		[0, 1],
		[1, 1],
	],
	[
		[2, 2],
		[3, 2],
		[2, 1],
		[3, 1],
	],
	[
		[0, 2],
		[3, 2],
		[0, 1],
		[3, 1],
	],
	[
		[2, 0],
		[3, 0],
		[2, 1],
		[3, 1],
	],
	[
		[0, 0],
		[3, 0],
		[0, 1],
		[3, 1],
	],
	[
		[2, 2],
		[1, 2],
		[2, 3],
		[1, 3],
	],
	[
		[0, 2],
		[1, 2],
		[0, 3],
		[1, 3],
	],
	[
		[2, 0],
		[1, 0],
		[2, 3],
		[1, 3],
	],
	[
		[0, 0],
		[1, 0],
		[0, 3],
		[1, 3],
	],
	[
		[2, 2],
		[3, 2],
		[2, 3],
		[3, 3],
	],
	[
		[0, 2],
		[3, 2],
		[0, 3],
		[3, 3],
	],
	[
		[2, 0],
		[3, 0],
		[2, 3],
		[3, 3],
	],
	[
		[0, 0],
		[3, 0],
		[0, 3],
		[3, 3],
	],
];

/** one XP autotile pattern: four 16px mini-block indices, row-major `[topLeft, topRight, bottomLeft, bottomRight]` */
export type XpAutotilePattern = readonly [number, number, number, number];

/**
 * The standard XP autotile pattern table (48 patterns). An XP autotile image
 * is a 96 by 128 template: a 6-column grid of 16px mini-blocks, and each
 * baked pattern assembles four of them. `tile % 48` selects the pattern;
 * `tile / 48` (floored) selects which of the map's autotile images.
 *
 * Miniblock entries are 0-based here (block `n` sits at `(n % 6) * 16`,
 * `(n / 6) * 16`). Learned from real XP autotile images and map data rather
 * than assumed: the 6 by 8 mini-grid fits the measured 96 by 128 template
 * exactly, and the neighbor table below reproduces baked map patterns.
 *
 * @example
 * ```ts
 * import { XP_AUTOTILE_PATTERNS, XP_NEIGHBORS_TO_PATTERN } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(XP_AUTOTILE_PATTERNS.length); // 48 - one entry per baked pattern
 * console.log(XP_AUTOTILE_PATTERNS[0]); // [26,27,32,33] - the filled interior tile
 * console.log(XP_NEIGHBORS_TO_PATTERN.length); // 256 - one entry per 8-neighbour mask
 * console.log(XP_NEIGHBORS_TO_PATTERN[255]); // 0 - surrounded on all sides is the interior
 * ```
 */
export const XP_AUTOTILE_PATTERNS: readonly XpAutotilePattern[] = [
	[26, 27, 32, 33],
	[4, 27, 32, 33],
	[26, 5, 32, 33],
	[4, 5, 32, 33],
	[26, 27, 32, 11],
	[4, 27, 32, 11],
	[26, 5, 32, 11],
	[4, 5, 32, 11],
	[26, 27, 10, 33],
	[4, 27, 10, 33],
	[26, 5, 10, 33],
	[4, 5, 10, 33],
	[26, 27, 10, 11],
	[4, 27, 10, 11],
	[26, 5, 10, 11],
	[4, 5, 10, 11],
	[24, 25, 30, 31],
	[24, 5, 30, 31],
	[24, 25, 30, 11],
	[24, 5, 30, 11],
	[14, 15, 20, 21],
	[14, 15, 20, 11],
	[14, 15, 10, 21],
	[14, 15, 10, 11],
	[28, 29, 34, 35],
	[28, 29, 10, 35],
	[4, 29, 34, 35],
	[4, 29, 10, 35],
	[38, 39, 44, 45],
	[4, 39, 44, 45],
	[38, 5, 44, 45],
	[4, 5, 44, 45],
	[24, 29, 30, 35],
	[14, 15, 44, 45],
	[12, 13, 18, 19],
	[12, 13, 18, 11],
	[16, 17, 22, 23],
	[16, 17, 10, 23],
	[40, 41, 46, 47],
	[4, 41, 46, 47],
	[36, 37, 42, 43],
	[36, 5, 42, 43],
	[12, 17, 18, 23],
	[12, 13, 42, 43],
	[36, 41, 42, 47],
	[16, 17, 46, 47],
	[12, 17, 42, 47],
	[0, 1, 6, 7],
];

/**
 * Which XP pattern an 8-neighbourhood of same-autotile cells bakes to. Index
 * with a bit mask - north `0x01`, northeast `0x02`, east `0x04`, southeast
 * `0x08`, south `0x10`, southwest `0x20`, west `0x40`, northwest `0x80` - for
 * games computing patterns procedurally instead of reading baked map data.
 */
export const XP_NEIGHBORS_TO_PATTERN: readonly number[] = [
	46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40, 42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34,
	17, 34, 16, 46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40, 42, 32, 42, 32, 35, 19, 35, 18, 42, 32,
	42, 32, 34, 17, 34, 16, 45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29, 37, 27, 37, 27, 23, 15, 23,
	13, 37, 27, 37, 27, 22, 11, 22, 9, 45, 39, 45, 39, 33, 31, 33, 29, 45, 39, 45, 39, 33, 31, 33, 29, 36, 26, 36, 26,
	21, 7, 21, 5, 36, 26, 36, 26, 20, 3, 20, 1, 46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43, 40, 42, 32,
	42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16, 46, 44, 46, 44, 43, 41, 43, 40, 46, 44, 46, 44, 43, 41, 43,
	40, 42, 32, 42, 32, 35, 19, 35, 18, 42, 32, 42, 32, 34, 17, 34, 16, 45, 38, 45, 38, 33, 30, 33, 28, 45, 38, 45, 38,
	33, 30, 33, 28, 37, 25, 37, 25, 23, 14, 23, 12, 37, 25, 37, 25, 22, 10, 22, 8, 45, 38, 45, 38, 33, 30, 33, 28, 45,
	38, 45, 38, 33, 30, 33, 28, 36, 24, 36, 24, 21, 6, 21, 4, 36, 24, 36, 24, 20, 2, 20, 0,
];

/** an XP map cell decoded into its autotile image and baked pattern */
export interface XpAutotileRef {
	/** which autotile image, 0-7 (`tile / 48` floored) */
	index: number;
	/** which pattern in that image, 0-47 (`tile % 48`) */
	pattern: number;
}

/**
 * Decodes a raw XP map cell into its autotile image and pattern, or null
 * when the cell holds no autotile reference: `EMPTY`, a static tileset tile
 * (384 and up), or anything outside the 1-383 autotile range.
 *
 * @example
 * ```ts
 * import { xpAutotileRef } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(xpAutotileRef(97)); // { index: 2, pattern: 1 } - second image, second pattern
 * console.log(xpAutotileRef(0)); // null - EMPTY is blank, never an autotile
 * console.log(xpAutotileRef(384)); // null - the first static tileset tile
 * ```
 */
export function xpAutotileRef(tile: number): XpAutotileRef | null {
	if (!Number.isInteger(tile) || tile <= 0 || tile >= 384) return null;
	return { index: Math.floor(tile / 48), pattern: tile % 48 };
}

/**
 * Which XP pattern a cell's 8-neighbourhood bakes to, for maps computed
 * procedurally rather than read from baked data. `sameTerrain` is asked once
 * per direction, with `(dx, dy)` offsets (`(0, -1)` is north); off the map is
 * the caller's to answer (false reads as a border, the edge cell's own value
 * clamps like the editor).
 *
 * @example
 * ```ts
 * import { xpAutotilePattern } from '@datamoc/mw_games/two-d/render';
 *
 * const filled = new Set(['0,0', '1,0', '0,1', '1,1', '-1,0', '0,-1', '2,1', '1,2']);
 * console.log(xpAutotilePattern((dx, dy) => filled.has(`${dx},${dy}`))); // 0 - the interior
 * console.log(xpAutotilePattern(() => false)); // 46 - isolated on all sides
 * ```
 */
export function xpAutotilePattern(sameTerrain: (dx: number, dy: number) => boolean): number {
	let mask = 0;
	if (sameTerrain(0, -1)) mask |= 0x01;
	if (sameTerrain(1, -1)) mask |= 0x02;
	if (sameTerrain(1, 0)) mask |= 0x04;
	if (sameTerrain(1, 1)) mask |= 0x08;
	if (sameTerrain(0, 1)) mask |= 0x10;
	if (sameTerrain(-1, 1)) mask |= 0x20;
	if (sameTerrain(-1, 0)) mask |= 0x40;
	if (sameTerrain(-1, -1)) mask |= 0x80;
	return XP_NEIGHBORS_TO_PATTERN[mask];
}

/**
 * One drawn piece of an autotile cell: where to sample the source sheet and
 * where the piece lands on the map tile, the destination in fractions of one
 * tile (quadrant halves at `0`/`0.5` with size `0.5`, or the whole tile at
 * `0` with size `1` for single-tile strips).
 */
export interface AutotileCellPart {
	sourceX: number;
	sourceY: number;
	sourceWidth: number;
	sourceHeight: number;
	destX: number;
	destY: number;
	destWidth: number;
	destHeight: number;
}

/**
 * An autotile source fully described: everything `autotileCellParts` needs
 * except the sheet texture itself (which lives renderer-side, in the layer).
 * `TileMap.addAutotileLayer` resolves a user-facing `AutotileSet` into one
 * of these and validates it once with `assertAutotileLayout`, so per-cell
 * resolution never re-checks the table.
 */
export type AutotileLayout =
	| {
			format: 'rpgm-mv';
			slot: RpgmAutotileSlot;
			table: RpgmAutotileShapeTable;
			/** kind runs that advance together; a cell whose kind is in no run ignores the frame */
			cycles: ReadonlyArray<ReadonlyArray<number>>;
	  }
	| {
			format: 'rpgm-xp';
			/** which autotile image, 0-7 */
			index: number;
			/** animation stripes in the image; frame wraps around this count */
			frames: number;
			/** a 32px-tall single-tile strip: one whole-tile piece per frame, patterns ignored */
			single: boolean;
	  };

/** the atlas kinds each MV family holds, for validating animation cycles */
const RPGM_AUTOTILE_KIND_COUNTS = [16, 32, 32, 48] as const;

/**
 * Checks a resolved autotile layout once, up front. Throws naming the first
 * problem: a bad slot, an empty shape table, an empty animation cycle, a
 * cycle kind outside its slot's kinds, a bad XP index, or a frame count
 * below one.
 *
 * @example
 * ```ts
 * import {
 * 	assertAutotileLayout,
 * 	RPGM_FLOOR_AUTOTILE_TABLE,
 * } from '@datamoc/mw_games/two-d/render';
 *
 * assertAutotileLayout({ format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [[0, 1, 2]] });
 * assertAutotileLayout({ format: 'rpgm-xp', index: 2, frames: 1, single: false });
 * ```
 */
export function assertAutotileLayout(layout: AutotileLayout): void {
	if (layout.format === 'rpgm-mv') {
		assertSlot(layout.slot);
		validateShapeTable(layout.table);
		const kinds = RPGM_AUTOTILE_KIND_COUNTS[layout.slot];
		const firstKind = SLOT_BASE_KINDS[layout.slot];
		for (const cycle of layout.cycles) {
			if (cycle.length === 0) throw new Error('an autotile animation cycle needs at least one kind');
			for (const kind of cycle) {
				if (!Number.isInteger(kind) || kind < firstKind || kind >= firstKind + kinds) {
					throw new Error(
						`animation cycle kind ${kind} is outside slot ${layout.slot}'s kinds ${firstKind}-${firstKind + kinds - 1}`,
					);
				}
			}
		}
		return;
	}
	if (!Number.isInteger(layout.index) || layout.index < 0 || layout.index > 7) {
		throw new Error(`an XP autotile index must be 0-7, got ${layout.index}`);
	}
	if (!Number.isInteger(layout.frames) || layout.frames < 1) {
		throw new Error(`an XP autotile frame count must be at least 1, got ${layout.frames}`);
	}
}

/** source pixels of one MV quadrant piece: the format's fixed 24px halves */
const RPGM_QUADRANT_SIZE = 24;

/** source pixels of one XP quadrant piece: the format's fixed 16px halves */
const XP_QUADRANT_SIZE = 16;

/** columns of 16px mini-blocks in an XP template image */
const XP_TEMPLATE_COLUMNS = 6;

/** width of one XP animation stripe, in source pixels */
const XP_FRAME_WIDTH = 96;

/** size of one XP single-tile frame, in source pixels */
const XP_SINGLE_TILE_SIZE = 32;

/**
 * Resolves one autotile cell to its drawn pieces: four quadrant halves for a
 * template cell, one whole-tile piece for an XP single-tile strip, or null
 * for a blank cell (`tile <= 0` reads as blank; `EMPTY` is -1).
 *
 * The layout is assumed valid (`assertAutotileLayout`); only the cell and
 * frame are checked here. `tile` must be an integer the layout claims - an
 * MV id in the layout's slot range, an XP id in `index * 48` to
 * `index * 48 + 47` - and `frame` an integer at or above zero, wrapping
 * around the animation cycles (MV) or frame stripes (XP).
 *
 * @example
 * ```ts
 * import {
 * 	autotileCellParts,
 * 	RPGM_FLOOR_AUTOTILE_TABLE,
 * } from '@datamoc/mw_games/two-d/render';
 *
 * const parts = autotileCellParts(
 * 	{ format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [] },
 * 	2048, 0,
 * );
 * console.log(parts?.length); // 4 - one piece per quadrant
 * console.log(parts?.[0].sourceWidth); // 24 - MV quadrant halves
 * console.log(autotileCellParts(
 * 	{ format: 'rpgm-xp', index: 2, frames: 1, single: false },
 * 	97, 0,
 * )?.[0].sourceWidth); // 16 - XP quadrant halves
 * ```
 */
export function autotileCellParts(layout: AutotileLayout, tile: number, frame: number): AutotileCellPart[] | null {
	if (tile <= 0) return null;
	if (!Number.isInteger(frame) || frame < 0) {
		throw new Error(`an autotile animation frame must be an integer at or above zero, got ${frame}`);
	}
	if (layout.format === 'rpgm-mv') return rpgmCellParts(layout, tile, frame);
	return xpCellParts(layout, tile, frame);
}

function rpgmCellParts(
	layout: Extract<AutotileLayout, { format: 'rpgm-mv' }>,
	tile: number,
	frame: number,
): AutotileCellPart[] {
	const base = RPGM_AUTOTILE_SLOT_BASES[layout.slot];
	const count = RPGM_AUTOTILE_SLOT_COUNTS[layout.slot];
	if (!Number.isInteger(tile) || tile < base || tile >= base + count) {
		throw new Error(`tile ${tile} is outside slot ${layout.slot}'s ids ${base}-${base + count - 1}`);
	}
	const offset = tile - base;
	//shorter tables cycle the same way the player's own indexing does
	//(`table[shape % table.length]` over `shape = offset % 48`)
	const shape = (offset % 48) % layout.table.length;
	let kind = SLOT_BASE_KINDS[layout.slot] + Math.floor(offset / 48);
	for (const cycle of layout.cycles) {
		const at = cycle.indexOf(kind);
		if (at >= 0) {
			kind = cycle[(at + frame) % cycle.length];
			break;
		}
	}
	//rpgmAutotileFrame's tileId is the base-relative offset, so a remapped
	//kind keeps the cell's shape and only swaps the kind block
	const described = rpgmAutotileFrame(
		(kind - SLOT_BASE_KINDS[layout.slot]) * 48 + (offset % 48),
		layout.slot,
		shape,
		layout.table,
	);
	return described.quadrants.map((quadrant, index) => ({
		sourceX: quadrant.sourceX,
		sourceY: quadrant.sourceY,
		sourceWidth: RPGM_QUADRANT_SIZE,
		sourceHeight: RPGM_QUADRANT_SIZE,
		destX: (index % 2) / 2,
		destY: Math.floor(index / 2) / 2,
		destWidth: 1 / 2,
		destHeight: 1 / 2,
	}));
}

function xpCellParts(
	layout: Extract<AutotileLayout, { format: 'rpgm-xp' }>,
	tile: number,
	frame: number,
): AutotileCellPart[] {
	if (!Number.isInteger(tile) || tile < layout.index * 48 || tile >= layout.index * 48 + 48 || tile <= 0) {
		throw new Error(
			`tile ${tile} is outside XP autotile ${layout.index}'s ids ${layout.index * 48}-${layout.index * 48 + 47}`,
		);
	}
	if (layout.single) {
		const stripe = (frame % layout.frames) * XP_SINGLE_TILE_SIZE;
		return [
			{
				sourceX: stripe,
				sourceY: 0,
				sourceWidth: XP_SINGLE_TILE_SIZE,
				sourceHeight: XP_SINGLE_TILE_SIZE,
				destX: 0,
				destY: 0,
				destWidth: 1,
				destHeight: 1,
			},
		];
	}
	const pattern = XP_AUTOTILE_PATTERNS[tile % 48];
	const stripe = (frame % layout.frames) * XP_FRAME_WIDTH;
	return pattern.map((block, index) => ({
		sourceX: (block % XP_TEMPLATE_COLUMNS) * XP_QUADRANT_SIZE + stripe,
		sourceY: Math.floor(block / XP_TEMPLATE_COLUMNS) * XP_QUADRANT_SIZE,
		sourceWidth: XP_QUADRANT_SIZE,
		sourceHeight: XP_QUADRANT_SIZE,
		destX: (index % 2) / 2,
		destY: Math.floor(index / 2) / 2,
		destWidth: 1 / 2,
		destHeight: 1 / 2,
	}));
}
