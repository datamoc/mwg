import { Rectangle, Texture } from 'pixi.js';
import * as Resources from '../assets/index.ts';

/**
 * A texture cut into numbered frames.
 *
 * Nearly every sheet in a tile-based game is a regular grid, so `grid` covers the common
 * case and `name` labels the frames that matter. Frames are cut once and cached: asking
 * for the same index twice returns the same Texture, so sprites sharing a frame also share
 * a texture and stay in one batch.
 */
export class SpriteSheet {
	readonly texture: Texture;
	readonly frameWidth: number;
	readonly frameHeight: number;
	readonly columns: number;
	readonly rows: number;

	private frames = new Map<number, Texture>();
	private names = new Map<string, number>();

	private constructor(texture: Texture, frameWidth: number, frameHeight: number) {
		this.texture = texture;
		this.frameWidth = frameWidth;
		this.frameHeight = frameHeight;
		this.columns = Math.floor(texture.width / frameWidth);
		this.rows = Math.floor(texture.height / frameHeight);
	}

	/**
	 * Cuts a loaded texture into a grid, numbered left to right then top to bottom.
	 *
	 * @param path the asset path the texture was loaded with
	 */
	static grid(path: string, frameWidth: number, frameHeight = frameWidth): SpriteSheet {
		return new SpriteSheet(Resources.texture(path), frameWidth, frameHeight);
	}

	static fromTexture(texture: Texture, frameWidth: number, frameHeight = frameWidth): SpriteSheet {
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

	get(frame: number | string): Texture {
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
				this.frameHeight
			),
		});

		this.frames.set(index, texture);
		return texture;
	}

	/** a run of consecutive frames, the usual way an animation is laid out */
	range(from: number, to: number): Texture[] {
		const out: Texture[] = [];
		for (let i = from; i <= to; i++) out.push(this.get(i));
		return out;
	}

	/** specific frames, for an animation that holds or ping-pongs */
	pick(...frames: Array<number | string>): Texture[] {
		return frames.map((frame) => this.get(frame));
	}
}
