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
 * Loads assets by path, giving each one an alias equal to its path.
 *
 * Load everything a scene needs before creating it; afterwards `texture()` is synchronous,
 * so game code never has to await in the middle of building a scene.
 */
export async function load(paths: string[]): Promise<void> {
	const pending = paths.filter((path) => !Assets.cache.has(path));
	if (pending.length === 0) return;

	for (const path of pending) {
		Assets.add({ alias: path, src: resolve(path) });
	}
	await Assets.load(pending);
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
