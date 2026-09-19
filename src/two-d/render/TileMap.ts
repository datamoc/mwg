import { Container, Graphics, Rectangle, Texture } from 'pixi.js';
import { TintedSprite } from './TintedSprite.ts';
import type { SpriteSheet } from './SpriteSheet.ts';
import type { Camera } from './Camera.ts';
import { hexToPixel, pixelToHex } from '../../core/Hex.ts';
import {
	assertAutotileLayout,
	autotileCellParts,
	rpgmAutotileSlot,
	xpAutotileRef,
	RPGM_FLOOR_AUTOTILE_TABLE,
	RPGM_WALL_AUTOTILE_TABLE,
} from './RpgmAutotile.ts';
import type { AutotileCellPart, AutotileLayout, RpgmAutotileShapeTable, RpgmAutotileSlot } from './RpgmAutotile.ts';

/**
 * The frame value meaning "nothing here"; a cell holding it gets no sprite at all.
 *
 * @example
 * ```ts
 * import { EMPTY, TileMap, SpriteSheet } from '@datamoc/mw_games/two-d/render';
 *
 * declare const sheet: SpriteSheet;
 *
 * const map = new TileMap({ width: 10, height: 10, sheet });
 * map.addLayer('ground');
 * console.log(map.getTile('ground', 0, 0)); // EMPTY - nothing set there yet
 * ```
 */
export const EMPTY = -1;

/** the faces of a raised block are shaded, the way light falls on the classic block look */
const LEFT_FACE_FILL = 0x6e6e6e;
const RIGHT_FACE_FILL = 0x9a9a9a;

/**
 * Packs a (sheet, frame) pair into one cell value, for a `TileMap` built over
 * several sheets - a map whose tiles come from more than one Tiled tileset.
 *
 * Single-sheet maps never need this: a plain frame index already decodes as
 * sheet 0, so every existing call site keeps working unchanged.
 *
 * @example
 * ```ts
 * import { tileFrame, tileFrameSheet, tileFrameIndex } from '@datamoc/mw_games/two-d/render';
 *
 * const packed = tileFrame(1, 42); // frame 42 of the second sheet (index 1)
 * console.log(tileFrameSheet(packed)); // 1
 * console.log(tileFrameIndex(packed)); // 42
 * ```
 */
export function tileFrame(sheet: number, frame: number): number {
	if (!Number.isInteger(sheet) || sheet < 0 || sheet >= 1 << 12) {
		throw new Error(`tileFrame needs a sheet index from 0 to ${(1 << 12) - 1}, got ${sheet}`);
	}
	if (!Number.isInteger(frame) || frame < 0 || frame >= 1 << 20) {
		throw new Error(`tileFrame needs a frame index from 0 to ${(1 << 20) - 1}, got ${frame}`);
	}
	return (sheet << 20) | frame;
}

/**
 * The sheet half of a `tileFrame` pack, or 0 for a plain frame index.
 *
 * @example
 * ```ts
 * import { tileFrame, tileFrameSheet } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(tileFrameSheet(tileFrame(2, 5))); // 2
 * console.log(tileFrameSheet(5)); // 0 - a plain frame index reads as sheet 0
 * ```
 */
export function tileFrameSheet(packed: number): number {
	return packed >>> 20;
}

/**
 * The frame half of a `tileFrame` pack, or the value itself for a plain index.
 *
 * @example
 * ```ts
 * import { tileFrame, tileFrameIndex } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(tileFrameIndex(tileFrame(2, 5))); // 5
 * console.log(tileFrameIndex(5)); // 5 - a plain frame index passes through unchanged
 * ```
 */
export function tileFrameIndex(packed: number): number {
	return packed & ((1 << 20) - 1);
}

export interface TileMapOptions {
	/** in tiles */
	width: number;
	height: number;

	/**
	 * The sheet tiles are drawn from, or one per tileset when a map mixes
	 * several. Cells then hold `tileFrame` packs rather than plain indices -
	 * see `tileFrame`. The first sheet sets the default tile size.
	 */
	sheet: SpriteSheet | readonly SpriteSheet[];

	/** in world units; defaults to the sheet's frame size, which is the usual case */
	tileWidth?: number;
	tileHeight?: number;

	/**
	 * How a cell's grid position becomes a pixel position.
	 *
	 * `'hex'` is the one that also changes which cells are neighbours - it is the same
	 * `shape` a `Level` can be given, and the two must agree for a hex map to make sense.
	 * `'isometric'` and `'staggered'` are pixel-only: the grid underneath is still an
	 * ordinary square one (four or eight neighbours, whatever a game's `Level` already is),
	 * this only changes where each cell draws - which is the whole difference between them
	 * and hex, and why `Level` has no equivalent option for either.
	 */
	shape?: 'square' | 'hex' | 'isometric' | 'staggered';

	/**
	 * Tiles per chunk, per side.
	 *
	 * The map is cut into square chunks so that culling can switch off a whole block at
	 * once instead of testing every tile. 16 keeps chunks small enough to cull tightly
	 * and large enough that there are not many of them.
	 */
	chunkSize?: number;

	/**
	 * Pixels of lift per elevation level; defaults to half a tile, the classic
	 * isometric block proportion. A cell raised to height `h` draws its top
	 * `h` steps higher, with side faces filling the bands between.
	 */
	heightStep?: number;
}

