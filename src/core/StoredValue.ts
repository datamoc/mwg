import type { SaveStorage } from './Save.ts';

/**
 * One JSON value under one storage key: the read-with-fallback / write / remove trio that
 * `PlayerStats`, `RunHistory` and `NewsSeenTracker` each hand-rolled, with slightly
 * different falsy-vs-null edges per copy. The one here treats any missing or empty read as
 * absent (the `raw ? ... : fallback` rule two of the three already followed); corrupt JSON
 * still throws, the same as before, since silently inventing a value would hide a real bug.
 *
 * Internal: multi-key shapes (`Collection`'s prefix scan, `SaveSystem`'s slots) do not fit
 * it and keep their own code.
 */
export class StoredValue<T> {
	private readonly storage: SaveStorage;
	private readonly key: string;

	constructor(storage: SaveStorage, key: string) {
		this.storage = storage;
		this.key = key;
	}

	/** the stored value, or `fallback` when nothing has been written yet */
	read(fallback: T): T {
		const raw = this.storage.read(this.key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	}

	write(value: T): void {
		this.storage.write(this.key, JSON.stringify(value));
	}

	remove(): void {
		this.storage.remove(this.key);
	}
}
