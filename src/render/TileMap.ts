import { Container, Graphics } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { TintedSprite } from './TintedSprite.ts';
import type { SpriteSheet } from './SpriteSheet.ts';
import type { Camera } from './Camera.ts';
import { hexToPixel, pixelToHex } from '../core/Hex.ts';

/** the frame value meaning "nothing here"; a cell holding it gets no sprite at all */
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

/** the sheet half of a `tileFrame` pack, or 0 for a plain frame index */
export function tileFrameSheet(packed: number): number {
	return packed >>> 20;
}

/** the frame half of a `tileFrame` pack, or the value itself for a plain index */
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

interface Layer {
	name: string;
	data: Int32Array;
	sprites: Array<TintedSprite | null>;
	container: Container;
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
		if (this.layersByName.has(name)) throw new Error(`this map already has a layer named "${name}"`);

		const cells = this.widthInTiles * this.heightInTiles;
		if (data && data.length !== cells) {
			throw new Error(`layer "${name}" has ${data.length} cells, but the map has ${cells}`);
		}

		const container = new Container();
		const chunkContainers: Container[] = [];
		for (let i = 0; i < this.chunkColumns * this.chunkRows; i++) {
			const chunk = new Container();
			chunkContainers.push(chunk);
			container.addChild(chunk);
		}

		const layer: Layer = {
			name,
			data: data ? Int32Array.from(data) : new Int32Array(cells).fill(EMPTY),
			sprites: new Array(cells).fill(null),
			container,
		};

		this.layers.push(layer);
		this.layersByName.set(name, layer);
		this.chunks.push(chunkContainers);
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

	private buildSprite(layer: Layer, x: number, y: number, frame: number): TintedSprite {
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

	setTile(layer: string | number, x: number, y: number, frame: number): void {
		if (!this.inside(x, y)) return;

		const target = this.layerAt(layer);
		const cell = this.index(x, y);
		if (target.data[cell] === frame) return;

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
			const sprite = layer.sprites[cell];
			if (sprite) {
				sprite.tint = tint;
				sprite.colorAdd = add;
			}
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
		this.cellHeight[cell] = height;

		const lift = height * this.heightStep;
		for (const layer of this.layers) {
			const sprite = layer.sprites[cell];
			if (sprite) sprite.y = this.cellOrigin(x, y).y - lift;
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
			const top = this.layers[0].sprites[cell];
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
			face
				.poly([
					ox, oy + halfH - top,
					ox + halfW, oy + halfH * 2 - top,
					ox + halfW, oy + halfH * 2 - bottom,
					ox, oy + halfH - bottom,
				])
				.fill(LEFT_FACE_FILL);
			face
				.poly([
					ox + halfW, oy + halfH * 2 - top,
					ox + halfW * 2, oy + halfH - top,
					ox + halfW * 2, oy + halfH - bottom,
					ox + halfW, oy + halfH * 2 - bottom,
				])
				.fill(RIGHT_FACE_FILL);
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
