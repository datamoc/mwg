import { Rectangle, Texture } from 'pixi.js';
import * as Resources from '../../assets/index.ts';
import { rectOf, type TextureRegion, type Texture2D } from './Types2D.ts';

/**
 * A texture cut into numbered frames.
 *
 * Nearly every sheet in a tile-based game is a regular grid, so `grid` covers the common
 * case and `name` labels the frames that matter. Frames are cut once and cached: asking
 * for the same index twice returns the same Texture, so sprites sharing a frame also share
 * a texture and stay in one batch.
 *
 * The rest are not grids at all: a hand-packed icon atlas, a strip of bar segments, a
 * nine-patch's corners. Those declare their own rectangles with `rect`, and the sheet is
 * built with no frame size, which leaves it with no grid and only the frames declared.
 */
export class SpriteSheet {
	readonly texture: Texture2D;
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly columns: number;
	readonly rows: number;

	private frames = new Map<number, Texture>();
	private names = new Map<string, number>();

	private constructor(texture: Texture2D, frameWidth: number, frameHeight: number) {
		this.texture = texture;
		this.frameWidth = frameWidth;
		this.frameHeight = frameHeight;
		this.columns = frameWidth > 0 ? Math.floor(texture.width / frameWidth) : 0;
		this.rows = frameHeight > 0 ? Math.floor(texture.height / frameHeight) : 0;
	}

	/**
	 * Cuts a loaded texture into a grid, numbered left to right then top to bottom, or, with
	 * no frame size, leaves the sheet with no grid for `rect` to fill in.
	 *
	 * @param path the asset path the texture was loaded with
	 */
	static grid(path: string, frameWidth = 0, frameHeight = frameWidth): SpriteSheet {
		return new SpriteSheet(Resources.texture(path), frameWidth, frameHeight);
	}

	static fromTexture(texture: Texture2D, frameWidth = 0, frameHeight = frameWidth): SpriteSheet {
		return new SpriteSheet(texture, frameWidth, frameHeight);
	}

	get count(): number {
		return this.columns * this.rows;
	}

	/** gives a frame a name, so game code reads `sheet.get('door')` rather than `sheet.get(6)` */
	name(name: string, index: number): this {
		this.names.set(name, index);
		return this;
	}

	/** names several frames at once, from a plain object of name to index */
	nameAll(names: Readonly<Record<string, number>>): this {
		for (const [key, index] of Object.entries(names)) this.names.set(key, index);
		return this;
	}

	indexOf(name: string): number {
		const index = this.names.get(name);
		if (index === undefined) throw new Error(`this sheet has no frame named "${name}"`);
		return index;
	}

	get(frame: number | string): Texture2D {
		const index = typeof frame === 'string' ? this.indexOf(frame) : frame;

		const cached = this.frames.get(index);
		if (cached) return cached;

		if (index < 0 || index >= this.count) {
			throw new Error(`frame ${index} is outside this sheet, which holds ${this.count}`);
		}

		const texture = new Texture({
			source: this.texture.source,
			frame: new Rectangle(
				(index % this.columns) * this.frameWidth,
				Math.floor(index / this.columns) * this.frameHeight,
				this.frameWidth,
				this.frameHeight,
			),
		});

		this.frames.set(index, texture);
		return texture;
	}

	/**
	 * Cuts an arbitrary rectangle out of the texture, for a sheet that is not a grid: one
	 * hand-packed icon, two banner frames, the corners of a nine-patch.
	 *
	 * The rectangle is cached under `index` exactly like a grid frame, so `get`, `region`,
	 * `name` and `pick` all treat it as a frame and asking for it twice returns the same
	 * `Texture` rather than cutting a second one. Declaring a rect for an index the grid
	 * also covers replaces that frame, which is what a tightened sub-rect of a cell is:
	 * an item whose art is smaller than its 16 by 16 cell keeps its index and its name.
	 */
	rect(index: number, x: number, y: number, width: number, height: number): this {
		if (width <= 0 || height <= 0) throw new Error('a sprite sheet rect needs a positive width and height');
		this.frames.set(index, new Texture({ source: this.texture.source, frame: new Rectangle(x, y, width, height) }));
		return this;
	}

	/** the texture and frame rectangle together, as plain MWG types rather than `pixi.js`'s
	 * `Texture`/`Rectangle` - for a game that needs the geometry, not just the cut texture */
	region(frame: number | string): TextureRegion {
		const texture = this.get(frame);
		return { texture, frame: rectOf(texture.frame) };
	}

	/** a run of consecutive frames, the usual way an animation is laid out */
	range(from: number, to: number): Texture2D[] {
		const out: Texture[] = [];
		for (let i = from; i <= to; i++) out.push(this.get(i));
		return out;
	}

	/** specific frames, for an animation that holds or ping-pongs */
	pick(...frames: Array<number | string>): Texture2D[] {
		return frames.map((frame) => this.get(frame));
	}
}