/**
 * Which engine family an autotile sheet comes from: RPG Maker MV's A1-A4
 * quadrant sheets, or RPG Maker XP's 96 by 128 pattern templates (and 32px
 * single-tile strips).
 */
export type AutotileFormat = 'rpgm-mv' | 'rpgm-xp';

/**
 * One autotile source a layer draws from. MV sets name an A-sheet family;
 * XP sets name one autotile image. A layer takes one set, or one per family
 * slot (MV) or image index (XP), and each cell routes to the set claiming
 * its id - the same split a multi-sheet map already uses for plain layers.
 */
export interface AutotileSet {
	/** the raw source image: an MV A-sheet of 48px cells, or one XP autotile image */
	sheet: SpriteSheet;
	/** which family; MV quadrant sheets unless 'rpgm-xp' says otherwise */
	format?: AutotileFormat;
	/** MV only, required: which A-family (0-3) this sheet is */
	slot?: RpgmAutotileSlot;
	/** MV only: which shape table to sample; floor for slots 0-1, wall for 2-3 */
	mode?: 'floor' | 'wall';
	/** MV only: a custom shape table, overriding mode for non-standard sheets */
	table?: RpgmAutotileShapeTable;
	/** XP only: which autotile image this sheet is, 0-7 */
	index?: number;
	/** XP only: animation stripes in the image; counted from the sheet width when omitted */
	frames?: number;
	/** MV only: kind runs advancing together when the frame changes (water, waterfalls) */
	animation?: ReadonlyArray<ReadonlyArray<number>>;
	/** the layer's initial animation frame */
	animationFrame?: number;
}

/**
 * One autotile cell: a raw MV tile id or XP tile value. EMPTY (or any
 * value at or below zero) leaves the cell blank.
 */
export type AutotileCell = number;

interface TileLayer {
	kind: 'tiles';
	name: string;
	data: Int32Array;
	sprites: Array<TintedSprite | null>;
	container: Container;
}

interface AutotileLayer {
	kind: 'autotile';
	name: string;
	data: Int32Array;
	sprites: Array<TintedSprite[] | null>;
	container: Container;
	sets: ResolvedAutotileSet[];
	frame: number;
}

type Layer = TileLayer | AutotileLayer;

interface ResolvedAutotileSet {
	sheet: SpriteSheet;
	layout: AutotileLayout;
	cache: Map<string, { parts: AutotileCellPart[]; textures: Texture[] }>;
	claims: (tile: number) => boolean;
}

/**
 * A grid of tiles, drawn as sprites.
 *
 * Layers stack in the order they are added: a floor, then whatever stands on it, then a
 * roof. Every layer shares one grid, so a cell's lighting applies to all of them at once,
 * which is what fog of war needs, since an unseen floor and the wall on it have to dim
 * together.
 *
 * The map is chunked and culled against the camera, so its cost tracks what is on screen
 * rather than how large the map is.
 *
 * Cells can also carry an elevation (`setCellHeight`): the top tile moves up by one
 * `heightStep` per level, and on the diamond projections (isometric, staggered) each
 * level grows two shaded side faces, the classic raised-block look. `tileCenter`
 * rides along, so whoever stands on the cell stands on top of it.
 *
 * @example
 * ```ts
 * import { TileMap, EMPTY, SpriteSheet, createCamera } from '@datamoc/mw_games/two-d/render';
 *
 * const sheet = SpriteSheet.grid('tiles/ground.png', 16);
 *
 * const map = new TileMap({ width: 20, height: 20, sheet });
 * map.addLayer('ground', new Array(400).fill(0)); // frame 0 everywhere
 * map.addLayer('objects'); // an empty layer, filled in with setTile later
 *
 * map.setTile('objects', 3, 3, 5);
 * console.log(map.getTile('objects', 3, 3)); // 5
 * console.log(map.getTile('objects', 0, 0)); // EMPTY - never set
 *
 * map.setCellColor(3, 3, 0x888888); // half-lit, remembered-but-not-visible fog of war
 *
 * const camera = createCamera();
 * map.cull(camera); // once per frame, switches off chunks the camera cannot see
 * ```
 *
 * `TileMap` is a `Container` of layer `Container`s of `TintedSprite` tiles, not a sprite
 * itself: setting `map.alpha` still fades the whole map, since Pixi composes a container's
 * alpha into every descendant's when rendering. There is no per-cell alpha alongside
 * `setCellColor`'s tint/add - a see-through *tile* (as opposed to a translucent creature
 * standing on one, which is `TintedSprite`'s own case) is not something any reference game
 * has asked for yet.
 */
export class TileMap extends Container {
	readonly widthInTiles: number;
	readonly heightInTiles: number;
	readonly tileWidth: number;
	readonly tileHeight: number;
	readonly shape: 'square' | 'hex' | 'isometric' | 'staggered';

	/** pixels of lift per elevation level */
	readonly heightStep: number;

	private sheets: SpriteSheet[];
	private layers: Layer[] = [];
	private layersByName = new Map<string, Layer>();

	private chunkSize: number;
	private chunkColumns: number;
	private chunkRows: number;
	//one container per chunk per layer, so culling toggles a single flag per chunk
	private chunks: Container[][] = [];

