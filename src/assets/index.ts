/**
 * The `file://` story, in two halves.
 *
 * `paths.ts` resolves an asset path against the compiled `data:` URI map (or the dev server)
 * and needs no renderer at all; `loader.ts` fetches and decodes through Pixi. This barrel
 * exposes both, so `import { load, resolve } from '@datamoc/mw_games/assets'` is unchanged -
 * but a game rendering through something else imports `@datamoc/mw_games/assets/paths`
 * instead and pays nothing for Pixi.
 */

export { setBase, isCompiled, paths, has, resolve } from './paths.ts';
export type { AssetProgress } from './paths.ts';

export { load, texture, get, isLoaded, release } from './loader.ts';

export { AssetStream } from './Streaming.ts';
export type { AssetBundle, AssetStreamOptions } from './Streaming.ts';
export { fetchWithByteProgress } from './ByteProgress.ts';
export type { ByteProgress, OnByteProgress } from './ByteProgress.ts';
