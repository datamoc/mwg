import { Container } from 'pixi.js';
import { TintedSprite } from './TintedSprite.ts';
import type { SpriteSheet } from './SpriteSheet.ts';
import type { Camera } from './Camera.ts';

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
		return this.widthInTiles * this.tileWidth;
	}

	get worldHeight(): number {
		return this.heightInTiles * this.tileHeight;
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

	private buildSprite(layer: Layer, x: number, y: number, frame: number): TintedSprite {
		const sprite = new TintedSprite(this.sheet.get(frame));
		sprite.x = x * this.tileWidth;
		sprite.y = y * this.tileHeight;

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
		return { x: Math.floor(worldX / this.tileWidth), y: Math.floor(worldY / this.tileHeight) };
	}

	/** the centre of a tile, in world units — where a character standing on it belongs */
	tileCenter(x: number, y: number): { x: number; y: number } {
		return { x: (x + 0.5) * this.tileWidth, y: (y + 0.5) * this.tileHeight };
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

		//a one-chunk margin, so a chunk is switched on slightly before it is needed
		const minChunkX = Math.floor(view.x / this.tileWidth / this.chunkSize) - 1;
		const maxChunkX = Math.floor((view.x + view.width) / this.tileWidth / this.chunkSize) + 1;
		const minChunkY = Math.floor(view.y / this.tileHeight / this.chunkSize) - 1;
		const maxChunkY = Math.floor((view.y + view.height) / this.tileHeight / this.chunkSize) + 1;

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
