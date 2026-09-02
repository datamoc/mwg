import { Path } from 'rot-js';
import type { Level } from './Level.ts';
import type { FieldOfView } from './FieldOfView.ts';

/** the four or eight cell offsets around a point, shared by every neighbour-walking algorithm here */
export function neighbourOffsets(topology: 4 | 8): ReadonlyArray<readonly [number, number]> {
	return topology === 4
		? [
				[0, -1],
				[1, 0],
				[0, 1],
				[-1, 0],
			]
		: [
				[0, -1],
				[1, -1],
				[1, 0],
				[1, 1],
				[0, 1],
				[-1, 1],
				[-1, 0],
				[-1, -1],
			];
}

export interface Step {
	x: number;
	y: number;
}

export interface PathOptions {
	/** 4 for cardinal moves only, 8 to allow diagonals */
	topology?: 4 | 8;

	/**
	 * Cells to treat as blocked beyond the terrain — other creatures, usually.
	 *
	 * Passed per call rather than held, because who is standing where changes every turn
	 * and a cached path is a monster walking through its neighbour.
	 */
	blocked?: ReadonlySet<number>;
}

/**
 * Routes across the map.
 *
 * A* for "how do I get to that one place", which is what a monster chasing the player
 * needs. A Dijkstra map for "which way is the player from anywhere", which is what a dozen
 * monsters chasing the player need — computed once for the whole level rather than once
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
	 * The shortest route from one cell to another.
	 *
	 * @returns the cells to walk through, starting with the one after `from` and ending on
	 * `to`. Empty when there is no route — including when `to` is blocked, so a caller
	 * should exclude the target itself from `blocked` if it means to walk into it.
	 */
	find(from: Step, to: Step, options: PathOptions = {}): Step[] {
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

		if (!passable(to.x, to.y)) return distances;

		const neighbours = neighbourOffsets(options.topology ?? 8);

		//a plain breadth-first flood, since every step costs the same
		const queue: number[] = [this.level.index(to.x, to.y)];
		distances[queue[0]] = 0;

		for (let head = 0; head < queue.length; head++) {
			const cell = queue[head];
			const cx = this.level.xOf(cell);
			const cy = this.level.yOf(cell);
			const next = distances[cell] + 1;

			for (const [dx, dy] of neighbours) {
				const nx = cx + dx;
				const ny = cy + dy;
				if (!passable(nx, ny)) continue;

				const neighbour = this.level.index(nx, ny);
				if (distances[neighbour] !== -1) continue;

				distances[neighbour] = next;
				queue.push(neighbour);
			}
		}

		return distances;
	}

	/** the neighbour of `from` with the lowest value in a distance map */
	descend(from: Step, distances: Int32Array, options: PathOptions = {}): Step | null {
		const passable = this.passable(options);
		const here = distances[this.level.index(from.x, from.y)];
		if (here <= 0) return null;

		const topology = options.topology ?? 8;
		let best: Step | null = null;
		let bestDistance = here;

		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				if (topology === 4 && dx !== 0 && dy !== 0) continue;

				const nx = from.x + dx;
				const ny = from.y + dy;
				if (!passable(nx, ny)) continue;

				const distance = distances[this.level.index(nx, ny)];
				if (distance !== -1 && distance < bestDistance) {
					bestDistance = distance;
					best = { x: nx, y: ny };
				}
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
		if (!passable(from.x, from.y)) return [];

		const neighbours = neighbourOffsets(options.topology ?? 8);
		const cameFrom = new Map<number, Step>();
		const visited = new Set<number>([this.level.index(from.x, from.y)]);
		const queue: Step[] = [from];

		for (let head = 0; head < queue.length; head++) {
			const current = queue[head];
			if (head > 0 && !explored.isExplored(current.x, current.y)) {
				return this.reconstruct(cameFrom, current);
			}

			for (const [dx, dy] of neighbours) {
				const next = { x: current.x + dx, y: current.y + dy };
				if (!passable(next.x, next.y)) continue;

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
