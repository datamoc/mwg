import { TileMap, EMPTY } from '../render/TileMap.ts';
import type { SpriteSheet } from '../render/SpriteSheet.ts';

/**
 * The subset of Tiled's JSON export this loader reads: a single embedded tileset, and
 * uncompressed tile-layer data, in any of orthogonal, isometric or staggered orientation -
 * `TileMap`'s own `shape` option is what actually draws the difference, this only has to
 * pick the right one. Multiple tilesets, base64/compressed layer data, and Tiled's
 * hexagonal orientation (a different offset/axial convention than `mwg`'s own flat-top
 * scheme - see `mwg/core`'s `Hex.ts`) are still on the roadmap rather than read here yet -
 * each throws a clear error naming what was found, rather than silently loading something
 * wrong.
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
	/** staggered maps only - which axis alternates, and whether the odd or even one shifts */
	staggeraxis?: string;
	staggerindex?: string;
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
const SHAPE_BY_ORIENTATION: Record<string, 'square' | 'isometric' | 'staggered'> = {
	orthogonal: 'square',
	isometric: 'isometric',
	staggered: 'staggered',
};

export function loadTiledMap(data: TiledMapData, sheet: SpriteSheet): LoadedTiledMap {
	const orientation = data.orientation ?? 'orthogonal';
	const shape = SHAPE_BY_ORIENTATION[orientation];
	if (!shape) {
		throw new Error(`loadTiledMap does not read "${orientation}" maps yet`);
	}
	if (shape === 'staggered' && (data.staggeraxis ?? 'y') !== 'y') {
		throw new Error(`loadTiledMap only reads Y-axis staggered maps right now, this one is staggered on "${data.staggeraxis}"`);
	}
	if (shape === 'staggered' && (data.staggerindex ?? 'odd') !== 'odd') {
		throw new Error(
			`loadTiledMap only reads odd-index staggered maps right now, this one staggers "${data.staggerindex}"`
		);
	}
	if (data.tilesets.length !== 1) {
		throw new Error(`loadTiledMap only reads a single tileset right now, this map has ${data.tilesets.length}`);
	}

	const firstgid = data.tilesets[0].firstgid;
	const map = new TileMap({ width: data.width, height: data.height, sheet, shape });
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
