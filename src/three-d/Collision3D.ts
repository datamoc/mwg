import type { GridCell3D, GridShape3D } from './Grid.ts';

/**
 * Horizontal collision for `mwg/3d`'s stepped grid terrain (`createTileGrid3D`): a moving
 * capsule/cylinder footprint stopped at the boundary of a raised column instead of clipping
 * through its side, the 3D counterpart to `rpg.Collision`'s 2D tile solidity - and, like that
 * module, this is not a rigid-body physics engine (see item 45's own caution), just the
 * missing primitive behind the bug item 144 was opened from: `Character3D.moveTo`
 * interpolates through open 3D space with no notion of terrain height, collision, or
 * step-up at all, so a path that was not authored to avoid a column's side clips straight
 * through it.
 *
 * A continuous heightmap (`createHeightmapTerrain3D`) is a different technique with its own
 * built-in height query (Babylon's own `GroundMesh.getHeightAtCoordinates`), so it needs
 * nothing from here; this module is specifically for the discrete, per-cell elevation grid
 * `createTileGrid3D` builds columns from, which has no such query at all.
 */

/** looks up a cell's height by its integer grid coordinate in O(1) rather than scanning `cells` on every query */
export function buildHeightIndex(cells: readonly GridCell3D[]): Map<string, number> {
	const index = new Map<string, number>();
	for (const cell of cells) index.set(cellKey(cell.x, cell.y), cell.height ?? 0);
	return index;
}

function cellKey(x: number, y: number): string {
	return `${x},${y}`;
}

/**
 * The integer grid cell nearest world position `(x, z)` - the inverse of `gridPoint3D`.
 * Nearest-cell rounding, not an exact point-in-hexagon test for the hex shape: consistent
 * with `rpg.Collision`'s own choice of simple axis sweeps over a full polygon solver, since
 * every tile a capsule actually stands on is far larger than the rounding error near an edge.
 */
export function cellAt(shape: GridShape3D, x: number, z: number, tileSize = 1): { x: number; y: number } {
	if (!(tileSize > 0)) throw new Error('3D grid collision tileSize must be positive');
	if (shape === 'square') return { x: Math.round(x / tileSize), y: Math.round(z / tileSize) };

	const cellX = Math.round(x / (tileSize * 1.5));
	const cellY = Math.round(z / (Math.sqrt(3) * tileSize) - (cellX & 1) * 0.5);
	return { x: cellX, y: cellY };
}

/** a cell's own `height` (grid-height units, before `heightStep` scaling), or `null` for a world position with no cell at all - a hole in the grid, blocking just like a wall would */
export function heightAt(index: ReadonlyMap<string, number>, shape: GridShape3D, x: number, z: number, tileSize = 1): number | null {
	const cell = cellAt(shape, x, z, tileSize);
	const key = cellKey(cell.x, cell.y);
	return index.has(key) ? index.get(key)! : null;
}

export interface CapsuleGridMoveOptions {
	shape: GridShape3D;
	/** from `buildHeightIndex` */
	heights: ReadonlyMap<string, number>;
	tileSize?: number;
	/** the largest per-cell height difference (grid-height units, not world units) a capsule can step up or down without being blocked; 0 only allows level ground */
	maxStepUp?: number;
	/** positions sampled along the (x, z) segment; higher catches a thin column at high travel speed at the cost of more lookups */
	steps?: number;
}

export interface CapsuleGridMoveResult {
	x: number;
	z: number;
	/** true when the move was stopped short of `to` by a wall-height step or a hole in the grid */
	blocked: boolean;
}

/**
 * Moves a capsule's footprint from `from` toward `to` in the XZ plane, stopping at the last
 * sampled position still within `maxStepUp` of the cell it started the move standing on,
 * rather than passing straight through a column's side the way an un-collided `Character3D`
 * does. Sampling along the segment, not a swept-shape solver, is what stays shape-agnostic
 * across both `createTileGrid3D` shapes without hex-edge-specific geometry: exactly the
 * `resolveAabbAgainstTiles`-style trade-off `rpg.Collision`'s own doc comment already makes,
 * scaled to a grid that is not always axis-aligned.
 */
export function resolveCapsuleAgainstGrid(
	from: { x: number; z: number },
	to: { x: number; z: number },
	options: CapsuleGridMoveOptions
): CapsuleGridMoveResult {
	const { shape, heights, tileSize = 1, maxStepUp = 0, steps = 8 } = options;
	if (!(steps > 0)) throw new Error('3D grid collision steps must be positive');

	let currentHeight = heightAt(heights, shape, from.x, from.z, tileSize) ?? 0;
	let last = { x: from.x, z: from.z };

	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const x = from.x + (to.x - from.x) * t;
		const z = from.z + (to.z - from.z) * t;
		const height = heightAt(heights, shape, x, z, tileSize);
		if (height === null || Math.abs(height - currentHeight) > maxStepUp) {
			return { x: last.x, z: last.z, blocked: true };
		}
		last = { x, z };
		currentHeight = height;
	}
	return { x: last.x, z: last.z, blocked: false };
}
