import * as Random from '../core/Random.ts';
import { Level, rectCenter, rectsOverlap, type Rect, type TerrainKind } from './Level.ts';

/**
 * Rooms joined by corridors.
 *
 * Written here rather than taken from rot.js for one reason: the seed. `mwg`'s generator
 * is the framework's own, so a seed produces the same dungeon on every machine and can be
 * saved with the game. Borrowing a generator would mean borrowing its RNG too, and then
 * two independent streams decide what the level looks like.
 *
 * The rooms are kept on the level afterwards, because everything else a game wants to do —
 * put the stairs far from the entrance, spawn a monster where the player is not, place
 * treasure in a dead end — is a question about rooms, not about cells.
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
}

export const DUNGEON_KINDS: TerrainKind[] = [
	{ passable: false, transparent: false }, //0 wall
	{ passable: true, transparent: true }, //1 floor
];

export function generateDungeon(options: DungeonOptions): Level {
	const {
		width,
		height,
		rooms: roomAttempts = 14,
		minRoomSize = 4,
		maxRoomSize = 10,
		extraCorridors = 3,
		wall = 0,
		floor = 1,
	} = options;

	const level = new Level(width, height, DUNGEON_KINDS, wall);
	const placed: Rect[] = [];

	//rejection sampling: try a spot, keep it if it clears the others. simple, and it fails
	//gracefully — a crowded level just ends up with fewer rooms rather than looping forever
	for (let attempt = 0; attempt < roomAttempts * 6 && placed.length < roomAttempts; attempt++) {
		const w = Random.range(minRoomSize, maxRoomSize);
		const h = Random.range(minRoomSize, maxRoomSize);

		//kept one cell clear of the border, so every room has a wall to carve a door through
		const left = Random.int(1, Math.max(2, width - w - 1));
		const top = Random.int(1, Math.max(2, height - h - 1));

		const room: Rect = { left, top, right: left + w - 1, bottom: top + h - 1 };
		if (room.right >= width - 1 || room.bottom >= height - 1) continue;

		//a two-cell margin, so rooms never share a wall and corridors have somewhere to run
		if (placed.some((other) => rectsOverlap(room, other, 2))) continue;

		placed.push(room);
		level.fillRect(room, floor);
	}

	//join each room to the previous one, which guarantees every room is reachable
	for (let i = 1; i < placed.length; i++) {
		carveCorridor(level, rectCenter(placed[i - 1]), rectCenter(placed[i]), floor);
	}

	//then a few extra links, so the map has loops instead of being a tree
	for (let i = 0; i < extraCorridors && placed.length > 2; i++) {
		const a = placed[Random.int(placed.length)];
		const b = placed[Random.int(placed.length)];
		if (a !== b) carveCorridor(level, rectCenter(a), rectCenter(b), floor);
	}

	level.rooms = placed;
	return level;
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

/** a random passable cell, avoiding any listed as taken */
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
