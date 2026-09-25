/**
 * Named save slots, versioned, with a preview - built on plain, JSON-serialisable state
 * rather than truly arbitrary object graphs. A game's own classes are expected to flatten
 * themselves the same way `mwg/rpg`'s `GameState` already does (a `toJSON`/reviving
 * constructor pair), not to be serialised by reference with cycles preserved; that is a
 * different, much larger problem than a save system needs to solve.
 *
 * Nothing stored here is private. Under `file://`, Chromium shares one `localStorage` between
 * every local page, so any HTML file opened on the same machine can read and rewrite these
 * slots; every read is checked (`parseInbound` and the slot shape) for that reason. Never store
 * a secret in a save.
 *
 * @example
 * ```ts
 * import { SaveSystem } from '@datamoc/mw_games/core';
 *
 * interface RunState { depth: number; hp: number }
 *
 * const saves = new SaveSystem<RunState>({ namespace: 'my-game', version: 1 });
 * saves.save('slot1', { depth: 3, hp: 12 }, 'Floor 3, 12 HP');
 *
 * const loaded = saves.load('slot1');
 * if (loaded) console.log(loaded.state.depth); // 3
 * ```
 */
import { scramble, unscramble } from './Scramble.ts';
import { checkSize, parseInbound } from './Sanitize.ts';

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

/** `parseInbound`, then the `{ meta: { version, savedAt }, state }` shape every slot has */
function parseSaveData(text: string, label: string): SaveData<unknown> {
	const data = parseInbound(text, { label }) as Partial<SaveData<unknown>> | null;
	const meta = data?.meta as Partial<SaveMeta> | undefined;
	if (typeof data !== 'object' || data === null || Array.isArray(data) || !('state' in data))
		throw new Error(`${label} is not save data (expected { meta, state })`);
	if (typeof meta !== 'object' || meta === null || !Number.isSafeInteger(meta.version) || meta.version! < 0)
		throw new Error(`${label} has no valid meta.version`);
	if (typeof meta.savedAt !== 'number' || !Number.isFinite(meta.savedAt))
		throw new Error(`${label} has no valid meta.savedAt`);
	return data as SaveData<unknown>;
}

/** the storage a `SaveSystem` writes through - `localStorage`'s shape, so that is the default */
export interface SaveStorage {
	read(key: string): string | null;
	write(key: string, value: string): void;
	remove(key: string): void;
	keys(): string[];
}

/** an in-memory fallback, so saving still works where `localStorage` is unavailable */
export class MemoryStorage implements SaveStorage {
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

	/**
	 * Reads a slot, migrating it up to the current version if it was saved at an older one.
	 * Returns `null` for a corrupted, malformed or tampered slot the same way it already does
	 * for a missing one. The slot is read through `parseInbound` and a shape check, not trusted
	 * because this `SaveSystem` wrote it: a truncated write (an interrupted flush, a quota
	 * eviction) is possible anywhere, and under `file://` Chromium shares one `localStorage`
	 * between every local page, so any other HTML file on the machine can rewrite it. A
	 * save-select screen should see "no usable save here", not an uncaught `SyntaxError`.
	 */
	load(slot: string): SaveData<T> | null {
		const raw = this.storage.read(this.key(slot));
		if (!raw) return null;

		try {
			const data = parseSaveData(raw, `save slot "${slot}"`);
			let state: unknown = data.state;
			for (let v = data.meta.version; v < this.version; v++) {
				state = (this.migrations[v] ?? ((s: unknown) => s))(state);
			}
			return { meta: { ...data.meta, version: this.version }, state: state as T };
		} catch {
			return null;
		}
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
	importExternal(
		slot: string,
		externalBytes: Uint8Array,
		normalize: (bytes: Uint8Array) => unknown,
		preview?: unknown,
	): void {
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
	 * `payload` is size-checked before it is unscrambled, then read through `parseInbound` and
	 * the same shape check `load` applies; any failure throws a named `Error` and leaves the
	 * slot untouched.
	 */
	importSlot(slot: string, payload: string, scrambleKey?: string): void {
		checkSize(payload);
		const raw = scrambleKey ? unscramble(payload, scrambleKey) : payload;
		const data = parseSaveData(raw, 'SaveSystem.importSlot: payload');
		let state = data.state;
		for (let v = data.meta.version; v < this.version; v++) {
			state = (this.migrations[v] ?? ((s: unknown) => s))(state);
		}

		const normalized: SaveData<T> = { meta: { ...data.meta, version: this.version }, state: state as T };
		this.storage.write(this.key(slot), JSON.stringify(normalized));
	}

	/** every slot holding a readable save, and its metadata - for a save-select screen */
	list(): Array<{ slot: string; meta: SaveMeta }> {
		const prefix = `mwg-save:${this.namespace}:`;
		const out: Array<{ slot: string; meta: SaveMeta }> = [];

		for (const key of this.storage.keys()) {
			if (!key.startsWith(prefix)) continue;
			const raw = this.storage.read(key);
			if (!raw) continue;

			try {
				out.push({ slot: key.slice(prefix.length), meta: parseSaveData(raw, key).meta });
			} catch {
				//a slot `load` would refuse is not listed as usable either
			}
		}
		return out;
	}
}
