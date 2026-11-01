/** A cell reached by a weighted flood. */
export interface WeightedCell<T> {
	readonly cell: T;
	readonly cost: number;
}

export interface WeightedFloodOptions<T, K> {
	/** Stable identity for a cell; it may be a string, number, or object key. */
	key: (cell: T) => K;
	/** Adjacent cells, in whatever topology the game uses. */
	neighbors: (cell: T) => Iterable<T>;
	/** Cost of entering `to` from `from`; non-finite or negative costs are ignored. */
	cost: (from: T, to: T) => number;
	/** Maximum accumulated cost, inclusive. */
	maxCost: number;
	/** Optional game rule that rejects a candidate before it is reached. */
	canEnter?: (cell: T, from: T, cost: number) => boolean;
	/** Optional game rule that keeps a reached cell from expanding further. */
	stop?: (cell: T, cost: number) => boolean;
}

/**
 * Dijkstra-style weighted flood fill, independent of a particular board or game rule.
 *
 * @example
 * ```ts
 * import { weightedFlood } from '@datamoc/mwg/core';
 *
 * const cells = weightedFlood(0, {
 *   key: (cell) => cell,
 *   neighbors: (cell) => cell < 3 ? [cell + 1] : [],
 *   cost: () => 1,
 *   maxCost: 2,
 * });
 * console.log(cells.get(2)?.cost); // 2
 * ```
 *
 * The returned map includes `start` at cost 0. A game can use `canEnter` for blockers and
 * `stop` for rules such as a zone-of-control boundary; neither callback is interpreted here.
 * Equal-cost revisits are discarded, and the input cells are never mutated.
 */
export function weightedFlood<T, K>(start: T, options: WeightedFloodOptions<T, K>): Map<K, WeightedCell<T>> {
	if (!Number.isFinite(options.maxCost) || options.maxCost < 0) return new Map();
	return flood(start, options).reached;
}

export interface ShortestPathOptions<T, K> {
	/** Stable identity for a cell; it may be a string, number, or object key. */
	key: (cell: T) => K;
	/** Adjacent cells, in whatever topology the game uses. */
	neighbors: (cell: T) => Iterable<T>;
	/** Cost of entering `to` from `from`, defaulting to 1; non-finite or negative costs are ignored. */
	cost?: (from: T, to: T) => number;
	/**
	 * Game rule that rejects a candidate before it is reached.
	 *
	 * `from` is the cell the step starts from. It is `undefined` only for the start cell, which
	 * is checked once before the flood begins; a rule that rejects the start makes the goal
	 * unreachable, `start === goal` included. A one-argument callback such as
	 * `(cell) => cell !== blocked` remains valid and simply ignores `from`.
	 */
	canEnter?: (cell: T, from: T | undefined) => boolean;
	/**
	 * Maximum accumulated cost, inclusive; omitted means no limit. A route costing more than
	 * this is not considered, so the goal can be too far to reach.
	 */
	maxCost?: number;
	/**
	 * Maximum number of cells the flood may examine, an effort cap rather than a cost cap.
	 *
	 * Each settled cell counts once, whether or not it improves any neighbour, so this bounds
	 * the work a search over a large or open board may do. It differs from `maxCost`, which
	 * limits how expensive the route may be but still lets the flood examine any number of
	 * cheap cells; `maxExpanded` limits how many cells are looked at regardless of their cost.
	 * Reaching the cap before the goal is settled makes `shortestPath` return null even when a
	 * route exists. Omitted means no limit; anything other than a positive integer throws.
	 */
	maxExpanded?: number;
}

/**
 * The cheapest route from `start` to `goal`, in order and inclusive of both, or null when the goal
 * cannot be reached within `maxCost` or before `maxExpanded` cells are examined.
 *
 * @example
 * ```ts
 * import { shortestPath } from '@datamoc/mwg/core';
 *
 * const route = shortestPath(0, 3, {
 *   key: (cell) => cell,
 *   neighbors: (cell) => cell < 3 ? [cell + 1] : [],
 * });
 * console.log(route); // [0, 1, 2, 3]
 * ```
 *
 * It runs the same weighted flood as `weightedFlood`, so `cost`, `canEnter` and `maxCost` mean the
 * same thing here; the difference is that this one also remembers the neighbour that last improved
 * each cell's cost, and walks that chain back from the goal. `start === goal` is `[start]` when
 * `canEnter` accepts the start, and a goal that `canEnter` rejects is unreachable.
 *
 * `canEnter` sees both the cell being entered and the cell it is entered from, which is what an
 * origin-dependent rule needs. The usual restriction on diagonal movement is one: a diagonal step
 * is allowed only when at least one of the two orthogonal cells beside it is open, so a unit cannot
 * cut the corner between two walls.
 *
 * ```ts
 * // one-side-open diagonals over a grid of { x, y } cells, where `open` is the walkability rule
 * const diagonal = (from: Cell, to: Cell) => from.x !== to.x && from.y !== to.y;
 * const beside = (from: Cell, to: Cell) => [
 *   { x: to.x, y: from.y },
 *   { x: from.x, y: to.y },
 * ];
 *
 * const route = shortestPath(start, goal, {
 *   key: (cell) => `${cell.x},${cell.y}`,
 *   neighbors: (cell) => around(cell),
 *   canEnter: (next, from) =>
 *     open(next) && (!from || !diagonal(from, next) || beside(from, next).some(open)),
 * });
 * ```
 *
 * Ties between two equally cheap routes are broken by the neighbour order the flood discovered
 * cells in: the first route found, following `neighbors` in iteration order, wins, and an
 * equal-cost revisit never replaces an existing parent. The queue settles equal-cost cells in
 * discovery order too, so repeating the same call returns the same route.
 */
