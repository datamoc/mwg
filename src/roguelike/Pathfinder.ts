import { Path } from 'rot-js';
import { neighbourOffsets, type Level } from './Level.ts';
import type { FieldOfView } from './FieldOfView.ts';
import type { Elevation } from './Elevation.ts';

/** re-exported here for anyone already importing it from `Pathfinder` - it now lives on
 * `Level`, which is what needs it for a square level's own `neighbors()` */
export { neighbourOffsets };

export interface Step {
	x: number;
	y: number;
}

export interface PathOptions {
	/** 4 for cardinal moves only, 8 to allow diagonals */
	topology?: 4 | 8;

	/**
	 * Cells to treat as blocked beyond the terrain (other creatures, usually).
	 *
	 * Passed per call rather than held, because who is standing where changes every turn
	 * and a cached path is a monster walking through its neighbour.
	 */
	blocked?: ReadonlySet<number>;

	/**
	 * The map's heights, when climbing matters. A step from one cell to the next is
	 * allowed when the destination rises no more than `climb` above the start;
	 * going down is always allowed, the way stepping off a ledge is. Needs `heights`
	 * to mean anything on its own.
	 */
	heights?: Elevation;

	/** how many levels up one step may climb; defaults to 1, the ordinary stair or ramp */
	climb?: number;
}

/**
 * Routes across the map.
 *
 * A* for "how do I get to that one place", which is what a monster chasing the player
 * needs. A Dijkstra map for "which way is the player from anywhere", which is what a dozen
 * monsters chasing the player need, computed once for the whole level rather than once
 * per monster.
 */
export class Pathfinder {
	private level: Level;

	constructor(level: Level) {
		this.level = level;
	}

	private passable(options: PathOptions): (x: number, y: number) => boolean {
		const blocked = options.blocked;
		return (x, y) => {
			if (!this.level.passable(x, y)) return false;
			return !blocked?.has(this.level.index(x, y));
		};
	}

	/**
	 * Whether one step is walkable: passable ground, unblocked, and no harder a
	 * climb than allowed. Without `heights` this is passability alone, so flat
	 * maps never pay for a notion they do not use.
	 */
	private stepper(options: PathOptions): (fromX: number, fromY: number, toX: number, toY: number) => boolean {
		const passable = this.passable(options);
		const heights = options.heights;
		//a step with either end off the map is never walkable. Said out loud it is
		//obvious; it is stated because Level.index does not bounds-check, so an
		//off-map cell aliases a real one and must never reach an index call.
		if (!heights) {
			return (fx, fy, tx, ty) => this.level.inside(fx, fy) && this.level.inside(tx, ty) && passable(tx, ty);
		}
		const climb = options.climb ?? 1;
		if (!Number.isInteger(climb) || climb < 0) {
			throw new Error(`a climb limit must be a non-negative whole number, got ${options.climb}`);
		}
		return (fx, fy, tx, ty) =>
			this.level.inside(fx, fy) &&
			this.level.inside(tx, ty) &&
			passable(tx, ty) &&
			heights.heightAt(tx, ty) - heights.heightAt(fx, fy) <= climb;
	}

	/**
	 * The shortest route from one cell to another.
	 *
	 * @returns the cells to walk through, starting with the one after `from` and ending on
	 * `to`. Empty when there is no route (including when `to` is blocked), so a caller
	 * should exclude the target itself from `blocked` if it means to walk into it.
	 */
	find(from: Step, to: Step, options: PathOptions = {}): Step[] {
		//rot.js's own A* is square-grid only (its topology option is the 4/8 offsets above,
		//nothing hex-shaped); a hex Level instead walks a Dijkstra map one descend() at a
		//time, which needs no topology-specific search of its own since distanceMap and
		//descend already go through Level.neighbors. Heights join the hex path for the same
		//reason: rot.js's passability callback sees one cell at a time, but a climb limit
		//compares two, so a height-aware search descends a Dijkstra map whatever the shape.
		if (this.level.shape === 'hex' || options.heights) {
			const distances = this.distanceMap(to, options);
			const steps: Step[] = [];
			let current = from;
			for (let guard = 0; guard < this.level.cellCount; guard++) {
				const next = this.descend(current, distances, options);
				if (!next) break;
				steps.push(next);
				if (next.x === to.x && next.y === to.y) break;
				current = next;
			}
			return steps;
		}

		const astar = new Path.AStar(to.x, to.y, this.passable(options), {
			topology: options.topology ?? 8,
		});

		const steps: Step[] = [];
		astar.compute(from.x, from.y, (x, y) => steps.push({ x, y }));

		//rot.js includes the starting cell; a caller wants where to go, not where it is
		return steps.slice(1);
	}

