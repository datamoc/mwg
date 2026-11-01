import { Container, Sprite, TilingSprite } from 'pixi.js';
import type { Texture2D } from './Types2D.ts';
import {
	NEUTRAL_TONE,
	ToneFilter,
	attachToneFilter,
	detachToneFilter,
	type NormalizedTone,
	type Tone,
} from './Tone.ts';
import type { Filter } from 'pixi.js';

/**
 * What a backdrop needs: the art, how it follows the camera, and how far it stretches.
 *
 * `scrollX`/`scrollY` are depths, not speeds: 0 pins the backdrop to the screen, 1 moves it
 * exactly as fast as the world does, and 0.5 - the RPG Maker default `parallaxScroll` reads
 * off a file name - reads as "far away".
 */
export interface ParallaxOptions {
	/** the backdrop art */
	texture: Texture2D;

	/** how much of the camera's x movement this layer copies; 0 pinned, 1 world speed, default 0.5 */
	scrollX?: number;

	/** how much of the camera's y movement this layer copies; 0 pinned, 1 world speed, default 0.5 */
	scrollY?: number;

	/** whether the art repeats horizontally instead of running out; default true */
	loopX?: boolean;

	/** whether the art repeats vertically instead of running out; default true */
	loopY?: boolean;

	/** covered width in screen units; default the texture's own width */
	width?: number;

	/** covered height in screen units; default the texture's own height */
	height?: number;

	/** 0 (invisible) to 1 (opaque); default 1 */
	opacity?: number;

	/** multiply tint as a hex number; default white */
	tint?: number;

	/** the backdrop's own nudge from its scrolled position; default 0 */
	offsetX?: number;

	/** the backdrop's own nudge from its scrolled position; default 0 */
	offsetY?: number;

	/**
	 * texture pixels per screen unit at which the art tiles, for an asset drawn at a higher
	 * density than the game's pixels; default 1, which tiles at the art's own pixel size
	 */
	resolution?: number;
}

/** wraps into (-size, 0], the band a repeating axis places its first copy in */
function wrapOrigin(origin: number, size: number): number {
	const wrapped = ((origin % size) + size) % size;
	return wrapped - size;
}

/**
 * Reads the RPG Maker parallax convention off a picture path: a basename starting with `!`
 * is pinned to the screen and does not repeat, anything else scrolls at half the camera's
 * speed and loops on both axes. Paths may use either separator.
 *
 * @example
 * ```ts
 * import { parallaxScroll } from '@datamoc/mwg/two-d/render';
 *
 * console.log(parallaxScroll('img/parallaxes/Clouds.png'));
 * // { scrollX: 0.5, scrollY: 0.5, loopX: true, loopY: true }
 *
 * console.log(parallaxScroll('img/parallaxes/!Sky.png'));
 * // { scrollX: 0, scrollY: 0, loopX: false, loopY: false } - pinned, drawn once
 * ```
 */
export function parallaxScroll(path: string): {
	scrollX: number;
	scrollY: number;
	loopX: boolean;
	loopY: boolean;
} {
	const basename = path.split(/[\\/]/).pop() ?? '';
	if (basename.startsWith('!')) return { scrollX: 0, scrollY: 0, loopX: false, loopY: false };
	return { scrollX: 0.5, scrollY: 0.5, loopX: true, loopY: true };
}

/**
 * A scrolling backdrop behind the world: a texture that follows the camera at its own depth,
 * repeating when it should and running out honestly when it should not.
 *
 * `scrollX`/`scrollY` of 0 pin the art to the screen (a sky), 1 makes it move with the world
 * (a wall the camera passes), and anything between reads as distance. The camera's `zoom` is
 * taken into account, so 1 stays world speed however far the game is zoomed in or out.
 *
 * Two representations, picked once and kept: with `loopX` and `loopY` both set the layer is
 * a single `TilingSprite`, the cheapest way to fill any area forever; otherwise it is a
 * fixed grid of copy sprites laid out from the art's first pixel, so a non-looping axis
 * simply stops covering once the camera has scrolled past the end of the art instead of
 * wrapping around, while a looping axis wraps its copies. The grid is sized for the covered
 * area up front and only repositioned per frame, never rebuilt. Call `update` from the frame
 * loop, and put the layer below everything the camera moves.
 *
 * @example
 * ```ts
 * import { ParallaxLayer, parallaxScroll } from '@datamoc/mwg/two-d/render';
 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const skyTexture: Texture2D;
 * declare const camera: { x: number; y: number; zoom?: number };
 *
 * const sky = new ParallaxLayer({
 * 	texture: skyTexture,
 * 	...parallaxScroll('img/parallaxes/Clouds.png'), // 0.5, 0.5, looping
 * 	width: 640,
 * 	height: 360,
 * 	opacity: 0.8,
 * });
 *
 * function onFrame(dt: number): void {
 * 	sky.update(dt, camera);
 * }
 * ```
 */
