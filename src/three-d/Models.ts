import '@babylonjs/loaders/glTF/index.js';
import { ImportMeshAsync, LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import type { ImportMeshOptions, ISceneLoaderAsyncResult, LoadAssetContainerOptions } from '@babylonjs/core/Loading/sceneLoader.js';
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import type { Scene } from '@babylonjs/core/scene.js';

import { resolve } from '../assets/paths.ts';

export type ModelSource3D = string | File | ArrayBufferView;

function resolveSource(source: ModelSource3D): ModelSource3D {
	return typeof source === 'string' && !/^(?:data|blob|https?):/i.test(source) ? resolve(source) : source;
}

/**
 * Loads glTF/GLB from an asset path, data/blob/http(s) URI, File, or in-memory byte view. An
 * asset path is resolved through `mwg/assets` first, the same way every other loader in the
 * framework becomes `file://`-safe once assets are compiled to `data:` URIs; a URI that is
 * already resolved is passed through unchanged.
 *
 * For a single copy of a model this is the whole job; for several copies of the *same*
 * model, `loadModelContainer3D` fetches and parses once and instantiates independent copies
 * from it - calling this a second time for the same source imports and parses it again.
 */
export function loadModel3D(source: ModelSource3D, scene: Scene, options?: ImportMeshOptions): Promise<ISceneLoaderAsyncResult> {
	return ImportMeshAsync(resolveSource(source), scene, options);
}

const containerCache = new Map<string, Promise<AssetContainer>>();

/**
 * Loads a model once per resolved source and caches the in-flight/loaded `AssetContainer`,
 * so a second call for the same source returns the same container instead of importing and
 * parsing it again over the network. A container is not itself scene content - call
 * `container.instantiateModelsToScene()` for each independent copy a game wants to place,
 * which is Babylon's own way to get several unaliased instances of one loaded model without
 * a second fetch; `loadModel3D` imports straight into the scene instead, for the common case
 * of only ever wanting one copy.
 *
 * Only caches when `source` is a string (an asset path or already-resolved URI) - a `File`
 * or in-memory byte view has no stable identity to key a cache on, so those always load
 * fresh, the same way `loadModel3D` never tries to resolve them as a path either.
 *
 * @example
 * ```ts
 * import { loadModelContainer3D, isModelContainerLoaded, releaseModelContainer } from '@datamoc/mw_games/3d/models';
 *
 * declare const scene: import('@babylonjs/core/scene.js').Scene;
 *
 * const container = await loadModelContainer3D('models/tree.glb', scene);
 * const treeA = container.instantiateModelsToScene();
 * const treeB = container.instantiateModelsToScene(); // a second, independent copy - no re-fetch
 *
 * console.log(isModelContainerLoaded('models/tree.glb')); // true
 * releaseModelContainer('models/tree.glb'); // frees the container once every copy is placed
 * ```
 */
export function loadModelContainer3D(source: ModelSource3D, scene: Scene, options?: LoadAssetContainerOptions): Promise<AssetContainer> {
	const resolved = resolveSource(source);
	if (typeof resolved !== 'string') return LoadAssetContainerAsync(resolved, scene, options);

	const cached = containerCache.get(resolved);
	if (cached) return cached;

	const promise = LoadAssetContainerAsync(resolved, scene, options);
	containerCache.set(resolved, promise);
	//a rejected load must not poison the cache - the next call gets a fresh attempt
	promise.catch(() => containerCache.delete(resolved));
	return promise;
}

/** true once `loadModelContainer3D` has resolved for this source and it has not since been `releaseModelContainer`d */
export function isModelContainerLoaded(source: string): boolean {
	const resolved = resolveSource(source);
	return typeof resolved === 'string' && containerCache.has(resolved);
}

/** disposes and forgets a cached container; a source never loaded (or already released) is silently skipped */
export async function releaseModelContainer(source: string): Promise<void> {
	const resolved = resolveSource(source);
	if (typeof resolved !== 'string') return;

	const cached = containerCache.get(resolved);
	if (!cached) return;
	containerCache.delete(resolved);
	(await cached).dispose();
}