	//per cell, applied to every layer's sprite there
	private cellTint: Uint32Array;
	private cellAdd: Uint32Array;

	//per cell elevation, in whole levels; the side faces of raised diamond cells
	private cellHeight: Int32Array;
	private faces: Array<Graphics | null>;

	constructor(options: TileMapOptions) {
		super();

		this.widthInTiles = options.width;
		this.heightInTiles = options.height;
		this.sheets = Array.isArray(options.sheet) ? [...options.sheet] : [options.sheet];
		if (this.sheets.length === 0) throw new Error('a TileMap needs at least one sheet');
		this.tileWidth = options.tileWidth ?? this.sheets[0].frameWidth;
		this.tileHeight = options.tileHeight ?? this.sheets[0].frameHeight;
		this.shape = options.shape ?? 'square';
		this.heightStep = options.heightStep ?? this.tileHeight / 2;
		if (!(this.heightStep > 0)) {
			throw new Error(`a TileMap's heightStep must be a positive number, got ${options.heightStep}`);
		}

		this.chunkSize = options.chunkSize ?? 16;
		this.chunkColumns = Math.ceil(this.widthInTiles / this.chunkSize);
		this.chunkRows = Math.ceil(this.heightInTiles / this.chunkSize);

		const cells = this.widthInTiles * this.heightInTiles;
		this.cellTint = new Uint32Array(cells).fill(0xffffff);
		this.cellAdd = new Uint32Array(cells);
		this.cellHeight = new Int32Array(cells);
		this.faces = new Array(cells).fill(null);
	}

	get layerCount(): number {
		return this.layers.length;
	}

	/** world size, for setting camera bounds */
	get worldWidth(): number {
		switch (this.shape) {
			case 'square':
				return this.widthInTiles * this.tileWidth;
			case 'hex':
				//columns overlap three-quarters of a tile each; the last column still needs
				//its full width past where the previous one started
				return this.widthInTiles <= 0 ? 0 : (this.widthInTiles - 1) * this.tileWidth * 0.75 + this.tileWidth;
			case 'isometric':
				//a diamond spanning every row and column, at their combined width
				return (this.widthInTiles + this.heightInTiles) * (this.tileWidth / 2);
			case 'staggered':
				//every other row is pushed half a tile right, so the map is that much wider
				return this.widthInTiles * this.tileWidth + this.tileWidth / 2;
		}
	}

	get worldHeight(): number {
		switch (this.shape) {
			case 'square':
				return this.heightInTiles * this.tileHeight;
			case 'hex':
				//odd columns sit half a tile lower, so the map is that much taller than the
				//rows alone
				return this.heightInTiles * this.tileHeight + this.tileHeight / 2;
			case 'isometric':
				return (this.widthInTiles + this.heightInTiles) * (this.tileHeight / 2);
			case 'staggered':
				//rows are packed at half height, staggered brick-fashion
				return this.heightInTiles * (this.tileHeight / 2) + this.tileHeight / 2;
		}
	}

	inside(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.widthInTiles && y < this.heightInTiles;
	}

	private index(x: number, y: number): number {
		return y * this.widthInTiles + x;
	}

	/**
	 * Adds a layer on top of the existing ones.
	 *
	 * @param data one frame index per cell, row-major, `EMPTY` for a blank cell. A missing
	 * array makes an empty layer to fill in later. On a multi-sheet map the values are
	 * `tileFrame` packs rather than plain indices.
	 */
	addLayer(name: string, data?: ArrayLike<number>): this {
		const { cells, container, chunks } = this.beginLayer(name, data?.length);

		const layer: TileLayer = {
			kind: 'tiles',
			name,
			data: data ? Int32Array.from(data) : new Int32Array(cells).fill(EMPTY),
			sprites: new Array(cells).fill(null),
			container,
		};

		this.layers.push(layer);
		this.layersByName.set(name, layer);
		this.chunks.push(chunks);
		this.addChild(container);

		//sprites are built after registration so setTile can find the layer
		const isBottom = this.layers.length === 1;
		for (let y = 0; y < this.heightInTiles; y++) {
			for (let x = 0; x < this.widthInTiles; x++) {
				const frame = layer.data[this.index(x, y)];
				if (frame !== EMPTY) this.buildSprite(layer, x, y, frame);
				//faces belong to the block, which the bottom layer defines; upper
				//layers ride the same lift through buildSprite but draw no faces
				if (isBottom) this.syncFaces(x, y);
			}
		}

		return this;
	}

	private beginLayer(
		name: string,
		length: number | undefined,
	): { cells: number; container: Container; chunks: Container[] } {
		if (this.layersByName.has(name)) throw new Error(`this map already has a layer named "${name}"`);

		const cells = this.widthInTiles * this.heightInTiles;
		if (length !== undefined && length !== cells) {
			throw new Error(`layer "${name}" has ${length} cells, but the map has ${cells}`);
		}

		const container = new Container();
		const chunks: Container[] = [];
		for (let i = 0; i < this.chunkColumns * this.chunkRows; i++) {
			const chunk = new Container();
			chunks.push(chunk);
			container.addChild(chunk);
		}
		return { cells, container, chunks };
	}

