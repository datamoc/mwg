/**
 * Flat-top hexagon geometry, addressed the same way a square grid is: `x` the column, `y`
 * the row, both integers - which is what lets `mwg/roguelike`'s `Level` (grid logic) and
 * `mwg/render`'s `TileMap` (pixel positions) each reuse it without depending on the other.
 * It lives in `mwg/core` for exactly that reason: neither of those two modules is allowed
 * to depend on the other, and this needs to sit below both.
 *
 * Internally this converts to and from cube coordinates (`x + y + z = 0`) for every
 * calculation, because the six neighbour directions are then a fixed, orientation-agnostic
 * list rather than a column-parity-dependent table someone has to get right twice. The
 * offset "odd-q" scheme below - odd columns pushed half a row down - is what makes that
 * cube math round-trip back to integers; nothing about it is rot.js's, which is deliberate
 * (see the roadmap: rot.js's own hex `Path` topology is doubled-width coordinates built for
 * *pointy-top* hexagons, and does not match this orientation).
 *
 * @example
 * ```ts
 * import { hexNeighbors, hexDistance, hexLine, hexRange, hexToPixel, pixelToHex } from '@datamoc/mw_games/core';
 *
 * const start = { x: 2, y: 2 };
 * const neighbours = hexNeighbors(start.x, start.y); // the 6 adjacent cells
 * const cellsAway = hexDistance(start, { x: 4, y: 1 });
 * const path = hexLine(start, { x: 4, y: 1 }); // every cell the line crosses
 * const nearby = hexRange(start, 2); // every cell within 2 hexes
 *
 * const pixel = hexToPixel(start.x, start.y, 32, 28); // tile width/height in pixels
 * const backToHex = pixelToHex(pixel.x, pixel.y, 32, 28); // round-trips to { x: 2, y: 2 }
 * ```
 */

export interface HexCoord {
	x: number;
	y: number;
}

interface Cube {
	x: number;
	y: number;
	z: number;
}

function toCube(x: number, y: number): Cube {
	const cx = x;
	const cz = y - (x - (x & 1)) / 2;
	return { x: cx, y: -cx - cz, z: cz };
}

function fromCube(cube: Cube): HexCoord {
	const x = cube.x;
	const y = cube.z + (cube.x - (cube.x & 1)) / 2;
	return { x, y };
}

//the six cube directions - orientation-agnostic, and each other's negation in pairs, which
//is what makes the neighbour relation below symmetric by construction
const CUBE_DIRECTIONS: readonly Cube[] = [
	{ x: 1, y: -1, z: 0 },
	{ x: 1, y: 0, z: -1 },
	{ x: 0, y: 1, z: -1 },
	{ x: -1, y: 1, z: 0 },
	{ x: -1, y: 0, z: 1 },
	{ x: 0, y: -1, z: 1 },
];

/** the six cells sharing an edge with `(x, y)` */
export function hexNeighbors(x: number, y: number): HexCoord[] {
	const cube = toCube(x, y);
	return CUBE_DIRECTIONS.map((d) => fromCube({ x: cube.x + d.x, y: cube.y + d.y, z: cube.z + d.z }));
}

/** the number of hex steps between two cells */
export function hexDistance(a: HexCoord, b: HexCoord): number {
	const ca = toCube(a.x, a.y);
	const cb = toCube(b.x, b.y);
	return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}

function cubeRound(cube: Cube): Cube {
	let rx = Math.round(cube.x);
	let ry = Math.round(cube.y);
	let rz = Math.round(cube.z);

	const dx = Math.abs(rx - cube.x);
	const dy = Math.abs(ry - cube.y);
	const dz = Math.abs(rz - cube.z);

	//whichever coordinate drifted furthest from its rounded value is reconstructed from the
	//other two, so x + y + z = 0 still holds exactly
	if (dx > dy && dx > dz) rx = -ry - rz;
	else if (dy > dz) ry = -rx - rz;
	else rz = -rx - ry;

	return { x: rx, y: ry, z: rz };
}

