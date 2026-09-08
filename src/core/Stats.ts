import { defaultStorage, type SaveStorage } from './Save.ts';
import { StoredValue } from './StoredValue.ts';

export interface PlayerStatsOptions<T, S = T> {
	/** namespaces the stored total, so two games sharing an origin never collide */
	namespace: string;
	storage?: SaveStorage;
	/** the total before anything has ever been recorded */
	initial: T;
	/** folds one run's own summary into the running total */
	combine: (total: T, summary: S) => T;
}

/**
 * A lifetime running total, folded in one run at a time - distinct from `RunHistory`, which
 * keeps individual runs and may drop the oldest ones once its own `limit` is reached.
 * Deriving a lifetime total by reducing over `RunHistory.all()` would silently undercount the
 * moment that limit trims anything, so this keeps its own persisted total instead, updated
 * incrementally by `record` and never recomputed from a list that can shrink. A game wanting
 * both a "last 50 runs" list and a true lifetime total uses both classes side by side, each
 * for the question it actually answers.
 *
 * @example
 * ```ts
 * import { PlayerStats } from '@datamoc/mw_games/core';
 *
 * const lifetimeKills = new PlayerStats<number, number>({
 *   namespace: 'my-game',
 *   initial: 0,
 *   combine: (total, killsThisRun) => total + killsThisRun,
 * });
 *
 * lifetimeKills.record(12); // this run's own kill count folds into the total
 * console.log(lifetimeKills.get());
 * ```
 */
export class PlayerStats<T, S = T> {
	private readonly store: StoredValue<T>;
	private readonly initial: T;
	private readonly combine: (total: T, summary: S) => T;

	constructor(options: PlayerStatsOptions<T, S>) {
		this.store = new StoredValue<T>(options.storage ?? defaultStorage(), `mwg-stats:${options.namespace}`);
		this.initial = options.initial;
		this.combine = options.combine;
	}

	/** the current lifetime total, `initial` if nothing has been recorded yet */
	get(): T {
		return this.store.read(this.initial);
	}

	/** folds `summary` into the running total and persists it, returning the new total */
	record(summary: S): T {
		const next = this.combine(this.get(), summary);
		this.store.write(next);
		return next;
	}

	/** back to `initial`, as a new save file or a "reset stats" option should */
	reset(): void {
		this.store.remove();
	}
}