	/**
	 * Adds an autotile layer on top of the existing ones: each non-blank cell
	 * holds a raw MV tile id or XP tile value, and the map assembles that
	 * cell's quadrant halves straight from the source sheet - no prebuilt
	 * atlas canvas in between. Cells route to the set claiming their id, so
	 * one layer can span every A-sheet (or every autotile image) the same way
	 * one plain layer can span several sheets.
	 *
	 * @param cells one raw id per cell, row-major; EMPTY (or at/below zero)
	 * for a blank cell. Every other value must fall in one of the sets'
	 * ranges, or the call throws naming it.
	 * @param set one source, or one per family slot (MV) or image index (XP).
	 *
	 * @example
	 * ```ts
	 * import { TileMap, SpriteSheet, type AutotileSet } from '@datamoc/mw_games/two-d/render';
	 *
	 * declare const sheet: SpriteSheet; // a raw MV A1 sheet: 48px cells, slot 0
	 *
	 * const map = new TileMap({ width: 4, height: 4, sheet });
	 * const sea: AutotileSet = { sheet, slot: 0, animation: [[0, 1, 2]] };
	 * map.addAutotileLayer('sea', new Array(16).fill(2048), sea);
	 * map.setAutotileFrame('sea', 1);
	 * console.log(map.getAutotileFrame('sea')); // 1
	 * console.log(map.getTile('sea', 0, 0)); // 2048 - raw MV ids, EMPTY where blank
	 * ```
	 */
	addAutotileLayer(name: string, cells: ArrayLike<number>, set: AutotileSet | readonly AutotileSet[]): this {
		const entries = Array.isArray(set) ? set : [set];
		if (entries.length === 0) throw new Error(`autotile layer "${name}" needs at least one set`);
		const { cells: total, container, chunks } = this.beginLayer(name, cells.length);

		const sets = entries.map((entry, position) => this.resolveAutotileSet(name, entry, position));
		const claimed = new Set<string>();
		for (const resolved of sets) {
			const key =
				resolved.layout.format === 'rpgm-mv'
					? `slot ${resolved.layout.slot}`
					: `autotile ${resolved.layout.index}`;
			if (claimed.has(key)) throw new Error(`autotile layer "${name}" has two sets for ${key}`);
			claimed.add(key);
		}
		let frame = 0;
		entries.forEach((entry, position) => {
			const initial = entry.animationFrame ?? 0;
			if (!Number.isInteger(initial) || initial < 0) {
				throw new Error(
					`autotile layer "${name}" set ${position} starts at an invalid animation frame, got ${entry.animationFrame}`,
				);
			}
			if (position === 0) frame = initial;
			else if (initial !== frame) {
				throw new Error(
					`autotile layer "${name}" sets disagree on their initial animation frame (${frame} vs ${initial})`,
				);
			}
		});

		const data = Int32Array.from(cells);
		for (let cell = 0; cell < total; cell++) {
			if (data[cell] > 0) this.claimAutotileSets(sets, name, data[cell]);
		}

		const layer: AutotileLayer = {
			kind: 'autotile',
			name,
			data,
			sprites: new Array(total).fill(null),
			container,
			sets,
			frame,
		};
		this.layers.push(layer);
		this.layersByName.set(name, layer);
		this.chunks.push(chunks);
		this.addChild(container);

		//sprites are built after registration so the claim above stays the only check
		const isBottom = this.layers.length === 1;
		for (let y = 0; y < this.heightInTiles; y++) {
			for (let x = 0; x < this.widthInTiles; x++) {
				const at = this.index(x, y);
				const tile = data[at];
				if (tile <= 0) continue;
				layer.sprites[at] = this.makeAutotileSprites(
					layer,
					this.claimAutotileSets(sets, name, tile),
					x,
					y,
					tile,
				);
				if (isBottom) this.syncFaces(x, y);
			}
		}

		return this;
	}

	/**
	 * Advances an autotile layer's animation frame: every animated cell
	 * re-points its quadrant textures (MV kind cycles, XP frame stripes)
	 * while cells outside any cycle stay on frame zero's art. A repeated
	 * frame is a no-op.
	 */
	setAutotileFrame(layer: string | number, frame: number): void {
		const target = this.layerAt(layer);
		if (target.kind !== 'autotile') throw new Error(`layer "${target.name}" is not an autotile layer`);
		if (!Number.isInteger(frame) || frame < 0) {
			throw new Error(`an autotile animation frame must be an integer at or above zero, got ${frame}`);
		}
		if (target.frame === frame) return;
		target.frame = frame;

		for (let y = 0; y < this.heightInTiles; y++) {
			for (let x = 0; x < this.widthInTiles; x++) {
				const cell = this.index(x, y);
				const tile = target.data[cell];
				if (tile <= 0) continue;
				const set = this.claimAutotileSets(target.sets, target.name, tile);
				const pieces = this.autotilePieces(set, tile, frame);
				const sprites = target.sprites[cell];
				if (!sprites) continue;
				for (let i = 0; i < sprites.length; i++) sprites[i].texture = pieces.textures[i];
			}
		}
	}

