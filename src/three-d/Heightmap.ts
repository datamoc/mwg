import { CreateGroundFromHeightMap } from '@babylonjs/core/Meshes/Builders/groundBuilder.pure.js';
import type { GroundMesh } from '@babylonjs/core/Meshes/groundMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';

/**
 * Already-decoded pixel bytes, top-left origin, row-major, 4 bytes (RGBA) per pixel - a
 * canvas `getImageData().data` is exactly this shape.
 */
export interface HeightmapSource {
	data: Uint8Array;
	width: number;
	height: number;
}

export interface HeightmapTerrain3DOptions {
	/** world-space size along X; defaults to 10 */
	width?: number;
	/** world-space size along Z; defaults to 10 */
	depth?: number;
	/** vertices per side; defaults to one per source pixel along the shorter dimension */
	subdivisions?: number;
	minHeight?: number;
	maxHeight?: number;
}

/**
 * Builds a continuous mesh displaced by a greyscale heightmap - a different technique from
 * `createTileGrid3D`'s discrete, per-cell elevation columns, for a game wanting rolling
 * ground instead of stepped blocks.
 *
 * Takes already-decoded pixel bytes rather than a URL Babylon would fetch and decode
 * itself, the same shape `parseVox` already takes raw bytes rather than a path: decoding an
 * image is `mwg/assets`'/a game's own job (a loaded texture read back through a canvas, or
 * any other decoder), keeping this module - like every other loader in `mwg/3d` - ignorant
 * of where its bytes came from and safe to call from `file://` without touching the network
 * itself.
 */
export function createHeightmapTerrain3D(scene: Scene, source: HeightmapSource, options: HeightmapTerrain3DOptions = {}): GroundMesh {
	if (!(source.width > 0) || !(source.height > 0)) throw new Error('heightmap source needs positive dimensions');
	if (source.data.length < source.width * source.height * 4) {
		throw new Error('heightmap source data is smaller than width * height * 4 (RGBA)');
	}

	return CreateGroundFromHeightMap(
		'heightmap-terrain',
		{ data: source.data, width: source.width, height: source.height },
		{
			width: options.width ?? 10,
			height: options.depth ?? 10,
			subdivisions: options.subdivisions ?? Math.max(1, Math.min(source.width, source.height) - 1),
			minHeight: options.minHeight ?? 0,
			maxHeight: options.maxHeight ?? 1,
			updatable: false,
		},
		scene
	);
}
