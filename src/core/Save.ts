/**
 * Named save slots, versioned, with a preview - built on plain, JSON-serialisable state
 * rather than truly arbitrary object graphs. A game's own classes are expected to flatten
 * themselves the same way `mwg/rpg`'s `GameState` already does (a `toJSON`/reviving
 * constructor pair), not to be serialised by reference with cycles preserved; that is a
 * different, much larger problem than a save system needs to solve.
 */
import { scramble, unscramble } from './Scramble.ts';
import { checkSize, sanitizeInboundText } from './Sanitize.ts';

export interface SaveMeta {
	version: number;
	savedAt: number;

	/** whatever a save-select screen shows: a summary string, a screenshot data URI, anything */
	preview?: unknown;
}

export interface SaveData<T> {
	meta: SaveMeta;
	state: T;
}

/** the storage a `SaveSystem` writes through - `localStorage`'s shape, so that is the default */
export interface SaveStorage {
	read(key: string): string | null;
	write(key: string, value: string): void;
	remove(key: string): void;
	keys(): string[];
}

/** an in-memory fallback, so saving still works where `localStorage` is unavailable */
class MemoryStorage implements SaveStorage {
	private data = new Map<string, string>();

	read(key: string): string | null {
		return this.data.get(key) ?? null;
	}

	write(key: string, value: string): void {
		this.data.set(key, value);
	}

	remove(key: string): void {
		this.data.delete(key);
	}

	keys(): string[] {
		return [...this.data.keys()];
	}
}

/** `localStorage` where it exists, the in-memory fallback where it does not (including `file://`) */
export function defaultStorage(): SaveStorage {
	if (typeof localStorage === 'undefined') return new MemoryStorage();

	return {
		read: (key) => localStorage.getItem(key),
		write: (key, value) => localStorage.setItem(key, value),
		remove: (key) => localStorage.removeItem(key),
		keys: () => Object.keys(localStorage),
	};
}

export interface SaveSystemOptions {
	/** namespaces every slot key, so two games sharing an origin never collide */
	namespace: string;
	version: number;

	/** upgrades state saved at key `v` to version `v + 1`; applied in sequence up to `version` */
	migrations?: Record<number, (state: unknown) => unknown>;
	storage?: SaveStorage;
}

export class SaveSystem<T> {
	private namespace: string;
	private version: number;
	private migrations: Record<number, (state: unknown) => unknown>;
	private storage: SaveStorage;

	constructor(options: SaveSystemOptions) {
		this.namespace = options.namespace;
		this.version = options.version;
		this.migrations = options.migrations ?? {};
		this.storage = options.storage ?? defaultStorage();
	}

	private key(slot: string): string {
		return `mwg-save:${this.namespace}:${slot}`;
	}

	save(slot: string, state: T, preview?: unknown): void {
		const data: SaveData<T> = { meta: { version: this.version, savedAt: Date.now(), preview }, state };
		this.storage.write(this.key(slot), JSON.stringify(data));
	}

	/** reads a slot, migrating it up to the current version if it was saved at an older one */
	load(slot: string): SaveData<T> | null {
		const raw = this.storage.read(this.key(slot));
		if (!raw) return null;

		const data = JSON.parse(raw) as SaveData<T>;
		let state: unknown = data.state;
		for (let v = data.meta.version; v < this.version; v++) {
			state = (this.migrations[v] ?? ((s: unknown) => s))(state);
		}

		return { meta: { ...data.meta, version: this.version }, state: state as T };
	}

	/**
	 * Adopts a save this `SaveSystem` never wrote: `normalize` runs once on `externalBytes`,
	 * producing state at version 0, which is then carried up through the same `migrations`
	 * chain an ordinary `load` already uses to reach the current version - a game supplies
	 * one `normalize` per external format it wants to accept (an `rpg.decodeMarshal`-based
	 * one for a `Game.rxdata`, say), rather than hand-rolling "decode, then call `save`"
	 * outside the versioned pipeline every migration otherwise goes through.
	 *
	 * `externalBytes` is size-checked before `normalize` ever sees it - a cheap, structural
	 * guard against a truncated or hostile file, ahead of and distinct from validating
	 * whatever shape `normalize` itself produces.
	 */
	importExternal(slot: string, externalBytes: Uint8Array, normalize: (bytes: Uint8Array) => unknown, preview?: unknown): void {
		checkSize(externalBytes);
		let state: unknown = normalize(externalBytes);
		for (let v = 0; v < this.version; v++) {
			state = (this.migrations[v] ?? ((s: unknown) => s))(state);
		}

		const data: SaveData<T> = { meta: { version: this.version, savedAt: Date.now(), preview }, state: state as T };
		this.storage.write(this.key(slot), JSON.stringify(data));
	}

	delete(slot: string): void {
		this.storage.remove(this.key(slot));
	}

	/**
	 * Reads a slot back out as a portable string a player can carry to another browser or
	 * device, or hand to their own server - the counterpart to `importSlot`, for `mwg`'s own
	 * save shape rather than a foreign one (`importExternal` covers that side). `scrambleKey`,
	 * when given, runs the payload through `scramble` first: not encryption, only enough to
	 * stop a save being hand-edited in a text editor. Returns null for a slot with no save.
	 */
	exportSlot(slot: string, scrambleKey?: string): string | null {
		const raw = this.storage.read(this.key(slot));
		if (raw === null) return null;
		return scrambleKey ? scramble(raw, scrambleKey) : raw;
	}

	/**
	 * Writes a payload from this `SaveSystem`'s own `exportSlot` back as an ordinary save,
	 * migrated up to the current version the same way `load` migrates an older save found
	 * locally. `scrambleKey` must match whatever `exportSlot` scrambled it with, if any.
	 *
	 * `payload` is size- and control-character-checked before it is unscrambled or parsed -
	 * this crossed a device or a server, unlike `load`'s own `localStorage`, which this same
	 * `SaveSystem` wrote itself and has no reason to distrust.
	 */
	importSlot(slot: string, payload: string, scrambleKey?: string): void {
		checkSize(payload);
		const raw = scrambleKey ? unscramble(payload, scrambleKey) : payload;
		const data = JSON.parse(sanitizeInboundText(raw)) as SaveData<unknown>;
		let state = data.state;
		for (let v = data.meta.version; v < this.version; v++) {
			state = (this.migrations[v] ?? ((s: unknown) => s))(state);
		}

		const normalized: SaveData<T> = { meta: { ...data.meta, version: this.version }, state: state as T };
		this.storage.write(this.key(slot), JSON.stringify(normalized));
	}

	/** every slot with a save, and its metadata - for a save-select screen */
	list(): Array<{ slot: string; meta: SaveMeta }> {
		const prefix = `mwg-save:${this.namespace}:`;
		const out: Array<{ slot: string; meta: SaveMeta }> = [];

		for (const key of this.storage.keys()) {
			if (!key.startsWith(prefix)) continue;
			const raw = this.storage.read(key);
			if (!raw) continue;

			out.push({ slot: key.slice(prefix.length), meta: (JSON.parse(raw) as SaveData<T>).meta });
		}
		return out;
	}
}
