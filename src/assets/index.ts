/**
 * The `file://` story, split by how renderer-specific each piece is.
 *
 * `paths.ts` resolves an asset path against the compiled `data:` URI map (or the dev server)
 * and needs no renderer at all; `binary.ts` caches raw bytes the same renderer-free way, for
 * anything (`three-d`'s VOX loader, most directly) that wants an `ArrayBuffer` rather than a
 * decoded texture; `loader.ts` fetches and decodes textures through Pixi specifically. This
 * barrel exposes all three, so `import { load, resolve } from '@datamoc/mw_games/assets'` is
 * unchanged - but a game rendering through something else imports
 * `@datamoc/mw_games/assets/paths` or `@datamoc/mw_games/assets/binary` instead and pays
 * nothing for Pixi.
 */

export { setBase, isCompiled, paths, has, resolve } from './paths.ts';
export type { AssetProgress } from './paths.ts';

export { load, texture, get, isLoaded, release } from './loader.ts';

export { loadBinary, getBinary, isBinaryLoaded, releaseBinary } from './binary.ts';
export type { LoadBinaryOptions } from './binary.ts';

export { AssetStream } from './Streaming.ts';
export type { AssetBundle, AssetStreamOptions } from './Streaming.ts';
export { fetchWithByteProgress } from './ByteProgress.ts';
export type { ByteProgress, OnByteProgress } from './ByteProgress.ts';
