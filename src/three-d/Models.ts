import '@babylonjs/loaders/glTF/index.js';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import type { ImportMeshOptions, ISceneLoaderAsyncResult } from '@babylonjs/core/Loading/sceneLoader.js';
import type { Scene } from '@babylonjs/core/scene.js';

import { resolve } from '../assets/index.ts';

export type ModelSource3D = string | File | ArrayBufferView;

/**
 * Loads glTF/GLB from an asset path, data/blob/http(s) URI, File, or in-memory byte view. An
 * asset path is resolved through `mwg/assets` first, the same way every other loader in the
 * framework becomes `file://`-safe once assets are compiled to `data:` URIs; a URI that is
 * already resolved is passed through unchanged.
 */
export function loadModel3D(source: ModelSource3D, scene: Scene, options?: ImportMeshOptions): Promise<ISceneLoaderAsyncResult> {
	const resolved = typeof source === 'string' && !/^(?:data|blob|https?):/i.test(source) ? resolve(source) : source;
	return ImportMeshAsync(resolved, scene, options);
}
