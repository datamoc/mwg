/**
 * Where a game's assets come from, as pure path arithmetic.
 *
 * In a built game, `tools/compile-resources` has already turned every asset into a `data:`
 * URI inside a script that runs before the game does. `resolve` then hands back that URI
 * instead of a path, which is what lets the page work from `file://`: see the tool for
 * why plain files next to the page do not.
 *
 * During development there is no compiled bundle, so paths are used as they are and the
 * dev server serves them. Game code says `load('tiles.png')` either way.
 *
 * Kept separate from `loader.ts` because none of this needs a renderer. Resolving a path is
 * string-and-map work; only actually fetching and decoding an asset needs Pixi's loader. That
 * split is what lets `mwg/3d` resolve a `.glb` path through the same compiled-asset map every
 * 2D game uses while handing the fetch to Babylon, without a Babylon-only game importing
 * Pixi at all - which it did, transitively, purely because these two halves shared a file.
 *
 * @example
 * ```ts
 * import { setBase, isCompiled, paths, resolve } from '@datamoc/mwg/assets/paths';
 *
 * setBase('assets/'); // dev-server mode; a compiled build ignores this
 *
 * if (isCompiled()) console.log('every compiled path:', paths());
 * const url = resolve('tiles.png'); // a data: URI in a compiled build, 'assets/tiles.png' in dev
 * ```
 */

declare global {
	interface Window {
		__MWG_ASSETS__?: Record<string, string>;
	}
}

/** the base for dev-mode paths, when assets are served rather than compiled in */
let base = '';

/** points dev-mode lookups at the folder assets are served from */
export function setBase(path: string): void {
	base = path.endsWith('/') || path === '' ? path : path + '/';
}

/**
 * Bytes a host holds in memory: a Blob, or raw bytes with the MIME type they carry. `load()`
 * turns one into a `blob:` URL, and the type travels with the Blob, so the browser and the
 * texture loader both learn the format from it.
 */
export type AssetBytes = Blob | { bytes: Uint8Array; type: string };

/**
 * A path's value in an asset map: a finished URL, typed bytes, or a function that produces
 * typed bytes when `load()` asks for them (so a packed archive can decode one file at a time).
 */
export type AssetValue = string | AssetBytes | (() => AssetBytes | Promise<AssetBytes>);

/** a `blob:` URL minted for a typed value, with the MIME type its bytes declared */
export interface MintedUrl {
	src: string;
	type: string | undefined;
}

/** a path-to-URI map handed in directly, taking priority over `window.__MWG_ASSETS__` */
let assetMap: Record<string, AssetValue> | undefined;

/** the `blob:` URLs minted so far, by path, so each value is read once */
const mintedUrls = new Map<string, MintedUrl>();

/** a mint in progress, so two loads of one path share one read of its value */
const mintingUrls = new Map<string, Promise<MintedUrl>>();

/**
 * Hands `resolve`/`has`/`paths` a game's own path-to-URI map, in place of
 * `tools/compile-resources`'s `window.__MWG_ASSETS__` convention.
 *
 * A game bundled by its own tool (Vite, say) that compiles its assets into `data:` URIs a
 * different way still wants `resolve`'s single lookup and `isCompiled`'s dev/build branch,
 * without also adopting `window.__MWG_ASSETS__` as the wire format. Passing the map here
 * makes this file agnostic to *how* the map was built, only to its shape - `{ path: uri }`,
 * the same shape `window.__MWG_ASSETS__` already is. `undefined` reverts to reading
 * `window.__MWG_ASSETS__` (or dev-server mode, if that is unset too).
 *
 * A value is one of three things:
 * - a finished URL (`data:` or `blob:`), which works everywhere a path does, `resolve` included;
 * - typed bytes: a Blob, or `{ bytes, type }`, which `load()` turns into a `blob:` URL and
 *   gives the MIME type to the texture loader, so the host need not know the format rules;
 * - a function returning typed bytes (or a promise of them), read once when `load()` first asks,
 *   so a packed archive can decode one file at a time with no base64 copy.
 *
 * Bytes are only readable through `load()`: `resolve` is synchronous and throws for them until
 * the path has been loaded, naming `load()` as the fix. A key missing from the map throws too,
 * so a host whose `Proxy.get` returns nothing for a path gets a loud error, not a silent skip.
 * `setAssetMap` revokes the URLs it minted for the old map; `release` revokes one path's.
 *
 * @example
 * ```ts
 * import { setAssetMap, isCompiled, resolve } from '@datamoc/mwg/assets/paths';
 *
 * setAssetMap({ 'tiles.png': 'data:image/png;base64,...' });
 * console.log(isCompiled()); // true
 * console.log(resolve('tiles.png')); // the data: URI handed in above
 *
 * setAssetMap(undefined); // back to window.__MWG_ASSETS__ / dev-server mode
 * ```
 */
