/**
 * Lightweight 2D collision: overlap tests for AABBs and circles, plus a resolver that stops
 * a moving AABB at the edge of a solid tile instead of passing through it.
 *
 * This is not a rigid-body physics engine - out of scope for a tile/turn-first framework the
 * way a full 3D engine is (see item 45's own caution) - it is the missing primitive behind
 * `rpg.FreeMover`'s own doc comment: "both own position and animation only, nothing about
 * collision or passability". A game wires this in itself; `FreeMover` stays unopinionated
 * about whether a game wants tile solidity, circle-vs-circle hits, or no collision at all.
 */

export interface AABB {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Circle {
	x: number;
	y: number;
	radius: number;
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function circleOverlap(a: Circle, b: Circle): boolean {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const r = a.radius + b.radius;
	return dx * dx + dy * dy < r * r;
}

export function circleAabbOverlap(circle: Circle, box: AABB): boolean {
	const closestX = clamp(circle.x, box.x, box.x + box.width);
	const closestY = clamp(circle.y, box.y, box.y + box.height);
	const dx = circle.x - closestX;
	const dy = circle.y - closestY;
	return dx * dx + dy * dy < circle.radius * circle.radius;
}

/** true when tile `(tileX, tileY)` blocks movement */
export type SolidTile = (tileX: number, tileY: number) => boolean;

export interface ResolveTileMoveOptions {
	tileSize: number;
	isSolid: SolidTile;
}

/**
 * Moves `box` by `(dx, dy)`, one axis at a time, stopping flush against the edge of the
 * first solid tile it would otherwise enter rather than tunnelling through it at high
 * speed. Axis separation (resolve the whole x move, then the whole y move against the
 * already-resolved x) is the standard, simple choice for an axis-aligned tile grid - a full
 * swept-AABB solver buys nothing here since every tile edge is already axis-aligned.
 */
export function resolveAabbAgainstTiles(box: AABB, dx: number, dy: number, options: ResolveTileMoveOptions): { x: number; y: number } {
	const { tileSize, isSolid } = options;
	if (!(tileSize > 0)) throw new Error('collision tileSize must be positive');

	const x = sweepAxis(box.x, box.y, box.width, box.height, dx, tileSize, isSolid, true);
	const y = sweepAxis(x, box.y, box.width, box.height, dy, tileSize, isSolid, false);
	return { x, y };
}

function sweepAxis(
	x: number,
	y: number,
	width: number,
	height: number,
	delta: number,
	tileSize: number,
	isSolid: SolidTile,
	horizontal: boolean
): number {
	if (delta === 0) return horizontal ? x : y;

	const position = horizontal ? x : y;
	const size = horizontal ? width : height;
	const target = position + delta;

	//the perpendicular span of tiles the box's edge sweeps across while moving
	const crossStart = Math.floor((horizontal ? y : x) / tileSize);
	const crossEnd = Math.floor(((horizontal ? y + height : x + width) - 1e-6) / tileSize);

	const solidAt = (leading: number, cross: number): boolean =>
		horizontal ? isSolid(leading, cross) : isSolid(cross, leading);

	if (delta > 0) {
		const fromCell = Math.floor((position + size - 1e-6) / tileSize);
		const toCell = Math.floor((target + size - 1e-6) / tileSize);
		for (let cell = fromCell + 1; cell <= toCell; cell++) {
			for (let cross = crossStart; cross <= crossEnd; cross++) {
				if (solidAt(cell, cross)) return cell * tileSize - size;
			}
		}
	} else {
		const fromCell = Math.floor(position / tileSize);
		const toCell = Math.floor(target / tileSize);
		for (let cell = fromCell - 1; cell >= toCell; cell--) {
			for (let cross = crossStart; cross <= crossEnd; cross++) {
				if (solidAt(cell, cross)) return (cell + 1) * tileSize;
			}
		}
	}

	return target;
}

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}