	/** the animation frame an autotile layer currently shows */
	getAutotileFrame(layer: string | number): number {
		const target = this.layerAt(layer);
		if (target.kind !== 'autotile') throw new Error(`layer "${target.name}" is not an autotile layer`);
		return target.frame;
	}

	private resolveAutotileSet(layerName: string, entry: AutotileSet, position: number): ResolvedAutotileSet {
		const where = `autotile layer "${layerName}" set ${position}`;
		if (!entry || !entry.sheet) throw new Error(`${where} needs a source sheet`);
		const format = entry.format ?? 'rpgm-mv';
		if (format !== 'rpgm-mv' && format !== 'rpgm-xp')
			throw new Error(`${where} has an unknown format "${entry.format}"`);
		if (format === 'rpgm-mv') return this.resolveRpgmSet(where, entry);
		return this.resolveXpSet(where, entry);
	}

	private resolveRpgmSet(where: string, entry: AutotileSet): ResolvedAutotileSet {
		if (entry.slot === undefined) throw new Error(`${where} needs a slot (0-3) for its MV sheet`);
		if (entry.mode !== undefined && entry.mode !== 'floor' && entry.mode !== 'wall') {
			throw new Error(`${where} has an unknown mode "${entry.mode}"`);
		}
		if (entry.animation !== undefined && !Array.isArray(entry.animation)) {
			throw new Error(`${where} animation must list kind runs, got ${typeof entry.animation}`);
		}
		const mode = entry.mode ?? (entry.slot < 2 ? 'floor' : 'wall');
		const layout: AutotileLayout = {
			format: 'rpgm-mv',
			slot: entry.slot,
			table: entry.table ?? (mode === 'floor' ? RPGM_FLOOR_AUTOTILE_TABLE : RPGM_WALL_AUTOTILE_TABLE),
			cycles: entry.animation ?? [],
		};
		assertAutotileLayout(layout);
		return {
			sheet: entry.sheet,
			layout,
			cache: new Map(),
			claims: (tile) => rpgmAutotileSlot(tile) === entry.slot,
		};
	}

	private resolveXpSet(where: string, entry: AutotileSet): ResolvedAutotileSet {
		const index = entry.index ?? 0;
		const texture = entry.sheet.texture;
		//a 32px-tall strip holds whole animated tiles rather than a quadrant
		//template; anything else must be the 128px template (the 192px
		//expanded-corner variant stays game-side, unsupported here)
		const single = texture.height === 32;
		if (texture.height !== 32 && texture.height !== 128) {
			throw new Error(
				`${where} is ${texture.height}px tall - XP autotile images are 128px templates or 32px single-tile strips`,
			);
		}
		const stripe = single ? 32 : 96;
		const frames = entry.frames ?? Math.max(1, Math.floor(texture.width / stripe));
		const layout: AutotileLayout = { format: 'rpgm-xp', index, frames, single };
		assertAutotileLayout(layout);
		if (frames > Math.floor(texture.width / stripe)) {
			throw new Error(
				`${where} asks for ${frames} frames but its sheet fits ${Math.floor(texture.width / stripe)}`,
			);
		}
		return {
			sheet: entry.sheet,
			layout,
			cache: new Map(),
			claims: (tile) => {
				const ref = xpAutotileRef(tile);
				return ref !== null && ref.index === index;
			},
		};
	}

	private claimAutotileSets(sets: ResolvedAutotileSet[], layerName: string, tile: number): ResolvedAutotileSet {
		for (const set of sets) {
			if (set.claims(tile)) return set;
		}
		throw new Error(`tile ${tile} in autotile layer "${layerName}" matches none of its sets`);
	}

	private autotilePieces(
		set: ResolvedAutotileSet,
		tile: number,
		frame: number,
	): { parts: AutotileCellPart[]; textures: Texture[] } {
		const key = `${tile}:${frame}`;
		const cached = set.cache.get(key);
		if (cached) return cached;
		//tile > 0 is established by every caller, so these parts exist
		const parts = autotileCellParts(set.layout, tile, frame)!;
		const textures = parts.map(
			(part) =>
				new Texture({
					source: set.sheet.texture.source,
					frame: new Rectangle(part.sourceX, part.sourceY, part.sourceWidth, part.sourceHeight),
				}),
		);
		const pieces = { parts, textures };
		set.cache.set(key, pieces);
		return pieces;
	}

	private makeAutotileSprites(
		layer: AutotileLayer,
		set: ResolvedAutotileSet,
		x: number,
		y: number,
		tile: number,
	): TintedSprite[] {
		const cell = this.index(x, y);
		const pieces = this.autotilePieces(set, tile, layer.frame);
		const origin = this.cellOrigin(x, y);
		const lift = this.cellHeight[cell] * this.heightStep;
		const made = pieces.textures.map((texture, i) => {
			const part = pieces.parts[i];
			const sprite = new TintedSprite(texture);
			sprite.x = origin.x + part.destX * this.tileWidth;
			sprite.y = origin.y - lift + part.destY * this.tileHeight;
			sprite.scale.set(
				(part.destWidth * this.tileWidth) / part.sourceWidth,
				(part.destHeight * this.tileHeight) / part.sourceHeight,
			);
			sprite.tint = this.cellTint[cell];
			sprite.colorAdd = this.cellAdd[cell];
			return sprite;
		});
		const chunk = this.chunks[this.layers.indexOf(layer)][this.chunkIndex(x, y)];
		for (const sprite of made) chunk.addChild(sprite);
		return made;
	}