export class ParallaxLayer extends Container {
	private art: Texture2D;
	private depthX: number;
	private depthY: number;
	private repeatsX: boolean;
	private repeatsY: boolean;
	private viewWidth: number;
	private viewHeight: number;
	private nudgeX: number;
	private nudgeY: number;
	private density: number;
	private colour: number;

	/** how far the camera has dragged the art so far, in screen units */
	private draggedX = 0;
	private draggedY = 0;

	/** the single repeating quad, when both axes loop */
	private tiling: TilingSprite | null = null;

	/** the copy grid, when at least one axis does not loop */
	private copies: Sprite[] = [];
	private columns = 0;
	private rows = 0;
	private toneFilter: ToneFilter | null = null;
	private tonePixiFilter: Filter | null = null;
	private _tone: NormalizedTone = NEUTRAL_TONE;

	constructor(options: ParallaxOptions) {
		super();
		const density = options.resolution ?? 1;
		if (!Number.isFinite(density) || density <= 0) {
			throw new RangeError(`a parallax layer needs resolution above 0, saw ${density}`);
		}
		this.art = options.texture;
		this.density = density;
		this.depthX = options.scrollX ?? 0.5;
		this.depthY = options.scrollY ?? 0.5;
		this.repeatsX = options.loopX ?? true;
		this.repeatsY = options.loopY ?? true;
		this.viewWidth = options.width ?? options.texture.width;
		this.viewHeight = options.height ?? options.texture.height;
		this.nudgeX = options.offsetX ?? 0;
		this.nudgeY = options.offsetY ?? 0;
		this.colour = options.tint ?? 0xffffff;
		this.alpha = options.opacity ?? 1;
		this.eventMode = 'none';
		this.rebuild();
		this.layout();
	}

	/** how much of the camera's x movement this layer copies */
	get scrollX(): number {
		return this.depthX;
	}

	/** how much of the camera's y movement this layer copies */
	get scrollY(): number {
		return this.depthY;
	}

	/** whether the art repeats horizontally rather than running out */
	get loopX(): boolean {
		return this.repeatsX;
	}

	/** whether the art repeats vertically rather than running out */
	get loopY(): boolean {
		return this.repeatsY;
	}

	/** changes the depth without rebuilding the layer */
	setScroll(scrollX: number, scrollY: number): void {
		this.depthX = scrollX;
		this.depthY = scrollY;
	}

	/** 0 (invisible) to 1 (opaque), scaling the whole layer */
	setOpacity(opacity: number): void {
		this.alpha = opacity;
	}

	/** multiply tint as a hex number, applied to the art rather than to the container */
	setTint(color: number): void {
		this.colour = color;
		if (this.tiling) this.tiling.tint = color;
		for (const copy of this.copies) copy.tint = color;
	}

	/**
	 * An RGSS-style tone over the whole backdrop (per-channel offsets plus a gray
	 * desaturation), or null to remove it. The fog version of this ask: an XP fog carries a
	 * tone independent of its opacity, and this applies it to every copy the layer draws.
	 */
	setTone(tone: Tone | null): void {
		if (!tone) {
			if (!this.toneFilter) return;
			detachToneFilter(this, this.tonePixiFilter);
			this.toneFilter = null;
			this.tonePixiFilter = null;
			this._tone = NEUTRAL_TONE;
			return;
		}
		this.toneFilter ??= new ToneFilter();
		this.toneFilter.tone = tone;
		this._tone = this.toneFilter.tone;
		this.tonePixiFilter = attachToneFilter(this, this.toneFilter);
	}

	/** the live tone last passed to `setTone`, neutral when there is none */
	get tone(): NormalizedTone {
		return this._tone;
	}

