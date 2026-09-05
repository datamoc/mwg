import { Assets, Texture } from 'pixi.js';

/**
 * Where a game's assets come from.
 *
 * In a built game, `tools/compile-resources` has already turned every asset into a `data:`
 * URI inside a script that runs before the game does. `resolve` then hands Pixi that URI
 * instead of a path, which is what lets the page work from `file://`: see the tool for
 * why plain files next to the page do not.
 *
 * During development there is no compiled bundle, so paths are used as they are and the
 * dev server serves them. Game code says `load('tiles.png')` either way.
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

function compiled(): Record<string, string> | undefined {
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
	const map = compiled();
	if (!map) return base + path;

	const found = map[path];
	if (found === undefined) {
		throw new Error(
			`asset "${path}" is not in this build - check it is under the folder passed to compile-resources`
		);
	}
	return found;
}

/**
 * 0 (started) to 1 (complete) - a count of assets finished, not a byte count. Pixi's own
 * loaders do not expose bytes transferred across every asset type uniformly, so this reports
 * what is actually available rather than a byte figure it cannot back with a real number.
 */
export type AssetProgress = (fraction: number) => void;

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

export { AssetStream } from './Streaming.ts';
export type { AssetBundle, AssetStreamOptions } from './Streaming.ts';
