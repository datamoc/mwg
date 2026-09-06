import * as Random from '../core/Random.ts';
import { Level, type Rect } from './Level.ts';

/**
 * How one room's interior gets carved.
 *
 * The generator decides *where* rooms go and what joins them; a builder decides what a room
 * actually looks like once it has a rectangle to fill. That split is what makes them
 * composable: a game registers a hall, a pillared chamber, a circular vault and a flooded
 * cistern, and any floor is some mixture of them without the generator knowing what a pillar
 * or a cistern is. `mwg` ships exactly one builder (`hallBuilder`, a plain filled rectangle,
 * which is what the generator did unconditionally before builders existed) and expects a
 * game to bring the rest, the same boundary every other module here draws around content.
 */
export interface RoomBuilder {
	/** recorded per room in the generation result, for a parity trace or a game's own bookkeeping */
	id: string;

	/** relative weight against the other eligible builders; defaults to 1 */
	weight?: number;

	/** smallest room this builder can fill, in cells, on either axis */
	minSize?: number;

	/** largest room it can fill; a builder wanting only small rooms sets this */
	maxSize?: number;

	/** carves the room into the level. The rectangle is still solid when this is called */
	paint(level: Level, room: Rect, floor: number): void;
}

/**
 * A plain filled rectangle: the generator's own original behaviour, as a builder.
 *
 * @example
 * ```ts
 * import { generateDungeon, hallBuilder, pickBuilder, eligibleBuilders, type RoomBuilder } from '@datamoc/mw_games/roguelike';
 *
 * const pillaredHall: RoomBuilder = {
 *   id: 'pillared',
 *   minSize: 6,
 *   paint(level, room, floor) {
 *     level.fillRect(room, floor); // then carve pillars into the interior, game-side
 *   },
 * };
 *
 * const level = generateDungeon({ width: 60, height: 40, builders: [hallBuilder, pillaredHall] });
 * ```
 */
export const hallBuilder: RoomBuilder = {
	id: 'hall',
	paint: (level, room, floor) => level.fillRect(room, floor),
};

function shorterSide(room: Rect): number {
	return Math.min(room.right - room.left + 1, room.bottom - room.top + 1);
}

function longerSide(room: Rect): number {
	return Math.max(room.right - room.left + 1, room.bottom - room.top + 1);
}

/**
 * Which builders could fill this room at all, by size.
 *
 * `minSize` is checked against the room's *shorter* side and `maxSize` against its *longer*
 * one, so a builder never gets a rectangle it cannot fit its shape into, in either direction.
 */
export function eligibleBuilders(builders: readonly RoomBuilder[], room: Rect): RoomBuilder[] {
	const short = shorterSide(room);
	const long = longerSide(room);
	return builders.filter((builder) => short >= (builder.minSize ?? 0) && long <= (builder.maxSize ?? Infinity));
}

/**
 * Picks a builder for one room, weighted among those that fit it.
 *
 * Returns `null` when nothing fits, which the generator treats as "fall back to a plain
 * hall" rather than leaving the room solid rock: a room already placed and joined by a
 * corridor has to be walkable, so an over-constrained builder list degrades to a plain room
 * instead of a sealed one a player can path into and never enter.
 */
export function pickBuilder(builders: readonly RoomBuilder[], room: Rect): RoomBuilder | null {
	const eligible = eligibleBuilders(builders, room);
	if (eligible.length === 0) return null;

	const index = Random.weighted(eligible.map((builder) => builder.weight ?? 1));
	return index === null ? null : eligible[index];
}
