import * as Random from '../core/Random.ts';
import { Level, rectCenter, rectsOverlap, type Rect, type TerrainKind } from './Level.ts';
import { hallBuilder, pickBuilder, type RoomBuilder } from './RoomBuilders.ts';

/**
 * Rooms joined by corridors.
 *
 * Written here rather than taken from rot.js for one reason: the seed. `mwg`'s generator
 * is the framework's own, so a seed produces the same dungeon on every machine and can be
 * saved with the game. Borrowing a generator would mean borrowing its RNG too, and then
 * two independent streams decide what the level looks like.
 *
 * The rooms are kept on the level afterwards, because everything else a game wants to do
 * (put the stairs far from the entrance, spawn a monster where the player is not, place
 * treasure in a dead end) is a question about rooms, not about cells.
 */

export interface DungeonOptions {
	width: number;
	height: number;

	/** how many rooms to attempt; fewer will be placed if they do not fit */
	rooms?: number;

	minRoomSize?: number;
	maxRoomSize?: number;

	/**
	 * How often an extra corridor joins two rooms that are already connected.
	 *
	 * At 0 the dungeon is a tree: exactly one route between any two rooms, which reads as a
	 * maze and makes retreating impossible. A few loops is what makes a level feel like a
	 * place rather than a puzzle.
	 */
	extraCorridors?: number;

	/** the terrain ids to write; both must exist in the kinds passed to the Level */
	wall?: number;
	floor?: number;

	/** extra terrain kinds beyond wall/floor, appended after them - a game's own trap or door ids */
	kinds?: TerrainKind[];

	/**
	 * Regional generation callbacks, fired as the pipeline reaches each stage - the seam a
	 * game hangs hand-placed rooms, branch entrances, wells, plants, statues, chasms, doors
	 * and traps from, without forking the generator itself. `mwg` calls these; it never
	 * decides what a game does inside one.
	 */
	hooks?: DungeonGenerationHooks;

	/**
	 * Room interiors to compose the floor from, picked per room by weight and size fit.
	 *
	 * Omit it and every room is a plain filled rectangle, exactly as before builders existed;
	 * a room no listed builder fits falls back to that same plain rectangle rather than being
	 * left as solid rock, since it has already been placed and joined by a corridor.
	 */
	builders?: readonly RoomBuilder[];
}

export interface DungeonGenerationHooks {
	/** fired once a room is placed and filled, before any corridor touches it */
	onRoomPlaced?(room: Rect, index: number): void;

	/** fired after a corridor is carved between two rooms */
	onCorridorCarved?(edge: RoomEdge, from: Rect, to: Rect): void;
}

/** a corridor between two rooms, by index into the level's own `rooms` array */
export interface RoomEdge {
	a: number;
	b: number;

	/** false for the backbone chain that guarantees reachability; true for an added loop */
	extra: boolean;
}

export interface DungeonResult {
	level: Level;

	/** every corridor carved, backbone first then loops, in carve order */
	graph: RoomEdge[];

	/** placement attempts that were rejected (overlap or off-map) before every room resolved */
	retries: number;

	/**
	 * Which builder carved each room, by the same index the room has in `level.rooms`.
	 *
	 * Always populated, so a floor generated with no `builders` reads as every room being
	 * `'hall'` rather than as an absent field a parity trace would have to special-case.
	 */
	roomBuilders: string[];
}

/**
 * The two terrain kinds every dungeon needs: wall (index 0) and floor (index 1). A game
 * appends its own kinds (traps, doors) after these via `DungeonOptions.kinds`.
 *
 * @example
 * ```ts
 * import { DUNGEON_KINDS } from '@datamoc/mw_games/roguelike';
 *
 * const kinds = [...DUNGEON_KINDS, { passable: false, transparent: true }]; // + a window
 * ```
 */
export const DUNGEON_KINDS: TerrainKind[] = [
	{ passable: false, transparent: false }, //0 wall
	{ passable: true, transparent: true }, //1 floor
];

/**
 * The full pipeline result: the level, its room graph, and how many placement attempts were
 * rejected along the way. `generateDungeon` is the same pipeline, returning only the level,
 * for a caller that has no use for the graph or retry count.
 */