	private setAutotileCell(layer: AutotileLayer, x: number, y: number, tile: number): void {
		const cell = this.index(x, y);
		layer.data[cell] = tile;

		const existing = layer.sprites[cell];
		if (tile <= 0) {
			if (existing) for (const sprite of existing) sprite.destroy();
			layer.sprites[cell] = null;
			return;
		}
		const set = this.claimAutotileSets(layer.sets, layer.name, tile);
		const pieces = this.autotilePieces(set, tile, layer.frame);
		if (existing && existing.length === pieces.textures.length) {
			for (let i = 0; i < existing.length; i++) existing[i].texture = pieces.textures[i];
			return;
		}
		if (existing) for (const sprite of existing) sprite.destroy();
		layer.sprites[cell] = this.makeAutotileSprites(layer, set, x, y, tile);
	}

	private eachCellSprite(layer: Layer, cell: number, apply: (sprite: TintedSprite) => void): void {
		const entry = layer.sprites[cell];
		if (!entry) return;
		if (Array.isArray(entry)) {
			for (const sprite of entry) apply(sprite);
		} else {
			apply(entry);
		}
	}

	private firstCellSprite(layer: Layer, cell: number): TintedSprite | null {
		const entry = layer.sprites[cell];
		if (!entry) return null;
		return Array.isArray(entry) ? entry[0] : entry;
	}

	private layerAt(layer: string | number): Layer {
		const found = typeof layer === 'number' ? this.layers[layer] : this.layersByName.get(layer);
		if (!found) throw new Error(`no such layer: ${layer}`);
		return found;
	}

	private chunkIndex(x: number, y: number): number {
		return Math.floor(y / this.chunkSize) * this.chunkColumns + Math.floor(x / this.chunkSize);
	}

	/** the centre of a cell's tile, before the projections below settle on a shared contract */
	private projectedCenter(x: number, y: number): { x: number; y: number } {
		switch (this.shape) {
			case 'square':
				return { x: (x + 0.5) * this.tileWidth, y: (y + 0.5) * this.tileHeight };
			case 'hex':
				return hexToPixel(x, y, this.tileWidth, this.tileHeight);
			case 'isometric':
				//the whole diamond is shifted right by the tallest possible row offset, so
				//every tile lands at a non-negative pixel position
				return {
					x: (x - y + (this.heightInTiles - 1)) * (this.tileWidth / 2) + this.tileWidth / 2,
					y: (x + y) * (this.tileHeight / 2) + this.tileHeight / 2,
				};
			case 'staggered':
				//every other row (by convention, the odd ones) is pushed half a tile right;
				//rows are packed at half height so alternating rows still tile seamlessly
				return {
					x: x * this.tileWidth + (y & 1) * (this.tileWidth / 2) + this.tileWidth / 2,
					y: y * (this.tileHeight / 2) + this.tileHeight / 2,
				};
		}
	}

	/** the cell under a pixel position - the inverse of `projectedCenter` */
	private projectedTile(px: number, py: number): { x: number; y: number } {
		switch (this.shape) {
			case 'square':
				return { x: Math.floor(px / this.tileWidth), y: Math.floor(py / this.tileHeight) };
			case 'hex':
				return pixelToHex(px, py, this.tileWidth, this.tileHeight);
			case 'isometric': {
				const rx = (px - this.tileWidth / 2) / (this.tileWidth / 2) - (this.heightInTiles - 1);
				const ry = (py - this.tileHeight / 2) / (this.tileHeight / 2);
				return { x: Math.round((rx + ry) / 2), y: Math.round((ry - rx) / 2) };
			}
			case 'staggered': {
				const y = Math.round((py - this.tileHeight / 2) / (this.tileHeight / 2));
				const x = Math.round((px - this.tileWidth / 2 - (y & 1) * (this.tileWidth / 2)) / this.tileWidth);
				return { x, y };
			}
		}
	}

	/** top-left corner of a cell, in world units - where a sprite anchored at (0,0) belongs */
	private cellOrigin(x: number, y: number): { x: number; y: number } {
		const center = this.projectedCenter(x, y);
		return { x: center.x - this.tileWidth / 2, y: center.y - this.tileHeight / 2 };
	}

	/** resolves a cell value to a texture: plain indices read sheet 0, packs read their sheet */
	private textureFor(frame: number): Texture {
		const sheet = tileFrameSheet(frame);
		if (sheet >= this.sheets.length) {
			throw new Error(`frame ${frame} names sheet ${sheet}, but this map has ${this.sheets.length}`);
		}
		return this.sheets[sheet].get(tileFrameIndex(frame));
	}

	private buildSprite(layer: TileLayer, x: number, y: number, frame: number): TintedSprite {
		const sprite = new TintedSprite(this.textureFor(frame));
		const origin = this.cellOrigin(x, y);
		sprite.x = origin.x;
		//raised cells draw their top higher; the bands between are the faces below
		sprite.y = origin.y - this.cellHeight[this.index(x, y)] * this.heightStep;

		const cell = this.index(x, y);
		sprite.tint = this.cellTint[cell];
		sprite.colorAdd = this.cellAdd[cell];

		layer.sprites[cell] = sprite;
		this.chunks[this.layers.indexOf(layer)][this.chunkIndex(x, y)].addChild(sprite);

		return sprite;
	}