/**
 * Every cell a straight line crosses from `a` to `b`, both included - the hex-grid analogue
 * of `mwg/roguelike`'s `traceLine`, and what a simple (non-shadowcast) hex field of view is
 * built from: walk the line to a candidate cell and see whether anything on it is opaque.
 */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
	const distance = hexDistance(a, b);
	if (distance === 0) return [{ x: a.x, y: a.y }];

	const ca = toCube(a.x, a.y);
	const cb = toCube(b.x, b.y);
	const points: HexCoord[] = [];

	for (let step = 0; step <= distance; step++) {
		const t = step / distance;
		points.push(
			fromCube(
				cubeRound({
					x: ca.x + (cb.x - ca.x) * t,
					y: ca.y + (cb.y - ca.y) * t,
					z: ca.z + (cb.z - ca.z) * t,
				}),
			),
		);
	}

	return points;
}

/** every cell within `radius` hex steps of `center`, `center` itself included */
export function hexRange(center: HexCoord, radius: number): HexCoord[] {
	const cc = toCube(center.x, center.y);
	const out: HexCoord[] = [];

	for (let dx = -radius; dx <= radius; dx++) {
		for (let dy = Math.max(-radius, -dx - radius); dy <= Math.min(radius, -dx + radius); dy++) {
			const dz = -dx - dy;
			out.push(fromCube({ x: cc.x + dx, y: cc.y + dy, z: cc.z + dz }));
		}
	}

	return out;
}

/** which way the tiles point: flat-top (columns) or pointy-top (rows) */
export type HexOrientation = 'flat-top' | 'pointy-top';

/** which columns (flat-top) or rows (pointy-top) are pushed half a step down or right */
export type HexOffset = 'odd' | 'even';

/**
 * How a grid of hexes is laid out on a screen. Both fields default to what this module has always
 * done - flat-top tiles, odd columns pushed half a row down - so a caller that says nothing gets
 * the layout it already had, and a Wesnoth-style map is `{ orientation: 'pointy-top', offset: 'odd' }`.
 */
export interface HexShape {
	readonly orientation?: HexOrientation;
	readonly offset?: HexOffset;
}

/**
 * The pixel position of a hex cell's centre.
 *
 * `tileWidth`/`tileHeight` are the tile as drawn, so a flat-top hex is `0.75` of its width between
 * columns and its full height between rows; a pointy-top one is the transpose of that.
 */
export function hexToPixel(
	x: number,
	y: number,
	tileWidth: number,
	tileHeight: number,
	shape: HexShape = {},
): { x: number; y: number } {
	const parity = (shape.offset ?? 'odd') === 'odd' ? 1 : 0;

	if ((shape.orientation ?? 'flat-top') === 'pointy-top') {
		return {
			x: x * tileWidth + ((y & 1) === parity ? tileWidth / 2 : 0) + tileWidth / 2,
			y: y * tileHeight * 0.75 + tileHeight / 2,
		};
	}

	return {
		x: x * tileWidth * 0.75 + tileWidth / 2,
		y: y * tileHeight + ((x & 1) === parity ? tileHeight / 2 : 0) + tileHeight / 2,
	};
}

/**
 * The hex cell under a pixel position - the inverse of `hexToPixel`.
 *
 * The answer is the nearest cell centre, searched over the cells around the one the pixel looks
 * like it is in, and that is deliberate: a hexagonal tiling has no ties, the containing cell *is* the
 * nearest centre, and a search needs no second set of formulas to stay the inverse of the four
 * orientation-and-offset combinations above. A closed-form inverse would be four more chances to be
 * subtly wrong at a hex's edge, where a click has to land somewhere sensible.
 */
export function pixelToHex(
	px: number,
	py: number,
	tileWidth: number,
	tileHeight: number,
	shape: HexShape = {},
): HexCoord {
	const pointy = (shape.orientation ?? 'flat-top') === 'pointy-top';
	const stepX = pointy ? tileWidth : tileWidth * 0.75;
	const stepY = pointy ? tileHeight * 0.75 : tileHeight;
	const guessX = Math.round((px - tileWidth / 2) / stepX);
	const guessY = Math.round((py - tileHeight / 2) / stepY);

	let best: HexCoord = { x: guessX, y: guessY };
	let bestDistance = Infinity;

	for (let dx = -2; dx <= 2; dx++) {
		for (let dy = -2; dy <= 2; dy++) {
			const candidate = { x: guessX + dx, y: guessY + dy };
			const centre = hexToPixel(candidate.x, candidate.y, tileWidth, tileHeight, shape);
			const distance = (centre.x - px) ** 2 + (centre.y - py) ** 2;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = candidate;
			}
		}
	}

	return best;
}
