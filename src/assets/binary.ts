import { resolve, type AssetProgress } from './paths.ts';

/**
 * Raw asset bytes, cached and progress-reported the same way `loader.ts`'s texture cache is -
 * but renderer-free, so a Babylon-only game (or anything else that just wants an
 * `ArrayBuffer`) gets the same `load`/`isLoaded`/`release` shape a 2D game's textures already
 * have, without pulling Pixi in. `Vox.parseVox` is the direct beneficiary: it takes an
 * `ArrayBuffer` a game previously had to fetch and cache by hand.
 *
 * Kept out of `loader.ts` itself for the same reason `paths.ts` is its own file: `loader.ts`
 * is allowed to know about Pixi, `three-d` is allowed to know about Babylon, but neither
 * should have to import the other's renderer just to share a byte cache.
 *
 * @example
 * ```ts
 * import { loadBinary, getBinary } from '@datamoc/mw_games/assets';
 * import { parseVox, createVoxModel3D } from '@datamoc/mw_games/3d';
 *
 * await loadBinary(['models/rock.vox']);
 * const model = parseVox(getBinary('models/rock.vox'));
 * ```
 */

export interface LoadBinaryOptions {
	/** overrides the fetch used to load bytes; defaults to `globalThis.fetch` */
	fetch?: typeof globalThis.fetch;
}

const cache = new Map<string, ArrayBuffer>();

/** Loads and caches raw bytes for every path not already cached; a path already loaded is a no-op. */
export async function loadBinary(paths: string[], onProgress?: AssetProgress, options: LoadBinaryOptions = {}): Promise<void> {
	const doFetch = options.fetch ?? globalThis.fetch;
	if (!doFetch) throw new Error('fetch is unavailable; provide LoadBinaryOptions.fetch');

	const pending = paths.filter((path) => !cache.has(path));
	if (pending.length === 0) {
		onProgress?.(1);
		return;
	}

	let done = 0;
	await Promise.all(
		pending.map(async (path) => {
			const response = await doFetch(resolve(path));
			if (!response.ok) throw new Error(`failed to load binary asset "${path}": ${response.status}`);
			cache.set(path, await response.arrayBuffer());
			done++;
			onProgress?.(done / pending.length);
		})
	);
}

/** a loaded asset's raw bytes, by the same path it was loaded with */
export function getBinary(path: string): ArrayBuffer {
	const data = cache.get(path);
	if (!data) throw new Error(`binary asset "${path}" has not been loaded - pass it to loadBinary() first`);
	return data;
}

/**
 * true once `loadBinary` has resolved for this path and it has not since been `releaseBinary`d
 *
 * @example
 * ```ts
 * import { isBinaryLoaded } from '@datamoc/mw_games/assets';
 *
 * console.log(isBinaryLoaded('models/rock.vox')); // false until loadBinary resolves for it
 * ```
 */
export function isBinaryLoaded(path: string): boolean {
	return cache.has(path);
}

/**
 * Frees cached bytes; a path never loaded (or already released) is silently skipped.
 *
 * @example
 * ```ts
 * import { releaseBinary } from '@datamoc/mw_games/assets';
 *
 * releaseBinary(['models/rock.vox']); // frees the cached bytes once the model is placed
 * ```
 */
export function releaseBinary(paths: string[]): void {
	for (const path of paths) cache.delete(path);
}