	getTile(layer: string | number, x: number, y: number): number {
		if (!this.inside(x, y)) return EMPTY;
		return this.layerAt(layer).data[this.index(x, y)];
	}

	/**
	 * Replaces one cell. On an autotile layer the value is a raw autotile id
	 * rather than a frame index; EMPTY (or any value at or below zero)
	 * clears the cell there too.
	 */
	setTile(layer: string | number, x: number, y: number, frame: number): void {
		if (!this.inside(x, y)) return;

		const target = this.layerAt(layer);
		const cell = this.index(x, y);
		if (target.data[cell] === frame) return;

		if (target.kind === 'autotile') {
			this.setAutotileCell(target, x, y, frame);
		} else {
			target.data[cell] = frame;

			const existing = target.sprites[cell];
			if (frame === EMPTY) {
				existing?.destroy();
				target.sprites[cell] = null;
			} else if (existing) {
				existing.texture = this.textureFor(frame);
			} else {
				this.buildSprite(target, x, y, frame);
			}
		}

		//faces follow the bottom layer: no tile there, no block to side
		if (this.layers[0] === target) this.syncFaces(x, y);
	}

	/** fills a whole layer at once, which is what loading a map does */
	setLayerData(layer: string | number, data: ArrayLike<number>): void {
		//resolved once up front so a bad layer name fails before half the map is rewritten
		this.layerAt(layer);

		for (let y = 0; y < this.heightInTiles; y++) {
			for (let x = 0; x < this.widthInTiles; x++) {
				this.setTile(layer, x, y, data[this.index(x, y)] ?? EMPTY);
			}
		}
	}

	/**
	 * Colours one cell across every layer.
	 *
	 * This is the fog-of-war and lighting hook. `tint` multiplies, so it darkens; `add` is
	 * the additive term, which is what lets an unseen-but-remembered tile wash out towards
	 * grey rather than merely going dark. Side faces take the tint but not the add -
	 * plain geometry has no batcher of its own to carry it.
	 */
	setCellColor(x: number, y: number, tint: number, add = 0): void {
		if (!this.inside(x, y)) return;

		const cell = this.index(x, y);
		if (this.cellTint[cell] === tint && this.cellAdd[cell] === add) return;

		this.cellTint[cell] = tint;
		this.cellAdd[cell] = add;

		for (const layer of this.layers) {
			this.eachCellSprite(layer, cell, (sprite) => {
				sprite.tint = tint;
				sprite.colorAdd = add;
			});
		}
		const face = this.faces[cell];
		if (face) face.tint = tint;
	}

	getCellTint(x: number, y: number): number {
		return this.inside(x, y) ? this.cellTint[this.index(x, y)] : 0;
	}

	/** resets every cell to undimmed */
	clearColors(): void {
		for (let y = 0; y < this.heightInTiles; y++) {
			for (let x = 0; x < this.widthInTiles; x++) this.setCellColor(x, y, 0xffffff, 0);
		}
	}

	/**
	 * Raises or lowers one cell, in whole levels.
	 *
	 * Every layer's top tile moves up by one `heightStep` per level, and on the
	 * diamond projections a raised cell grows two shaded side faces per level -
	 * the left and right walls of the block, drawn into the bottom layer's chunk
	 * behind the cell's own top, so rows in front still overlap correctly. Square
	 * and hex cells lift without faces. A cell with no bottom-layer tile grows no
	 * faces: nothing to be the side of. Negative heights sink the top with no
	 * faces - pits are a hole, not an inverted block.
	 *
	 * The usual source is an `Elevation`: `map.setCellHeight(x, y,
	 * elevation.heightAt(x, y))` over every cell, after the layers are added.
	 */
	setCellHeight(x: number, y: number, height: number): void {
		if (!this.inside(x, y)) return;
		if (!Number.isInteger(height)) {
			throw new Error(`a cell's height must be a whole number, got ${height}`);
		}

		const cell = this.index(x, y);
		if (this.cellHeight[cell] === height) return;
		//a delta keeps each sprite's own offset inside its cell, so the four
		//quadrant halves of an autotile ride up together with plain tiles
		const rise = (height - this.cellHeight[cell]) * this.heightStep;
		this.cellHeight[cell] = height;

		for (const layer of this.layers) {
			this.eachCellSprite(layer, cell, (sprite) => {
				sprite.y -= rise;
			});
		}
		this.syncFaces(x, y);
	}

	/** the elevation of a cell in whole levels; off the map reads as ground */
	getCellHeight(x: number, y: number): number {
		return this.inside(x, y) ? this.cellHeight[this.index(x, y)] : 0;
	}

	/** how many cells currently draw side faces, for a debug overlay */
	get faceCount(): number {
		return this.faces.filter((face) => face !== null).length;
	}

