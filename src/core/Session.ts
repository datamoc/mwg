import { defaultStorage, type SaveStorage } from './Save.ts';

/**
 * Counts how many times a game has been launched, persisted across page loads.
 *
 * Not an achievement, a quest counter, or anything a game reads to change its own
 * behaviour: the one thing this exists for is the signal a native wrapper (Capacitor,
 * Tauri, whatever a game ships through) needs to decide whether a player has used the
 * game enough to plausibly be worth asking for a rating. `mwg` only counts; it never
 * prompts, and has no opinion on what "enough" means.
 */

export interface SessionOptions {
	/** namespaces the count, so two games sharing an origin never collide */
	namespace?: string;
	storage?: SaveStorage;
}

export class Session {
	/** how many times this game has been launched, including this one */
	readonly launches: number;

	constructor(options: SessionOptions = {}) {
		const storage = options.storage ?? defaultStorage();
		const key = `mwg-session:${options.namespace ?? 'default'}`;

		const previous = Number(storage.read(key) ?? '0');
		this.launches = (Number.isFinite(previous) ? previous : 0) + 1;
		storage.write(key, String(this.launches));
	}
}
