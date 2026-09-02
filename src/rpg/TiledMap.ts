import { TileMap, EMPTY, tileFrame } from '../render/TileMap.ts';
import { SpriteSheet } from '../render/SpriteSheet.ts';

/**
 * The subset of Tiled's JSON export this loader reads: embedded or external tilesets,
 * and uncompressed tile-layer data, in any of orthogonal, isometric or staggered
 * orientation - `TileMap`'s own `shape` option is what actually draws the difference,
 * this only has to pick the right one. Base64/compressed layer data and Tiled's
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
	tilesets: Array<{ firstgid: number; source?: string }>;
	layers: TiledLayer[];
}

/**
 * The fields of Tiled's tileset JSON (a `.tsx` exported to JSON) that the
 * multi-tileset workflow reads: the caller loads each external tileset the map
 * references, cuts its image to a sheet with its own tile size, and passes the
 * sheets to `loadTiledMap` alongside their `firstgid`s.
 *
 * Tilesets with a margin or spacing between tiles are not supported -
 * `SpriteSheet.grid` cuts a plain grid, with no gaps.
 */
export interface TiledTilesetData {
	tilewidth: number;
	tileheight: number;
	image: string;
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

const SHAPE_BY_ORIENTATION: Record<string, 'square' | 'isometric' | 'staggered'> = {
	orthogonal: 'square',
	isometric: 'isometric',
	staggered: 'staggered',
};

/** one grid of cells draws every sheet, so all of them must be cut to the map's tile size */
function checkTileSize(sheet: SpriteSheet, data: TiledMapData, firstgid: number): void {
	if (sheet.frameWidth !== data.tilewidth || sheet.frameHeight !== data.tileheight) {
		throw new Error(
			`the tileset at firstgid ${firstgid} is cut to ${sheet.frameWidth}x${sheet.frameHeight}, but the map is ${data.tilewidth}x${data.tileheight}`
		);
	}
}

/** Tiled's own rule: a gid belongs to the tileset with the greatest firstgid at or below it */
function ownerOf(gid: number, owners: number[], layerName: string): number {
	let owner = -1;
	for (let i = 0; i < owners.length; i++) {
		if (owners[i] <= gid) owner = i;
		else break;
	}
	if (owner === -1) {
		throw new Error(`layer "${layerName}" uses gid ${gid}, below every tileset's firstgid (${owners.join(', ')})`);
	}
	return owner;
}

export interface LoadedTiledMap {
	map: TileMap;
	/** every objectgroup layer's objects, in tile coordinates rather than pixels */
	objects: Array<TiledObject & { tileX: number; tileY: number }>;
}

/**
 * One tileset's sheet, tagged with the `firstgid` the map gives it, so sheets
 * can be passed in any order - they are matched to the map's tilesets, not to
 * positions in an array.
 */
export interface TilesetSheet {
	firstgid: number;
	sheet: SpriteSheet;
}

/**
 * Builds a `TileMap` from parsed Tiled JSON and sprite sheets already cut to tile size.
 *
 * A single sheet keeps the old behaviour: the map must have exactly one tileset, and
 * cells hold plain frame indices (`gid - firstgid`). Several sheets - one per tileset,
 * embedded or external - load a map mixing tilesets: each gid is owned by the tileset
 * with the greatest `firstgid` at or below it (Tiled's own rule), and cells hold
 * `tileFrame` packs naming the owning sheet. Every sheet must be cut to the map's own
 * tile size, since one grid of cells draws them all.
 *
 * Resolving an external tileset stays the caller's job - the map only names its
 * `source`, and fetching it is asset loading, which this pure parser never does:
 *
 * ```ts
 * const map = Resources.get('maps/village.json');
 * const sheets: TilesetSheet[] = map.tilesets.map((ref) => {
 * 	if (ref.source === undefined) {
 * 		return { firstgid: ref.firstgid, sheet: SpriteSheet.grid('tiles/ground.png', map.tilewidth, map.tileheight) };
 * 	}
 * 	const tileset: TiledTilesetData = Resources.get(ref.source);
 * 	return { firstgid: ref.firstgid, sheet: SpriteSheet.grid(tileset.image, tileset.tilewidth, tileset.tileheight) };
 * });
 * loadTiledMap(map, sheets);
 * ```
 */
export function loadTiledMap(data: TiledMapData, sheets: SpriteSheet | TilesetSheet[]): LoadedTiledMap {
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
	if (data.tilesets.length === 0) {
		throw new Error('loadTiledMap needs at least one tileset, this map has none');
	}

	//one sheet is the old single-tileset path; several are matched to tilesets by firstgid
	const ordered = [...data.tilesets].sort((a, b) => a.firstgid - b.firstgid);
	let mapSheets: SpriteSheet[];
	let owners: number[];
	if (sheets instanceof SpriteSheet) {
		if (data.tilesets.length !== 1) {
			throw new Error(
				`loadTiledMap was given one sheet but this map has ${data.tilesets.length} tilesets - pass one sheet per tileset`
			);
		}
		checkTileSize(sheets, data, ordered[0].firstgid);
		mapSheets = [sheets];
		owners = [ordered[0].firstgid];
	} else {
		if (sheets.length !== data.tilesets.length) {
			throw new Error(
				`loadTiledMap was given ${sheets.length} sheets but this map has ${data.tilesets.length} tilesets - pass one sheet per tileset`
			);
		}
		mapSheets = ordered.map((ref) => {
			const found = sheets.find((s) => s.firstgid === ref.firstgid);
			if (!found) throw new Error(`loadTiledMap was given no sheet for the tileset at firstgid ${ref.firstgid}`);
			checkTileSize(found.sheet, data, ref.firstgid);
			return found.sheet;
		});
		owners = ordered.map((ref) => ref.firstgid);
	}

	const map = new TileMap({ width: data.width, height: data.height, sheet: mapSheets, shape });
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
				if (raw === 0) return EMPTY;
				const owner = ownerOf(raw, owners, layer.name);
				return owners.length === 1 ? raw - owners[0] : tileFrame(owner, raw - owners[owner]);
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
