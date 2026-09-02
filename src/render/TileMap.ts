import { Container } from 'pixi.js';
import { TintedSprite } from './TintedSprite.ts';
import type { SpriteSheet } from './SpriteSheet.ts';
import type { Camera } from './Camera.ts';
import { hexToPixel, pixelToHex } from '../core/Hex.ts';

/** the frame value meaning "nothing here"; a cell holding it gets no sprite at all */
export const EMPTY = -1;

export interface TileMapOptions {
	/** in tiles */
	width: number;
	height: number;

	sheet: SpriteSheet;

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
 * roof. Every layer shares one grid, so a cell's lighting applies to all of them at once —
 * which is what fog of war needs, since an unseen floor and the wall on it have to dim
 * together.
 *
 * The map is chunked and culled against the camera, so its cost tracks what is on screen
 * rather than how large the map is.
 */
export class TileMap extends Container {
	readonly widthInTiles: number;
	readonly heightInTiles: number;
	readonly tileWidth: number;
	readonly tileHeight: number;
	readonly shape: 'square' | 'hex' | 'isometric' | 'staggered';

	private sheet: SpriteSheet;
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

	constructor(options: TileMapOptions) {
		super();

		this.widthInTiles = options.width;
		this.heightInTiles = options.height;
		this.sheet = options.sheet;
		this.tileWidth = options.tileWidth ?? options.sheet.frameWidth;
		this.tileHeight = options.tileHeight ?? options.sheet.frameHeight;
		this.shape = options.shape ?? 'square';

		this.chunkSize = options.chunkSize ?? 16;
		this.chunkColumns = Math.ceil(this.widthInTiles / this.chunkSize);
		this.chunkRows = Math.ceil(this.heightInTiles / this.chunkSize);

		const cells = this.widthInTiles * this.heightInTiles;
		this.cellTint = new Uint32Array(cells).fill(0xffffff);
		this.cellAdd = new Uint32Array(cells);
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
	 * array makes an empty layer to fill in later.
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
		for (let y = 0; y < this.heightInTiles; y++) {
			for (let x = 0; x < this.widthInTiles; x++) {
				const frame = layer.data[this.index(x, y)];
				if (frame !== EMPTY) this.buildSprite(layer, x, y, frame);
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

	private buildSprite(layer: Layer, x: number, y: number, frame: number): TintedSprite {
		const sprite = new TintedSprite(this.sheet.get(frame));
		const origin = this.cellOrigin(x, y);
		sprite.x = origin.x;
		sprite.y = origin.y;

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
			existing.texture = this.sheet.get(frame);
		} else {
			this.buildSprite(target, x, y, frame);
		}
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
	 * grey rather than merely going dark.
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

	/** world point to tile coordinates */
	toTile(worldX: number, worldY: number): { x: number; y: number } {
		return this.projectedTile(worldX, worldY);
	}

	/** the centre of a tile, in world units — where a character standing on it belongs */
	tileCenter(x: number, y: number): { x: number; y: number } {
		return this.projectedCenter(x, y);
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
		const corners = [
			this.projectedTile(view.x, view.y),
			this.projectedTile(view.x + view.width, view.y),
			this.projectedTile(view.x, view.y + view.height),
			this.projectedTile(view.x + view.width, view.y + view.height),
		];
		const tileMinX = Math.min(...corners.map((c) => c.x));
		const tileMaxX = Math.max(...corners.map((c) => c.x));
		const tileMinY = Math.min(...corners.map((c) => c.y));
		const tileMaxY = Math.max(...corners.map((c) => c.y));

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
