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
 * import { weightedFlood } from '@datamoc/mw_games/core';
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

	const startKey = options.key(start);
	const reached = new Map<K, WeightedCell<T>>([[startKey, { cell: start, cost: 0 }]]);
	const queue: QueueEntry<T, K>[] = [{ cell: start, key: startKey, cost: 0 }];

	while (queue.length > 0) {
		const current = pop(queue)!;
		const known = reached.get(current.key);
		if (!known || current.cost !== known.cost) continue;
		if (options.stop?.(current.cell, current.cost)) continue;

		for (const next of options.neighbors(current.cell)) {
			const step = options.cost(current.cell, next);
			if (!Number.isFinite(step) || step < 0) continue;
			const total = current.cost + step;
			if (total > options.maxCost) continue;
			if (options.canEnter && !options.canEnter(next, current.cell, total)) continue;

			const key = options.key(next);
			if (total >= (reached.get(key)?.cost ?? Infinity)) continue;
			const entry = { cell: next, key, cost: total };
			reached.set(key, entry);
			push(queue, entry);
		}
	}

	return reached;
}

interface QueueEntry<T, K> extends WeightedCell<T> {
	readonly key: K;
}

function push<T, K>(queue: QueueEntry<T, K>[], entry: QueueEntry<T, K>): void {
	queue.push(entry);
	let index = queue.length - 1;
	while (index > 0) {
		const parent = Math.floor((index - 1) / 2);
		if (queue[parent].cost <= queue[index].cost) break;
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
		if (left < queue.length && queue[left].cost < queue[smallest].cost) smallest = left;
		if (right < queue.length && queue[right].cost < queue[smallest].cost) smallest = right;
		if (smallest === index) break;
		[queue[index], queue[smallest]] = [queue[smallest], queue[index]];
		index = smallest;
	}
	return first;
}
