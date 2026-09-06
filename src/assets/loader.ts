import { Assets, Texture } from 'pixi.js';
import { resolve, type AssetProgress } from './paths.ts';

/**
 * Actually fetching and decoding assets, which is the half that needs Pixi.
 *
 * Split from `paths.ts` so path resolution stays renderer-free: a game rendering through
 * something other than Pixi (`mwg/3d` on Babylon) resolves paths through the same compiled
 * asset map and hands the fetch to its own loader, rather than importing this file at all.
 */

/**
 * Loads assets by path, giving each one an alias equal to its path.
 *
 * Load everything a scene needs before creating it; afterwards `texture()` is synchronous,
 * so game code never has to await in the middle of building a scene. `onProgress`, when
 * given, is item 135's `LoadQueue`/`LoadingScreen` seam for a task that would otherwise only
 * ever report 0 then 1 around one opaque `await`.
 */
export async function load(paths: string[], onProgress?: AssetProgress): Promise<void> {
	const pending = paths.filter((path) => !Assets.cache.has(path));
	if (pending.length === 0) {
		onProgress?.(1);
		return;
	}

	for (const path of pending) {
		Assets.add({ alias: path, src: resolve(path) });
	}
	await Assets.load(pending, onProgress);
}

/** a loaded texture, by the same path it was loaded with */
export function texture(path: string): Texture {
	if (!Assets.cache.has(path)) {
		throw new Error(`texture "${path}" has not been loaded - pass it to load() first`);
	}
	return Assets.get<Texture>(path);
}

/** a loaded asset of any other kind, such as parsed JSON */
export function get<T>(path: string): T {
	if (!Assets.cache.has(path)) {
		throw new Error(`asset "${path}" has not been loaded - pass it to load() first`);
	}
	return Assets.get<T>(path);
}

/** true once `load` has resolved for this path and it has not since been `release`d */
export function isLoaded(path: string): boolean {
	return Assets.cache.has(path);
}

/**
 * Frees assets `load` brought in, destroying any texture among them so it stops holding GPU
 * memory. For a game with many discrete zones - each with its own tileset or sprite sheet -
 * this is the counterpart to `world.World.unload`: that drops a map's own state, this drops
 * the assets it pointed at, once a game decides the player has left an area for good. A path
 * never loaded (or already released) is silently skipped rather than treated as an error,
 * since a game unloading a zone it may or may not have visited shouldn't have to check first.
 */
export async function release(paths: string[]): Promise<void> {
	const loaded = paths.filter((path) => Assets.cache.has(path));
	if (loaded.length === 0) return;
	await Assets.unload(loaded);
}
