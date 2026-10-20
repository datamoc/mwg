import { Assets, Texture } from 'pixi.js';
import { mint, forgetAssetUrl, type AssetProgress } from './paths.ts';

/**
 * Actually fetching and decoding assets, which is the half that needs Pixi.
 *
 * Split from `paths.ts` so path resolution stays renderer-free: a game rendering through
 * something other than Pixi (`mwg/3d` on Babylon) resolves paths through the same compiled
 * asset map and hands the fetch to its own loader, rather than importing this file at all.
 *
 * @example
 * ```ts
 * import { load, texture, isLoaded, release } from '@datamoc/mwg/assets';
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

	/**
	 * Paths a game can do without - a portrait variant, an optional decal - loaded separately
	 * from the rest of the batch so one missing file never aborts every other asset the batch
	 * was loading. A path in here that fails to load is simply left unloaded: `isLoaded` reports
	 * `false` for it and `texture`'s fallback argument (or `get`'s) is what a caller reads
	 * instead, rather than every caller writing its own try/catch around `load()`.
	 */
	optional?: readonly string[];

	/** called once per `optional` path that failed to load, with whatever `Assets.load` threw */
	onMissing?: (path: string, error: unknown) => void;
}

/**
 * `data:` URI MIME type to the format token Pixi's resolver expects - the authoritative source
 * when it is available, since a compiled asset's embedded bytes can differ from what its path's
 * extension suggests (`tools/compile-resources.mjs`'s `toWebp` option, item 350, compiles a
 * `sprite.png` path into `image/webp` bytes when that is smaller, keeping the `.png` key so
 * `load('sprite.png')` still works the same in dev and built modes).
 */
const MIME_TO_FORMAT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
};

/** the `Assets.add` descriptor for one path, with the resolution carried through */
interface AssetDescriptor {
	alias: string;
	src: string;
	data?: { resolution: number };
	/** the file format Pixi picks a parser from; set only when `src` has no extension of its own to read (a `data:` or `blob:` URL) */
	format?: string;
}

/**
 * Loads assets by path, giving each one an alias equal to its path.
 *
 * Load everything a scene needs before creating it; afterwards `texture()` is synchronous,
 * so game code never has to await in the middle of building a scene. This is also where a typed
 * or lazy asset value (see `setAssetMap`) is read, so it is the only way such a value reaches
 * `resolve`, `texture` and the rest. Pass `onProgress` alone
 * (the original signature) or a `LoadAssetsOptions` object for the resolution option.
 */
export async function load(paths: string[], options: AssetProgress | LoadAssetsOptions = {}): Promise<void> {
	const { onProgress, resolution, optional, onMissing } =
		typeof options === 'function'
			? { onProgress: options, resolution: undefined, optional: undefined, onMissing: undefined }
			: options;

	const optionalPaths = new Set(optional ?? []);
	const pending = paths.filter((path) => !Assets.cache.has(path));
	const requiredPending = pending.filter((path) => !optionalPaths.has(path));
	const optionalPending = pending.filter((path) => optionalPaths.has(path));

	const add = async (path: string): Promise<void> => {
		const { src, type } = await mint(path);
		const descriptor: AssetDescriptor = { alias: path, src };
		if (resolution !== undefined) descriptor.data = { resolution };
		//a `data:` or `blob:` URL has no extension for Pixi to read a parser from, so the format is
		//named here: from the bytes' MIME type when they have one, else from the path. The MIME wins
		//because a compiled `sprite.png` can hold WebP bytes (`toWebp`, item 350), and running the
		//PNG parser over them would be wrong. A plain dev-server path keeps its own extension.
		if (/^(data|blob):/.test(src)) {
			const mime = type ?? /^data:([^;,]+)/.exec(src)?.[1];
			const extension = (mime && MIME_TO_FORMAT[mime]) ?? /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
			if (extension) descriptor.format = extension;
		}
		Assets.add(descriptor);
	};

	if (optionalPending.length === 0 && requiredPending.length === 0) {
		onProgress?.(1);
		return;
	}

	const requiredLoad = (async () => {
		await Promise.all(requiredPending.map(add));
		if (requiredPending.length > 0) await Assets.load(requiredPending, onProgress);
	})();

	//loaded one at a time and never rejected past this function: one missing optional asset
	//must never take the required batch (or any other optional path) down with it
	const optionalLoads = optionalPending.map(async (path) => {
		await add(path);
		try {
			await Assets.load(path);
		} catch (error) {
			onMissing?.(path, error);
		}
	});

	await Promise.all([requiredLoad, ...optionalLoads]);
	if (optionalPending.length > 0 && requiredPending.length === 0) onProgress?.(1);
}

/**
 * A loaded texture, by the same path it was loaded with. `fallback` is what an `optional`
 * `load()` path was for: pass it (typically `Texture.EMPTY`) to get that back instead of a
 * throw when the path never loaded, rather than every caller writing its own `isLoaded` guard.
 */
export function texture(path: string, fallback?: Texture): Texture {
	if (!Assets.cache.has(path)) {
		if (fallback !== undefined) return fallback;
		throw new Error(`texture "${path}" has not been loaded - pass it to load() first`);
	}
	return Assets.get<Texture>(path);
}

/** a loaded asset of any other kind, such as parsed JSON; `fallback` behaves as it does on `texture` */
export function get<T>(path: string, fallback?: T): T {
	if (!Assets.cache.has(path)) {
		if (fallback !== undefined) return fallback;
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
 * never loaded (or already released) is silently skipped rather than treated as an error, and a
 * path whose typed bytes were minted into a `blob:` URL has that URL revoked here, so the bytes can be freed,
 * since a game unloading a zone it may or may not have visited shouldn't have to check first.
 */
export async function release(paths: string[]): Promise<void> {
	for (const path of paths) forgetAssetUrl(path);
	const loaded = paths.filter((path) => Assets.cache.has(path));
	if (loaded.length === 0) return;
	await Assets.unload(loaded);
}
