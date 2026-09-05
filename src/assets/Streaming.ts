import { load, release } from './index.ts';
import type { AssetProgress } from './index.ts';

export interface AssetBundle {
	id: string;
	paths: readonly string[];
	priority?: number;
	/** caller-supplied estimate, used only for eviction accounting */
	estimatedBytes?: number;
}

export interface AssetStreamOptions {
	budgetBytes?: number;
	load?: (paths: string[], onProgress?: AssetProgress) => Promise<void>;
	release?: (paths: string[]) => Promise<void>;
}

interface Entry extends AssetBundle {
	lastUsed: number;
	ready: boolean;
}

/**
 * Game-directed background asset staging with bounded, least-recently-used eviction.
 *
 * It deliberately does not guess a player's next map: the game supplies bundles it considers
 * likely. This works with compiled data URIs as a decode/GPU warm-up and with server or
 * desktop hosts as ordinary asynchronous streaming.
 */
export class AssetStream {
	private readonly entries = new Map<string, Entry>();
	private readonly budgetBytes: number;
	private readonly loadAssets: (paths: string[], onProgress?: AssetProgress) => Promise<void>;
	private readonly releaseAssets: (paths: string[]) => Promise<void>;
	private clock = 0;

	constructor(options: AssetStreamOptions = {}) {
		this.budgetBytes = options.budgetBytes ?? Number.POSITIVE_INFINITY;
		if (!(this.budgetBytes >= 0)) throw new Error('asset stream budget must not be negative');
		this.loadAssets = options.load ?? load;
		this.releaseAssets = options.release ?? release;
	}

	/** loads one bundle now, then evicts older ready bundles if its budget requires it */
	async preload(bundle: AssetBundle, onProgress?: AssetProgress): Promise<void> {
		if (!bundle.id) throw new Error('asset bundle needs an id');
		if (bundle.estimatedBytes !== undefined && bundle.estimatedBytes < 0) throw new Error('asset bundle size must not be negative');
		const existing = this.entries.get(bundle.id);
		if (existing?.ready) {
			existing.lastUsed = ++this.clock;
			onProgress?.(1);
			return;
		}
		const paths = bundle.paths.filter((path) => !this.isRetained(path));
		if (paths.length > 0) await this.loadAssets([...paths], onProgress);
		else onProgress?.(1);
		this.entries.set(bundle.id, { ...bundle, lastUsed: ++this.clock, ready: true });
		await this.enforceBudget(bundle.id);
	}

	/**
	 * Preloads bundles in highest-priority-first order; callers may intentionally not await it.
	 * `onProgress`, when given, reports overall fraction across every bundle in `bundles` (each
	 * one weighted equally), for a caller that wants one progress figure across the whole list
	 * rather than per-bundle callbacks of its own.
	 */
	async preloadLikely(bundles: readonly AssetBundle[], onProgress?: AssetProgress): Promise<void> {
		const ordered = [...bundles].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
		for (const [index, bundle] of ordered.entries()) {
			await this.preload(bundle, onProgress && ((fraction) => onProgress((index + fraction) / ordered.length)));
		}
		onProgress?.(1);
	}

	/** marks a ready bundle as recently used at the moment a scene adopts it */
	use(id: string): boolean {
		const entry = this.entries.get(id);
		if (!entry?.ready) return false;
		entry.lastUsed = ++this.clock;
		return true;
	}

	isReady(id: string): boolean {
		return this.entries.get(id)?.ready ?? false;
	}

	/** explicitly unloads one bundle, even when the configured budget has room */
	async unload(id: string): Promise<void> {
		const entry = this.entries.get(id);
		if (!entry) return;
		this.entries.delete(id);
		const paths = entry.paths.filter((path) => !this.isRetained(path));
		if (paths.length > 0) await this.releaseAssets(paths);
	}

	get estimatedBytes(): number {
		return [...this.entries.values()].reduce((sum, entry) => sum + (entry.estimatedBytes ?? 0), 0);
	}

	private async enforceBudget(protectedId: string): Promise<void> {
		while (this.estimatedBytes > this.budgetBytes) {
			const candidate = [...this.entries.values()]
				.filter((entry) => entry.id !== protectedId)
				.sort((a, b) => a.lastUsed - b.lastUsed)[0];
			if (!candidate) return;
			await this.unload(candidate.id);
		}
	}

	private isRetained(path: string): boolean {
		return [...this.entries.values()].some((entry) => entry.ready && entry.paths.includes(path));
	}
}