	/** rebuilds or removes one cell's faces to match its height and bottom tile */
	private syncFaces(x: number, y: number): void {
		if (this.layers.length === 0) return;

		const cell = this.index(x, y);
		const want =
			(this.shape === 'isometric' || this.shape === 'staggered') &&
			this.cellHeight[cell] > 0 &&
			this.layers[0].data[cell] !== EMPTY;

		const have = this.faces[cell];
		if (!want) {
			if (have) {
				have.destroy();
				this.faces[cell] = null;
			}
			return;
		}

		const face = have ?? new Graphics();
		this.drawFaces(face, x, y);
		face.tint = this.cellTint[cell];
		if (!have) {
			this.faces[cell] = face;
			//behind the cell's own top, after everything drawn above it on screen
			const chunk = this.chunks[0][this.chunkIndex(x, y)];
			const top = this.firstCellSprite(this.layers[0], cell);
			if (top) chunk.addChildAt(face, chunk.getChildIndex(top));
			else chunk.addChild(face);
		}
	}

	/**
	 * Draws one raised block: per level, a left and a right rhombus band stacking
	 * from the base diamond up to the lifted top. Band `k` spans the step between
	 * `(k-1) * heightStep` and `k * heightStep` above the base, so the bands tile
	 * the whole side exactly, whatever the step is.
	 */
	private drawFaces(face: Graphics, x: number, y: number): void {
		const origin = this.cellOrigin(x, y);
		const ox = origin.x;
		const oy = origin.y;
		const halfW = this.tileWidth / 2;
		const halfH = this.tileHeight / 2;
		const step = this.heightStep;
		const height = this.cellHeight[this.index(x, y)];

		face.clear();
		for (let k = 1; k <= height; k++) {
			const top = k * step;
			const bottom = (k - 1) * step;
			face.poly([
				ox,
				oy + halfH - top,
				ox + halfW,
				oy + halfH * 2 - top,
				ox + halfW,
				oy + halfH * 2 - bottom,
				ox,
				oy + halfH - bottom,
			]).fill(LEFT_FACE_FILL);
			face.poly([
				ox + halfW,
				oy + halfH * 2 - top,
				ox + halfW * 2,
				oy + halfH - top,
				ox + halfW * 2,
				oy + halfH - bottom,
				ox + halfW,
				oy + halfH * 2 - bottom,
			]).fill(RIGHT_FACE_FILL);
		}
	}

	/** world point to tile coordinates */
	toTile(worldX: number, worldY: number): { x: number; y: number } {
		//the base grid, not the lifted tops: a raised tile overlaps its neighbours
		//on screen, and unpicking which one a point meant needs the heights, which
		//this deliberately does not consult - games with raised clickable cells
		//adjust the point by the known height first
		return this.projectedTile(worldX, worldY);
	}

	/**
	 * The centre of a tile, in world units: where a character standing on it belongs.
	 *
	 * Rides the cell's elevation: a raised cell reports its lifted top, so whoever
	 * is placed there stands on the block rather than inside it.
	 */
	tileCenter(x: number, y: number): { x: number; y: number } {
		const center = this.projectedCenter(x, y);
		center.y -= this.getCellHeight(x, y) * this.heightStep;
		return center;
	}

	/**
	 * Switches off chunks the camera cannot see.
	 *
	 * Call it once per frame. Culling by chunk rather than by tile is the point: a 200x200
	 * map is 40 000 tiles but only 169 chunks, so the test runs a couple of hundred times
	 * instead of forty thousand.
	 */
	cull(camera: Camera): void {
		const view = camera.view;

		//the screen's four corners, mapped into tile space through whichever projection this
		//map uses. A projection is affine, so a rectangle's image (or preimage) is a
		//parallelogram, and the axis-aligned box around those four points always fully
		//contains it - the same reasoning works unchanged for square, hex, isometric or
		//staggered, so nothing here needs to know which one it is
		//scalar min/max over the four corners by hand, rather than an array + .map() + spread,
		//since this runs once per frame
		const topLeft = this.projectedTile(view.x, view.y);
		const topRight = this.projectedTile(view.x + view.width, view.y);
		const bottomLeft = this.projectedTile(view.x, view.y + view.height);
		const bottomRight = this.projectedTile(view.x + view.width, view.y + view.height);

		const tileMinX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
		const tileMaxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
		const tileMinY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
		const tileMaxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);

		//a one-chunk margin, so a chunk is switched on slightly before it is needed
		const minChunkX = Math.floor(tileMinX / this.chunkSize) - 1;
		const maxChunkX = Math.floor(tileMaxX / this.chunkSize) + 1;
		const minChunkY = Math.floor(tileMinY / this.chunkSize) - 1;
		const maxChunkY = Math.floor(tileMaxY / this.chunkSize) + 1;

		for (let cy = 0; cy < this.chunkRows; cy++) {
			const rowVisible = cy >= minChunkY && cy <= maxChunkY;
			for (let cx = 0; cx < this.chunkColumns; cx++) {
				const visible = rowVisible && cx >= minChunkX && cx <= maxChunkX;
				const index = cy * this.chunkColumns + cx;
				for (const layerChunks of this.chunks) {
					layerChunks[index].renderable = visible;
				}
			}
		}
	}

	/** how many chunks are currently drawn, for a debug overlay */
	get visibleChunks(): number {
		if (this.chunks.length === 0) return 0;
		return this.chunks[0].filter((chunk) => chunk.renderable).length;
	}
}