	/** just the next step towards a target, which is all a chasing monster needs */
	step(from: Step, to: Step, options: PathOptions = {}): Step | null {
		return this.find(from, to, options)[0] ?? null;
	}

	/**
	 * Distance from every reachable cell to `to`, in steps.
	 *
	 * One pass gives every creature on the map its direction: each reads the value under
	 * itself and moves to whichever neighbour is lower. That is a Dijkstra map, and it is
	 * the difference between one flood fill per turn and one per monster per turn.
	 */
	distanceMap(to: Step, options: PathOptions = {}): Int32Array {
		const distances = new Int32Array(this.level.cellCount).fill(-1);
		const passable = this.passable(options);
		const canStep = this.stepper(options);

		if (!passable(to.x, to.y)) return distances;

		//a plain breadth-first flood, since every step costs the same
		const queue: number[] = [this.level.index(to.x, to.y)];
		distances[queue[0]] = 0;

		for (let head = 0; head < queue.length; head++) {
			const cell = queue[head];
			const cx = this.level.xOf(cell);
			const cy = this.level.yOf(cell);
			const next = distances[cell] + 1;

			for (const n of this.level.neighbors(cx, cy, options.topology ?? 8)) {
				//reversed: the flood expands away from the target, but travel runs
				//towards it, and a climb limit reads differently each way. Checking
				//the travel direction keeps every distance exact, so descend() can
				//never strand on a cell with no legal step downhill.
				if (!canStep(n.x, n.y, cx, cy)) continue;

				const neighbour = this.level.index(n.x, n.y);
				if (distances[neighbour] !== -1) continue;

				distances[neighbour] = next;
				queue.push(neighbour);
			}
		}

		return distances;
	}

	/** the neighbour of `from` with the lowest value in a distance map */
	descend(from: Step, distances: Int32Array, options: PathOptions = {}): Step | null {
		const canStep = this.stepper(options);
		const here = distances[this.level.index(from.x, from.y)];
		if (here <= 0) return null;

		let best: Step | null = null;
		let bestDistance = here;

		for (const n of this.level.neighbors(from.x, from.y, options.topology ?? 8)) {
			if (!canStep(from.x, from.y, n.x, n.y)) continue;

			const distance = distances[this.level.index(n.x, n.y)];
			if (distance !== -1 && distance < bestDistance) {
				bestDistance = distance;
				best = n;
			}
		}

		return best;
	}

	/**
	 * Autoexplore: the path to the nearest passable, reachable cell not yet explored -
	 * "walk towards whatever is unseen" rather than a chosen destination. A breadth-first
	 * flood from `from` stops at the first unexplored cell it reaches, which is nearest by
	 * construction; a Dijkstra map from a single target cannot answer this, since there is
	 * no one target until the search itself finds one.
	 *
	 * @returns the steps to walk there, or `[]` when everything reachable is already explored
	 */
	autoExplore(from: Step, explored: FieldOfView, options: PathOptions = {}): Step[] {
		const passable = this.passable(options);
		const canStep = this.stepper(options);
		if (!passable(from.x, from.y)) return [];

		const cameFrom = new Map<number, Step>();
		const visited = new Set<number>([this.level.index(from.x, from.y)]);
		const queue: Step[] = [from];

		for (let head = 0; head < queue.length; head++) {
			const current = queue[head];
			if (head > 0 && !explored.isExplored(current.x, current.y)) {
				return this.reconstruct(cameFrom, current);
			}

			for (const next of this.level.neighbors(current.x, current.y, options.topology ?? 8)) {
				if (!canStep(current.x, current.y, next.x, next.y)) continue;

				const index = this.level.index(next.x, next.y);
				if (visited.has(index)) continue;

				visited.add(index);
				cameFrom.set(index, current);
				queue.push(next);
			}
		}

		return [];
	}

	/** walks a `cameFrom` chain back to (but excluding) its start, then reverses it */
	private reconstruct(cameFrom: Map<number, Step>, to: Step): Step[] {
		const path: Step[] = [to];

		let step = cameFrom.get(this.level.index(to.x, to.y));
		while (step) {
			path.push(step);
			step = cameFrom.get(this.level.index(step.x, step.y));
		}

		return path.reverse();
	}
}