	/** the layer's own nudge from its scrolled position, in screen units */
	setOffset(offsetX: number, offsetY: number): void {
		this.nudgeX = offsetX;
		this.nudgeY = offsetY;
	}

	/** swaps the art, rebuilding the grid when the new size changes what fits */
	setTexture(texture: Texture2D): void {
		this.art = texture;
		this.rebuild();
		this.layout();
	}

	/** changes the covered area, rebuilding the grid when it needs more copies */
	resize(width: number, height: number): void {
		this.viewWidth = width;
		this.viewHeight = height;
		this.rebuild();
		this.layout();
	}

	/**
	 * Repositions the backdrop for the camera's current position. `dt` is validated but the
	 * scroll itself is a pure function of where the camera is, so a paused frame and a
	 * resumed one land in the same place.
	 */
	update(dt: number, camera: { x: number; y: number; zoom?: number }): void {
		if (!Number.isFinite(dt) || dt < 0) {
			throw new RangeError(`a parallax update needs dt of at least 0, saw ${dt}`);
		}
		if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y)) {
			throw new RangeError(`a parallax camera needs a finite position, saw (${camera.x}, ${camera.y})`);
		}
		const zoom = camera.zoom ?? 1;
		if (!Number.isFinite(zoom) || zoom <= 0) {
			throw new RangeError(`a parallax camera needs a zoom above 0, saw ${zoom}`);
		}
		this.draggedX = camera.x * this.depthX * zoom;
		this.draggedY = camera.y * this.depthY * zoom;
		this.layout();
	}

	/** the art's tile size in screen units, after `resolution` */
	private tileWidth(): number {
		return this.art.width / this.density;
	}

	private tileHeight(): number {
		return this.art.height / this.density;
	}

	private rebuild(): void {
		//a snapshot: destroying a child splices it out of `children` as we go
		for (const child of [...this.children]) child.destroy();
		this.copies = [];
		this.tiling = null;
		this.columns = 0;
		this.rows = 0;

		if (this.repeatsX && this.repeatsY) {
			const tiling = new TilingSprite({ texture: this.art, width: this.viewWidth, height: this.viewHeight });
			tiling.eventMode = 'none';
			tiling.tint = this.colour;
			tiling.tileScale.set(1 / this.density);
			this.tiling = tiling;
			this.addChild(tiling);
			return;
		}

		//one copy past the edge on each axis, so a half-scrolled tile is still covered
		const tileWidth = this.tileWidth();
		const tileHeight = this.tileHeight();
		//a texture with no size (Texture.EMPTY) has nothing to repeat and nothing to cover with
		if (!(tileWidth > 0) || !(tileHeight > 0)) return;
		this.columns = Math.ceil(this.viewWidth / tileWidth) + 1;
		this.rows = Math.ceil(this.viewHeight / tileHeight) + 1;
		for (let row = 0; row < this.rows; row++) {
			for (let column = 0; column < this.columns; column++) {
				const copy = new Sprite(this.art);
				copy.eventMode = 'none';
				copy.tint = this.colour;
				copy.scale.set(1 / this.density);
				this.copies.push(copy);
				this.addChild(copy);
			}
		}
	}

	private layout(): void {
		//where the art's own first pixel sits on screen: a nudge pushes it right, the camera
		//drags it left, and a repeating axis wraps that so the covered band never runs out
		const draggedToX = this.nudgeX - this.draggedX;
		const draggedToY = this.nudgeY - this.draggedY;

		if (this.tiling) {
			//a TilingSprite wraps any tile position itself, so no wrapping is needed here
			this.tiling.tilePosition.set(draggedToX, draggedToY);
			return;
		}

		const tileWidth = this.tileWidth();
		const tileHeight = this.tileHeight();
		const originX = this.repeatsX ? wrapOrigin(draggedToX, tileWidth) : draggedToX;
		const originY = this.repeatsY ? wrapOrigin(draggedToY, tileHeight) : draggedToY;

		let index = 0;
		for (let row = 0; row < this.rows; row++) {
			const y = originY + row * tileHeight;
			for (let column = 0; column < this.columns; column++) {
				const x = originX + column * tileWidth;
				const copy = this.copies[index++];
				copy.position.set(x, y);
				copy.visible = x < this.viewWidth && x + tileWidth > 0 && y < this.viewHeight && y + tileHeight > 0;
			}
		}
	}
}