export function shortestPath<T, K>(start: T, goal: T, options: ShortestPathOptions<T, K>): T[] | null {
	const maxExpanded = options.maxExpanded;
	if (maxExpanded !== undefined && (!Number.isInteger(maxExpanded) || maxExpanded < 1)) {
		throw new RangeError(`maxExpanded must be a positive integer, got ${String(maxExpanded)}`);
	}
	if (options.canEnter && !options.canEnter(start, undefined)) return null;
	if (start === goal) return [start];
	const maxCost = options.maxCost ?? Infinity;
	if (Number.isNaN(maxCost) || maxCost < 0) return null;

	const { reached, parent, settled } = flood(start, {
		key: options.key,
		neighbors: options.neighbors,
		cost: options.cost ?? (() => 1),
		maxCost,
		canEnter: options.canEnter,
		maxExpanded,
	});

	const startKey = options.key(start);
	const goalKey = options.key(goal);
	if (!settled.has(goalKey)) return null;

	const path: T[] = [];
	let key = goalKey;
	while (true) {
		const entry = reached.get(key);
		if (!entry) return null;
		path.push(entry.cell);
		if (key === startKey) break;
		const previous = parent.get(key);
		if (previous === undefined) return null;
		key = previous;
	}

	path.reverse();
	return path;
}

interface FloodOptions<T, K> {
	readonly key: (cell: T) => K;
	readonly neighbors: (cell: T) => Iterable<T>;
	readonly cost: (from: T, to: T) => number;
	readonly maxCost: number;
	readonly canEnter?: (cell: T, from: T, cost: number) => boolean;
	readonly stop?: (cell: T, cost: number) => boolean;
	/** how many cells may be settled before the flood gives up; omitted means no limit */
	readonly maxExpanded?: number;
}

interface FloodResult<T, K> {
	readonly reached: Map<K, WeightedCell<T>>;
	/** the neighbour that last improved each key's cost; `start` itself has no parent */
	readonly parent: Map<K, K>;
	/** keys popped with their final cost; a cap can leave a reachable goal out of this set */
	readonly settled: Set<K>;
}

/** the one flood both public functions run; `parent` is what lets `shortestPath` walk back */
function flood<T, K>(start: T, options: FloodOptions<T, K>): FloodResult<T, K> {
	const startKey = options.key(start);
	const reached = new Map<K, WeightedCell<T>>([[startKey, { cell: start, cost: 0 }]]);
	const parent = new Map<K, K>();
	const settled = new Set<K>();
	const queue: QueueEntry<T, K>[] = [{ cell: start, key: startKey, cost: 0, order: 0 }];
	let nextOrder = 1;
	let expanded = 0;

	while (queue.length > 0) {
		const current = pop(queue)!;
		const known = reached.get(current.key);
		if (!known || current.cost !== known.cost) continue;
		if (options.maxExpanded !== undefined && expanded >= options.maxExpanded) break;
		expanded += 1;
		settled.add(current.key);
		if (options.stop?.(current.cell, current.cost)) continue;

		for (const next of options.neighbors(current.cell)) {
			const step = options.cost(current.cell, next);
			if (!Number.isFinite(step) || step < 0) continue;
			const total = current.cost + step;
			if (total > options.maxCost) continue;
			if (options.canEnter && !options.canEnter(next, current.cell, total)) continue;

			const key = options.key(next);
			if (total >= (reached.get(key)?.cost ?? Infinity)) continue;
			reached.set(key, { cell: next, cost: total });
			parent.set(key, current.key);
			push(queue, { cell: next, key, cost: total, order: nextOrder });
			nextOrder += 1;
		}
	}

	return { reached, parent, settled };
}

interface QueueEntry<T, K> extends WeightedCell<T> {
	readonly key: K;
	/** discovery sequence, so equal-cost cells pop in the order the flood found them */
	readonly order: number;
}

function earlier<T, K>(left: QueueEntry<T, K>, right: QueueEntry<T, K>): boolean {
	return left.cost < right.cost || (left.cost === right.cost && left.order < right.order);
}

function push<T, K>(queue: QueueEntry<T, K>[], entry: QueueEntry<T, K>): void {
	queue.push(entry);
	let index = queue.length - 1;
	while (index > 0) {
		const parent = Math.floor((index - 1) / 2);
		if (!earlier(queue[index], queue[parent])) break;
		[queue[parent], queue[index]] = [queue[index], queue[parent]];
		index = parent;
	}
}

function pop<T, K>(queue: QueueEntry<T, K>[]): QueueEntry<T, K> | undefined {
	const first = queue[0];
	const last = queue.pop();
	if (!first || !last || queue.length === 0) return first;
	queue[0] = last;
	let index = 0;
	while (true) {
		const left = index * 2 + 1;
		const right = left + 1;
		let smallest = index;
		if (left < queue.length && earlier(queue[left], queue[smallest])) smallest = left;
		if (right < queue.length && earlier(queue[right], queue[smallest])) smallest = right;
		if (smallest === index) break;
		[queue[index], queue[smallest]] = [queue[smallest], queue[index]];
		index = smallest;
	}
	return first;
}