export function setAssetMap(map: Record<string, AssetValue> | undefined): void {
	for (const path of mintedUrls.keys()) forgetAssetUrl(path);
	assetMap = map;
}

function compiled(): Record<string, AssetValue> | undefined {
	if (assetMap) return assetMap;
	return typeof window === 'undefined' ? undefined : window.__MWG_ASSETS__;
}

/** true when running against a compiled bundle rather than a dev server */
export function isCompiled(): boolean {
	return compiled() !== undefined;
}

export function paths(): string[] {
	return Object.keys(compiled() ?? {});
}

export function has(path: string): boolean {
	const map = compiled();
	return map ? path in map : true;
}

/** an asset path resolved to something the browser can actually load */
export function resolve(path: string): string {
	//already a loadable URL (a synthesized tone, a canvas blob): nothing to look up
	if (/^(data|blob):/.test(path)) return path;
	const map = compiled();
	if (!map) return base + path;

	const found = map[path];
	if (found === undefined) {
		throw new Error(
			`asset "${path}" is not in this build - check it is under the folder passed to compile-resources`,
		);
	}
	if (typeof found === 'string') return found;
	const minted = mintedUrls.get(path);
	if (minted) return minted.src;
	throw new Error(`asset "${path}" holds bytes that only load() can read - call load(['${path}']) first`);
}

/**
 * Reads a path's value and mints a `blob:` URL for it: the one step `load()` has to await. A
 * finished-URL value comes back as it is, with no type; typed bytes keep the MIME type they
 * were given. The result is cached per path until `forgetAssetUrl` or `setAssetMap`.
 */
export function mint(path: string): Promise<MintedUrl> {
	const minted = mintedUrls.get(path);
	if (minted) return Promise.resolve(minted);
	const inFlight = mintingUrls.get(path);
	if (inFlight) return inFlight;
	const map = compiled();
	const value = map?.[path];
	if (map === undefined || value === undefined || typeof value === 'string') {
		return Promise.resolve({ src: resolve(path), type: undefined });
	}
	const minting = (async (): Promise<MintedUrl> => {
		const bytes = typeof value === 'function' ? await value() : value;
		const blob = bytes instanceof Blob ? bytes : new Blob([bytes.bytes as BlobPart], { type: bytes.type });
		const result = { src: URL.createObjectURL(blob), type: blob.type || undefined };
		mintedUrls.set(path, result);
		return result;
	})();
	mintingUrls.set(path, minting);
	return minting.finally(() => mintingUrls.delete(path));
}

/**
 * Revokes the `blob:` URL `mint` made for a path so its bytes can be freed. A later `load()` of
 * the path mints a fresh URL; a path never minted is skipped.
 */
export function forgetAssetUrl(path: string): void {
	const minted = mintedUrls.get(path);
	if (!minted) return;
	URL.revokeObjectURL(minted.src);
	mintedUrls.delete(path);
}

/**
 * 0 (started) to 1 (complete) - a count of assets finished, not a byte count. Pixi's own
 * loaders do not expose bytes transferred across every asset type uniformly, so this reports
 * what is actually available rather than a byte figure it cannot back with a real number.
 *
 * Lives here rather than with the loader so `Streaming.ts` can name it without either file
 * importing the other's module barrel, which is what made these two a cycle before.
 */
export type AssetProgress = (fraction: number) => void;
