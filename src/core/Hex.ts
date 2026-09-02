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
				})
			)
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

/** the pixel position of a hex cell's centre, for a flat-top tile of the given size */
export function hexToPixel(x: number, y: number, tileWidth: number, tileHeight: number): { x: number; y: number } {
	return {
		x: x * tileWidth * 0.75 + tileWidth / 2,
		y: y * tileHeight + (x & 1) * (tileHeight / 2) + tileHeight / 2,
	};
}

/**
 * The hex cell under a pixel position - the inverse of `hexToPixel`.
 *
 * Fractional cube coordinates first, rounded only at the end (`cubeRound`), the same way
 * `hexLine` resolves a fractional step to a cell - rounding column and row independently
 * would round to the wrong cell right at a hex's edge.
 */
export function pixelToHex(px: number, py: number, tileWidth: number, tileHeight: number): HexCoord {
	const relativeX = px - tileWidth / 2;
	const relativeY = py - tileHeight / 2;

	const cx = relativeX / (tileWidth * 0.75);
	const cz = relativeY / tileHeight - 0.5 * cx;
	const cy = -cx - cz;

	return fromCube(cubeRound({ x: cx, y: cy, z: cz }));
}
