import { defaultStorage, type SaveStorage } from './Save.ts';

/**
 * A personal, local record of completed runs - what `core.Session` (launch count) and
 * `core.Achievements` (derived unlocks, no per-run record) don't keep, and distinct from
 * `SaveSystem.list()`, which enumerates *continuable* slots, not runs already over.
 *
 * `mwg` stays agnostic about what a run's own report actually contains, the same way
 * `SaveSystem` stays agnostic about what "the save" contains: a game supplies its own
 * `summary` shape (score, cause of death, floor reached, whatever it considers a run's own
 * stats) and this only ever stores, lists, and sorts it.
 */
export interface RunHistoryEntry<T> {
	id: string;
	endedAt: number;
	summary: T;
}

export interface RunHistoryOptions {
	/** namespaces the stored history, so two games sharing an origin never collide */
	namespace: string;
	storage?: SaveStorage;
	/** oldest runs are dropped once this many are stored; omit for unlimited */
	limit?: number;
}

export class RunHistory<T> {
	private readonly storage: SaveStorage;
	private readonly limit?: number;
	private readonly key: string;

	constructor(options: RunHistoryOptions) {
		this.storage = options.storage ?? defaultStorage();
		this.limit = options.limit;
		this.key = `mwg-runs:${options.namespace}`;
	}

	private readAll(): RunHistoryEntry<T>[] {
		const raw = this.storage.read(this.key);
		return raw ? (JSON.parse(raw) as RunHistoryEntry<T>[]) : [];
	}

	/** appends a completed run's summary, oldest first; drops the oldest entry once `limit` is exceeded */
	record(summary: T): RunHistoryEntry<T> {
		const entries = this.readAll();
		const entry: RunHistoryEntry<T> = { id: `${Date.now()}-${entries.length}`, endedAt: Date.now(), summary };
		entries.push(entry);
		if (this.limit !== undefined && entries.length > this.limit) entries.splice(0, entries.length - this.limit);
		this.storage.write(this.key, JSON.stringify(entries));
		return entry;
	}

	/** every recorded run, oldest first */
	all(): readonly RunHistoryEntry<T>[] {
		return this.readAll();
	}

	/**
	 * Every recorded run sorted by a field of its own summary - explicitly a local, personal
	 * ranking over this player's own history, not a networked leaderboard comparing players
	 * against each other, which `mwg` does not attempt here.
	 */
	ranked(by: (summary: T) => number, order: 'asc' | 'desc' = 'desc'): readonly RunHistoryEntry<T>[] {
		const entries = this.readAll();
		const sign = order === 'desc' ? -1 : 1;
		return entries.sort((a, b) => sign * (by(a.summary) - by(b.summary)));
	}

	/** drops every recorded run */
	clear(): void {
		this.storage.remove(this.key);
	}
}
