import { TileMap, EMPTY } from '../render/TileMap.ts';
import type { SpriteSheet } from '../render/SpriteSheet.ts';

/**
 * The subset of Tiled's JSON export this loader reads: a single embedded tileset, an
 * orthogonal grid, and uncompressed tile-layer data. That covers a map authored by hand in
 * Tiled for one game's own tileset, which is most of them. Multiple tilesets,
 * base64/compressed layer data, and the other orientations Tiled supports (isometric, hex)
 * are on the roadmap rather than read here yet - each throws a clear error naming what was
 * found, rather than silently loading something wrong.
 *
 * Load the JSON itself with `mwg/assets`'s `Resources.get`, same as any other JSON asset;
 * this function only does the parsing.
 */
export interface TiledMapData {
	width: number;
	height: number;
	tilewidth: number;
	tileheight: number;
	orientation?: string;
	tilesets: Array<{ firstgid: number }>;
	layers: TiledLayer[];
}

export interface TiledLayer {
	type: string;
	name: string;
	data?: number[];
	encoding?: string;
	objects?: TiledObject[];
}

export interface TiledObject {
	id: number;
	name?: string;
	type?: string;
	x: number;
	y: number;
	gid?: number;
	properties?: Array<{ name: string; value: unknown }>;
}

/** the flip/rotation flags Tiled packs into the top bits of a tile layer's gid */
const GID_FLAG_MASK = 0x1fffffff;

export interface LoadedTiledMap {
	map: TileMap;
	/** every objectgroup layer's objects, in tile coordinates rather than pixels */
	objects: Array<TiledObject & { tileX: number; tileY: number }>;
}

/**
 * Builds a `TileMap` from parsed Tiled JSON and a sprite sheet already cut to the tileset's
 * frame size - `SpriteSheet.grid(path, data.tilewidth, data.tileheight)` is the usual way to
 * get one, since the tileset image is loaded and cut like any other asset.
 */
export function loadTiledMap(data: TiledMapData, sheet: SpriteSheet): LoadedTiledMap {
	if ((data.orientation ?? 'orthogonal') !== 'orthogonal') {
		throw new Error(`loadTiledMap only reads orthogonal maps right now, this one is "${data.orientation}"`);
	}
	if (data.tilesets.length !== 1) {
		throw new Error(`loadTiledMap only reads a single tileset right now, this map has ${data.tilesets.length}`);
	}

	const firstgid = data.tilesets[0].firstgid;
	const map = new TileMap({ width: data.width, height: data.height, sheet });
	const objects: LoadedTiledMap['objects'] = [];

	for (const layer of data.layers) {
		if (layer.type === 'tilelayer') {
			if (layer.encoding && layer.encoding !== 'csv') {
				throw new Error(
					`layer "${layer.name}" uses "${layer.encoding}" encoding - export tile layers as CSV/plain, not compressed`
				);
			}

			const frames = (layer.data ?? []).map((gid) => {
				const raw = gid & GID_FLAG_MASK;
				return raw === 0 ? EMPTY : raw - firstgid;
			});
			map.addLayer(layer.name, frames);
		} else if (layer.type === 'objectgroup') {
			for (const object of layer.objects ?? []) {
				objects.push({
					...object,
					tileX: Math.floor(object.x / data.tilewidth),
					tileY: Math.floor(object.y / data.tileheight),
				});
			}
		}
	}

	return { map, objects };
}
