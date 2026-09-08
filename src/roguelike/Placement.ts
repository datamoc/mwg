import * as Random from '../core/Random.ts';
import type { Level } from './Level.ts';

/**
 * Filters over terrain and occupancy for a placement pool - the seam a dungeon's
 * feature/content hooks use to ask "which cells could this go on" without `FeatureLayer` or
 * a game's own item/monster classes ever entering the picture. Every field is optional and
 * narrows the pool further; omitting all of them is every cell on the level.
 */
export interface PlacementFilter {
	/** raw terrain kind ids eligible (indices into the `Level`'s own `kinds`); omit for any kind */
	terrain?: ReadonlySet<number>;

	/** cells to exclude - already taken by another feature, a monster, an item */
	occupied?: ReadonlySet<number>;

	/** restrict the search to these cells (a room's interior, a hand-picked region); omit for the whole level */
	within?: Iterable<number>;
}

/** Every cell on `level` matching `filter` - the pool a placement selects from. */
export function candidateCells(level: Level, filter: PlacementFilter = {}): number[] {
	const source = filter.within ? [...filter.within] : range(level.cellCount);
	return source.filter((cell) => {
		if (filter.occupied?.has(cell)) return false;
		if (filter.terrain && !filter.terrain.has(level.terrain[cell])) return false;
		return true;
	});
}

/** Cells within `radius` neighbour-steps of `center` (via `Level.forEachNeighbor`, so hex and square both work), never including `center` itself. */
export function cellsNear(level: Level, center: number, radius: number): number[] {
	const seen = new Set<number>([center]);
	let frontier = [center];

	for (let step = 0; step < Math.max(0, radius); step++) {
		const next: number[] = [];
		for (const cell of frontier) {
			level.forEachNeighbor(level.xOf(cell), level.yOf(cell), 8, (x, y) => {
				if (!level.inside(x, y)) return;
				const neighbor = level.index(x, y);
				if (seen.has(neighbor)) return;
				seen.add(neighbor);
				next.push(neighbor);
			});
		}
		frontier = next;
	}

	seen.delete(center);
	return [...seen];
}

export interface PlacementTraceEntry {
	requested: number;
	available: number;
	selected: number[];
}

export interface PlacementResult {
	cells: number[];
	trace: PlacementTraceEntry;
}

/**
 * Picks `count` distinct cells out of `candidates` without replacement, falling back to
 * however many exist when fewer are available rather than throwing or looping forever - a
 * crowded region just gets fewer placements, the same "fail gracefully, place fewer" shape
 * `generateDungeonGraph`'s own room placement already uses. Pure: nothing is placed or
 * marked taken until the caller acts on `cells` itself (typically `FeatureLayer.place`, or
 * folding `cells` into the next call's own `occupied` set). `trace` is plain, JSON-safe data
 * a game can push straight into `DungeonArtifacts.content` for a parity check, or persist
 * across save/load the same way any other roll trace does.
 *
 * Composes with `candidateCells` and `cellsNear` for the three shapes a regional generator
 * needs: several neighbouring items (`cellsNear` around one anchor, intersected with a
 * terrain/occupancy pool, then selected from), scattered decorations across a whole region
 * (`candidateCells` with a large `within`, then selected from with a larger `count`), and a
 * single branch or room reward (`candidateCells` scoped to one room, `count: 1`).
 *
 * @example
 * ```ts
 * import { candidateCells, cellsNear, selectDistinctCells } from '@datamoc/mw_games/roguelike';
 *
 * declare const level: import('@datamoc/mw_games/roguelike').Level;
 * const FLOOR = new Set([1]);
 *
 * // scatter 3 decorations anywhere on the floor
 * const pool = candidateCells(level, { terrain: FLOOR });
 * const { cells: decorations, trace } = selectDistinctCells(pool, 3);
 *
 * // then release 2 more items clustered around one of those cells
 * const nearby = cellsNear(level, decorations[0], 2).filter((c) => pool.includes(c));
 * const { cells: cluster } = selectDistinctCells(nearby, 2);
 * ```
 */
export function selectDistinctCells(candidates: readonly number[], count: number): PlacementResult {
	const pool = [...new Set(candidates)];
	Random.shuffle(pool);
	const cells = pool.slice(0, Math.max(0, count));
	return { cells, trace: { requested: count, available: pool.length, selected: cells } };
}

function range(n: number): number[] {
	const out = new Array<number>(n);
	for (let i = 0; i < n; i++) out[i] = i;
	return out;
}
