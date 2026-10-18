import type { BusKind, BusLoadContext, BusLoader, LoadedTrack } from './Channels.ts';
import type { RenderBudget } from './Resample.ts';

/**
 * What a bus may spend on decoded tracks. A rendered five-minute stereo track at 44.1 kHz is
 * about 100 MB, so a game that keeps every track it ever played runs a phone out of memory;
 * these are the dials that keep it bounded.
 */
export interface BusBudgetPolicy {
	/** evict the least recently used track once the cache holds more than this many megabytes; unlimited when omitted */
	maxMegabytes?: number;
	/** evict once the cache holds more than this many tracks; unlimited when omitted */
	maxEntries?: number;
	/** applied to a rendered MIDI track before it becomes a buffer: a length cap, mono, half rate */
	render?: RenderBudget;
}

export interface TrackCacheStats {
	entries: number;
	bytes: number;
	hits: number;
	misses: number;
	evictions: number;
}

/**
 * Memory a decoded buffer holds: 32-bit samples on every channel.
 *
 * @example
 * ```ts
 * import { bufferBytes } from '@datamoc/mwg/audio';
 *
 * console.log(bufferBytes({ length: 44100, numberOfChannels: 2 })); // 352800, one stereo second
 * ```
 */
export function bufferBytes(buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels'>): number {
	return buffer.length * buffer.numberOfChannels * 4;
}

/**
 * A least-recently-used cache of loaded tracks under a `BusBudgetPolicy`. A load in flight is
 * shared by everyone who asks for the same key, a failure or a `null` answer is not remembered
 * so the next request retries, and a track that is currently playing survives its own eviction
 * because the `Channel` holds the buffer, so evicting only means the next request decodes again.
 *
 * @example
 * ```ts
 * import { TrackCache, type LoadedTrack } from '@datamoc/mwg/audio';
 *
 * declare function decode(path: string): Promise<LoadedTrack>;
 *
 * const cache = new TrackCache({ maxMegabytes: 64 });
 * const track = await cache.load('music/town.mid', () => decode('music/town.mid'));
 * console.log(cache.stats().bytes, track?.buffer.duration);
 * ```
 */
export class TrackCache {
	private readonly entries = new Map<string, { promise: Promise<LoadedTrack | null>; bytes: number }>();
	private readonly policy: BusBudgetPolicy;
	private hits = 0;
	private misses = 0;
	private evictions = 0;

	constructor(policy: BusBudgetPolicy = {}) {
		this.policy = policy;
	}

	/** the cached track for a key, or the one `make` produces; concurrent calls share one `make` */
	async load(key: string, make: () => Promise<LoadedTrack | null>): Promise<LoadedTrack | null> {
		const hit = this.entries.get(key);
		if (hit) {
			this.hits++;
			//re-inserting moves it to the most recently used end
			this.entries.delete(key);
			this.entries.set(key, hit);
			return hit.promise;
		}
		this.misses++;
		const entry = { promise: make(), bytes: 0 };
		this.entries.set(key, entry);
		try {
			const track = await entry.promise;
			if (!track) {
				if (this.entries.get(key) === entry) this.entries.delete(key);
				return null;
			}
			entry.bytes = bufferBytes(track.buffer);
			this.enforce(key);
			return track;
		} catch (error) {
			if (this.entries.get(key) === entry) this.entries.delete(key);
			throw error;
		}
	}

	/** forgets one track; returns whether it was cached */
	evict(key: string): boolean {
		return this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}

	stats(): TrackCacheStats {
		let bytes = 0;
		for (const entry of this.entries.values()) bytes += entry.bytes;
		return { entries: this.entries.size, bytes, hits: this.hits, misses: this.misses, evictions: this.evictions };
	}

	/** drops the oldest tracks until the caps hold, never the one just loaded: a single track bigger than the cap still plays */
	private enforce(keep: string): void {
		const maxBytes = (this.policy.maxMegabytes ?? Infinity) * 1024 * 1024;
		const maxEntries = this.policy.maxEntries ?? Infinity;
		for (const key of this.entries.keys()) {
			const { bytes, entries } = this.stats();
			if (bytes <= maxBytes && entries <= maxEntries) return;
			if (key === keep) continue;
			this.entries.delete(key);
			this.evictions++;
		}
	}
}

/** a `BusLoader` with the cache it reads through, so a game can show or reset its memory use */
export interface BudgetedLoader extends BusLoader {
	readonly cache: TrackCache;
}

/**
 * Wraps any `BusLoader` in a `TrackCache`: the bus keeps asking by kind and name, and the
 * cache decides what stays in memory. The key includes the kind, since a jingle and a theme
 * may share a name.
 *
 * @example
 * ```ts
 * import { AudioBus, createBudgetedLoader, type BusLoader } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const decode: BusLoader;
 *
 * const load = createBudgetedLoader(decode, { maxMegabytes: 48, maxEntries: 12 });
 * const bus = new AudioBus(context, { load });
 * console.log(load.cache.stats());
 * ```
 */
export function createBudgetedLoader(inner: BusLoader, policy: BusBudgetPolicy): BudgetedLoader {
	const cache = new TrackCache(policy);
	const loader = ((kind: BusKind, name: string, context?: BusLoadContext) =>
		cache.load(`${kind}:${name}`, () => inner(kind, name, context))) as BudgetedLoader;
	Object.defineProperty(loader, 'cache', { value: cache, enumerable: true });
	return loader;
}
