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
 * import { setBase, isCompiled, paths, resolve } from '@datamoc/mw_games/assets/paths';
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
			`asset "${path}" is not in this build - check it is under the folder passed to compile-resources`,
		);
	}
	return found;
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
