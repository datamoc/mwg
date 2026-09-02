import { defaultStorage, type SaveStorage } from './Save.ts';

/**
 * One JSON record in a `Collection`: a string id plus whatever fields the game
 * keeps - quest stages, bestiary sightings, achievements.
 */
export interface DbRecord {
	id: string;
	[field: string]: unknown;
}

export interface CollectionOptions {
	/** key prefix, so two games sharing a browser never meet; defaults to the game's name */
	namespace?: string;
	/** defaults to `localStorage`, falling back to memory where it is unavailable */
	storage?: SaveStorage;
}

/**
 * A named collection of records, queried and filtered - the shape `SaveSystem`
 * does not cover. A save slot is one blob loaded wholesale; a collection is many
 * small records asked questions: `where((q) => !q.done)` is "everything not yet
 * completed".
 *
 * Every call hits the storage directly - nothing is cached, so there is no copy
 * to go stale, and two `Collection` objects over the same name agree trivially.
 * Records come back in insertion order. Built for logs and bestiaries (hundreds
 * of records), not for anything scanned per frame.
 */
export class Collection {
	private readonly prefix: string;
	private readonly storage: SaveStorage;

	constructor(name: string, options: CollectionOptions = {}) {
		if (!name) throw new Error('a collection needs a name');
		this.prefix = `mwg-db:${options.namespace ?? 'default'}:${name}:`;
		this.storage = options.storage ?? defaultStorage();
	}

	/** how many records the collection holds */
	get size(): number {
		return this.keys().length;
	}

	/** every record, in insertion order */
	all(): DbRecord[] {
		return this.keys().map((key) => this.read(key));
	}

	get(id: string): DbRecord | undefined {
		const raw = this.storage.read(this.prefix + id);
		return raw === null ? undefined : (JSON.parse(raw) as DbRecord);
	}

	/** inserts or replaces the record with the same id */
	put(record: DbRecord): void {
		if (typeof record !== 'object' || record === null || Array.isArray(record)) {
			throw new Error('a record must be an object with a string id');
		}
		if (typeof record.id !== 'string' || record.id === '') {
			throw new Error('a record must be an object with a string id');
		}
		this.storage.write(this.prefix + record.id, JSON.stringify(record));
	}

	remove(id: string): void {
		this.storage.remove(this.prefix + id);
	}

	/** the records a predicate keeps - "everything not yet completed" reads exactly like that */
	where(predicate: (record: DbRecord) => boolean): DbRecord[] {
		return this.all().filter(predicate);
	}

	/** empties this collection, and nothing else sharing the storage */
	clear(): void {
		for (const key of this.keys()) this.storage.remove(key);
	}

	private keys(): string[] {
		return this.storage.keys().filter((key) => key.startsWith(this.prefix));
	}

	private read(key: string): DbRecord {
		return JSON.parse(this.storage.read(key) as string) as DbRecord;
	}
}