export function generateDungeonGraph(options: DungeonOptions): DungeonResult {
	const {
		width,
		height,
		rooms: roomAttempts = 14,
		minRoomSize = 4,
		maxRoomSize = 10,
		extraCorridors = 3,
		wall = 0,
		floor = 1,
		kinds = [],
		hooks,
		builders,
	} = options;

	const level = new Level(width, height, [...DUNGEON_KINDS, ...kinds], wall);
	const placed: Rect[] = [];
	const graph: RoomEdge[] = [];
	const roomBuilders: string[] = [];
	let retries = 0;

	//rejection sampling: try a spot, keep it if it clears the others. simple, and it fails
	//gracefully: a crowded level just ends up with fewer rooms rather than looping forever
	for (let attempt = 0; attempt < roomAttempts * 6 && placed.length < roomAttempts; attempt++) {
		const w = Random.range(minRoomSize, maxRoomSize);
		const h = Random.range(minRoomSize, maxRoomSize);

		//kept one cell clear of the border, so every room has a wall to carve a door through
		const left = Random.int(1, Math.max(2, width - w - 1));
		const top = Random.int(1, Math.max(2, height - h - 1));

		const room: Rect = { left, top, right: left + w - 1, bottom: top + h - 1 };
		if (room.right >= width - 1 || room.bottom >= height - 1) {
			retries++;
			continue;
		}

		//a two-cell margin, so rooms never share a wall and corridors have somewhere to run
		if (placed.some((other) => rectsOverlap(room, other, 2))) {
			retries++;
			continue;
		}

		placed.push(room);

		//a builder carves the interior; with none supplied (or none that fits) this is the
		//plain filled rectangle the generator always did
		const builder = (builders?.length ? pickBuilder(builders, room) : null) ?? hallBuilder;
		builder.paint(level, room, floor);
		roomBuilders.push(builder.id);

		hooks?.onRoomPlaced?.(room, placed.length - 1);
	}

	//join each room to the previous one, which guarantees every room is reachable
	for (let i = 1; i < placed.length; i++) {
		carveCorridor(level, rectCenter(placed[i - 1]), rectCenter(placed[i]), floor);
		const edge: RoomEdge = { a: i - 1, b: i, extra: false };
		graph.push(edge);
		hooks?.onCorridorCarved?.(edge, placed[i - 1], placed[i]);
	}

	//then a few extra links, so the map has loops instead of being a tree
	for (let i = 0; i < extraCorridors && placed.length > 2; i++) {
		const a = Random.int(placed.length);
		const b = Random.int(placed.length);
		if (a !== b) {
			carveCorridor(level, rectCenter(placed[a]), rectCenter(placed[b]), floor);
			const edge: RoomEdge = { a, b, extra: true };
			graph.push(edge);
			hooks?.onCorridorCarved?.(edge, placed[a], placed[b]);
		}
	}

	level.rooms = placed;
	return { level, graph, retries, roomBuilders };
}

/**
 * Rooms joined by corridors, seeded and reproducible.
 *
 * @example
 * ```ts
 * import { generateDungeon, generateDungeonGraph } from '@datamoc/mw_games/roguelike';
 * import { Random } from '@datamoc/mw_games/core';
 *
 * Random.push(12345); // the same seed always produces the same floor
 * const level = generateDungeon({ width: 60, height: 40, rooms: 12 });
 * Random.pop();
 *
 * // generateDungeonGraph is the same pipeline, also returning the room graph and retries
 * const { level: level2, graph, retries, roomBuilders } = generateDungeonGraph({ width: 60, height: 40 });
 * ```
 */
export function generateDungeon(options: DungeonOptions): Level {
	return generateDungeonGraph(options).level;
}

/**
 * An L-shaped corridor between two points.
 *
 * The corner goes one way or the other at random; always turning the same way makes every
 * corridor on the map lean in the same direction, which is instantly noticeable.
 */
function carveCorridor(
	level: Level,
	from: { x: number; y: number },
	to: { x: number; y: number },
	floor: number
): void {
	const horizontalFirst = Random.chance(0.5);

	if (horizontalFirst) {
		carveLine(level, from.x, to.x, from.y, true, floor);
		carveLine(level, from.y, to.y, to.x, false, floor);
	} else {
		carveLine(level, from.y, to.y, from.x, false, floor);
		carveLine(level, from.x, to.x, to.y, true, floor);
	}
}

function carveLine(
	level: Level,
	fromCoord: number,
	toCoord: number,
	fixed: number,
	horizontal: boolean,
	floor: number
): void {
	const step = fromCoord <= toCoord ? 1 : -1;
	for (let c = fromCoord; c !== toCoord + step; c += step) {
		const x = horizontal ? c : fixed;
		const y = horizontal ? fixed : c;
		//the outermost ring stays solid, so the map always has a wall around it
		if (level.insideWithBorder(x, y)) level.set(x, y, floor);
	}
}

/**
 * A random passable cell, avoiding any listed as taken.
 *
 * @example
 * ```ts
 * import { generateDungeon, findFreeCell, furthestRoom, rectCenter } from '@datamoc/mw_games/roguelike';
 *
 * const level = generateDungeon({ width: 40, height: 30 });
 * const start = rectCenter(level.rooms[0]);
 *
 * const stairsRoom = furthestRoom(level, start); // put the exit far from the entrance
 * const monsterCell = findFreeCell(level, new Set([level.index(start.x, start.y)]));
 * ```
 */
export function findFreeCell(level: Level, taken: ReadonlySet<number> = new Set()): number | null {
	const free = level.passableCells().filter((cell) => !taken.has(cell));
	return free.length > 0 ? free[Random.int(free.length)] : null;
}

/** the room furthest from `from`, by straight-line distance between centres */
export function furthestRoom(level: Level, from: { x: number; y: number }): Rect | null {
	let best: Rect | null = null;
	let bestDistance = -1;

	for (const room of level.rooms) {
		const centre = rectCenter(room);
		const distance = (centre.x - from.x) ** 2 + (centre.y - from.y) ** 2;
		if (distance > bestDistance) {
			bestDistance = distance;
			best = room;
		}
	}

	return best;
}
