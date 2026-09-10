import { Assets, Texture } from 'pixi.js';
import { resolve, type AssetProgress } from './paths.ts';

/**
 * Actually fetching and decoding assets, which is the half that needs Pixi.
 *
 * Split from `paths.ts` so path resolution stays renderer-free: a game rendering through
 * something other than Pixi (`mwg/3d` on Babylon) resolves paths through the same compiled
 * asset map and hands the fetch to its own loader, rather than importing this file at all.
 *
 * @example
 * ```ts
 * import { load, texture, isLoaded, release } from '@datamoc/mw_games/assets';
 *
 * await load(['tiles.png', 'data/level1.json']);
 * const tilesTexture = texture('tiles.png');
 * console.log(isLoaded('tiles.png')); // true
 *
 * await release(['tiles.png']); // frees the GPU texture once a zone is left for good
 * ```
 */

export interface LoadAssetsOptions {
	/** item 135's `LoadQueue`/`LoadingScreen` seam: 0 to 1 across the batch */
	onProgress?: AssetProgress;

	/**
	 * Rasterize vector sources (SVG, item 15) at this multiple of their intrinsic size.
	 * An SVG loaded once is a bitmap from then on, so a game that zooms in either asks for
	 * a bigger rasterization here or ships a soft texture; `2` doubles both dimensions, so
	 * the texture is crisp up to 2x zoom. Raster formats ignore it. Omit for the loader's
	 * own default, which is the SVG's intrinsic size.
	 */
	resolution?: number;
}

/** the `Assets.add` descriptor for one path, with the resolution carried through */
interface AssetDescriptor {
	alias: string;
	src: string;
	data?: { resolution: number };
}

/**
 * Loads assets by path, giving each one an alias equal to its path.
 *
 * Load everything a scene needs before creating it; afterwards `texture()` is synchronous,
 * so game code never has to await in the middle of building a scene. Pass `onProgress` alone
 * (the original signature) or a `LoadAssetsOptions` object for the resolution option.
 */
export async function load(paths: string[], options: AssetProgress | LoadAssetsOptions = {}): Promise<void> {
	const { onProgress, resolution } =
		typeof options === 'function' ? { onProgress: options, resolution: undefined } : options;

	const pending = paths.filter((path) => !Assets.cache.has(path));
	if (pending.length === 0) {
		onProgress?.(1);
		return;
	}

	for (const path of pending) {
		const descriptor: AssetDescriptor = { alias: path, src: resolve(path) };
		if (resolution !== undefined) descriptor.data = { resolution };
		Assets.add(descriptor);
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
