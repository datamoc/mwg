import { Container, Sprite, type BLEND_MODES } from 'pixi.js';
import type { Texture2D } from './Types2D.ts';

/**
 * One picture's placement: where it sits, how it is anchored, scaled, coloured and stacked.
 *
 * Every field is optional and independent, which is what makes the same shape serve both a
 * fresh `show` and a later `moveTo` patch that changes only the position.
 */
export interface PictureOptions {
	/** the art to draw; omitting it on a replace keeps the picture's current texture */
	texture?: Texture2D;

	/** screen position in the layer's own coordinates; default 0 */
	x?: number;
	/** screen position in the layer's own coordinates; default 0 */
	y?: number;

	/** drawn width; when given it wins over `scale`/`scaleX`, since it is the size asked for */
	width?: number;
	/** drawn height; when given it wins over `scale`/`scaleY`, since it is the size asked for */
	height?: number;

	/** horizontal anchor, 0 (left) to 1 (right); default 0 */
	originX?: number;
	/** vertical anchor, 0 (top) to 1 (bottom); default 0 */
	originY?: number;

	/** uniform scale; default 1 */
	scale?: number;
	/** horizontal scale, applied after `scale` */
	scaleX?: number;
	/** vertical scale, applied after `scale` */
	scaleY?: number;

	/** radians, clockwise on screen; default 0 */
	rotation?: number;

	/** 0 (invisible) to 1 (opaque); default 1 */
	alpha?: number;

	/** multiply tint as a hex number; default white, which leaves the art untouched */
	tint?: number;

	/** a Pixi blend mode name such as `'add'` or `'multiply'`; default `'normal'` */
	blendMode?: string;

	/** draw order within the layer, see `PictureLayer`'s own doc comment; default 0 */
	zIndex?: number;

	/** false hides the picture without erasing it; default true */
	visible?: boolean;
}

//the layer a picture belongs to, so a direct `setZIndex` re-sorts the stack it sits in
const reorderHooks = new WeakMap<Picture, () => void>();

/**
 * A named, individually placed picture inside a `PictureLayer`.
 *
 * It is a Pixi `Sprite`, so everything a sprite has still works: `anchor`, `tint`,
 * `rotation`, `visible`, `parent`. The methods here are the fluent spelling of the same
 * properties, plus the layer-facing `name`.
 *
 * @example
 * ```ts
 * import { PictureLayer } from '@datamoc/mwg/two-d/render';
 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const titleTexture: Texture2D;
 *
 * const layer = new PictureLayer();
 * const title = layer.show('title', { texture: titleTexture, x: 320, y: 40, originX: 0.5, originY: 0 });
 *
 * title.moveTo({ y: 60, alpha: 0.5 }).setBlendMode('add');
 * console.log(title.name); // 'title'
 * ```
 */
export class Picture extends Sprite {
	/** @param name the key the owning `PictureLayer` addresses this picture by */
	constructor(name: string, options: PictureOptions = {}) {
		super(options.texture ? { texture: options.texture } : undefined);
		this.name = name;
		this.moveTo(options);
	}

	/**
	 * Applies every field the patch actually sets, leaving the rest alone, so
	 * `moveTo({ x: 10 })` moves a picture without touching its scale, tint or texture.
	 * Returns this picture for chaining.
	 */
	moveTo(patch: Partial<PictureOptions>): this {
		if (patch.texture !== undefined) this.texture = patch.texture;
		if (patch.originX !== undefined || patch.originY !== undefined) {
			this.setOrigin(patch.originX ?? this.anchor.x, patch.originY ?? this.anchor.y);
		}
		if (patch.x !== undefined) this.x = patch.x;
		if (patch.y !== undefined) this.y = patch.y;
		if (patch.scale !== undefined) this.scale.set(patch.scale);
		if (patch.scaleX !== undefined) this.scale.x = patch.scaleX;
		if (patch.scaleY !== undefined) this.scale.y = patch.scaleY;
		if (patch.rotation !== undefined) this.setRotation(patch.rotation);
		if (patch.alpha !== undefined) this.setAlpha(patch.alpha);
		if (patch.tint !== undefined) this.setTint(patch.tint);
		if (patch.blendMode !== undefined) this.setBlendMode(patch.blendMode);
		if (patch.zIndex !== undefined) this.setZIndex(patch.zIndex);
		if (patch.visible !== undefined) this.visible = patch.visible;
		//after the scale, so an explicit drawn size is the one that ends up on screen
		if (patch.width !== undefined) this.width = patch.width;
		if (patch.height !== undefined) this.height = patch.height;
		return this;
	}

	/** swaps the art without touching the picture's placement or identity */
	setTexture(texture: Texture2D): this {
		this.texture = texture;
		return this;
	}

	/** sets both anchor axes at once; 0 is the top-left corner, 0.5 the centre */
	setOrigin(x: number, y: number): this {
		this.anchor.set(x, y);
		return this;
	}

	/** multiply tint as a hex number; white leaves the art untouched */
	setTint(color: number): this {
		this.tint = color;
		return this;
	}

	/** 0 (invisible) to 1 (opaque) */
	setAlpha(value: number): this {
		this.alpha = value;
		return this;
	}

	/** radians, clockwise on screen */
	setRotation(radians: number): this {
		this.rotation = radians;
		return this;
	}

	/** a Pixi blend mode name such as `'add'` or `'multiply'` */
	setBlendMode(mode: string): this {
		this.blendMode = mode as BLEND_MODES;
		return this;
	}

	/** changes this picture's slot in the layer immediately, re-sorting the stack it is in */
	setZIndex(value: number): this {
		this.zIndex = value;
		reorderHooks.get(this)?.();
		return this;
	}
}

/**
 * A named stack of pictures drawn in one place - title cards, HUD portraits, a cutscene
 * overlay - addressed by name instead of held as loose sprite variables. `show` replaces a
 * picture in place, so a scene can re-issue the same `show('title', { y })` every frame it
 * animates without leaking sprites or losing the stacking order.
 *
 * Draw order is deterministic and therefore testable: pictures sort by their `zIndex`
 * (default 0) and, within the same `zIndex`, keep the order they were first shown in. An
 * explicit `zIndex` is compared against those defaults, so showing a picture later puts it
 * on top unless something states otherwise; `bringToFront` and `sendToBack` move one picture
 * past every other, whatever `zIndex` values the rest carry. The pictures live in the
 * layer's own `container`, which is what a scene adds to its stage; `names` reads bottom to
 * top in the order that container draws.
 *
 * @example
 * ```ts
 * import { Picture, PictureLayer } from '@datamoc/mwg/two-d/render';
 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const skyTexture: Texture2D;
 * declare const frameTexture: Texture2D;
 *
 * const pictures = new PictureLayer();
 * // with a scene: scene.stage.addChild(pictures.container);
 * const sky: Picture = pictures.show('sky', { texture: skyTexture, tint: 0x8899cc });
 * pictures.show('frame', { texture: frameTexture, zIndex: 10 });
 *
 * pictures.moveTo('sky', { x: 24, y: 12 });
 * pictures.tint('sky', 0xffffff);
 * pictures.bringToFront('sky'); // now drawn after the frame despite the frame's zIndex
 * console.log(pictures.names); // ['frame', 'sky'] - bottom to top
 *
 * pictures.erase('frame'); // destroys the sprite, and `has('frame')` is false afterwards
 * ```
 */
export class PictureLayer {
	/** the display list to add to the scene; the layer itself is bookkeeping, not a display object */
	readonly container = new Container();

	private readonly pictures = new Map<string, Picture>();

	/** how many pictures the layer currently holds */
	get size(): number {
		return this.pictures.size;
	}

	/** every picture's name, in the order the layer draws them: bottom first */
	get names(): readonly string[] {
		return this.drawOrder().map((picture) => picture.name);
	}

	/**
	 * Shows a picture under `name`. Showing a name that already exists re-applies the given
	 * fields in place and keeps both the sprite and its slot in the stack, so a per-frame
	 * `show` with a moving `x` is the cheap way to animate one; `texture` omitted on a
	 * replace keeps the current art.
	 */
	show(name: string, options: PictureOptions = {}): Picture {
		const existing = this.pictures.get(name);
		if (existing) {
			//a zIndex in the patch re-sorts through the same hook a direct setZIndex uses
			existing.moveTo(options);
			return existing;
		}

		const picture = new Picture(name, options);
		reorderHooks.set(picture, () => this.resort());
		this.pictures.set(name, picture);
		this.container.addChild(picture);
		this.resort();
		return picture;
	}

	get(name: string): Picture | null {
		return this.pictures.get(name) ?? null;
	}

	has(name: string): boolean {
		return this.pictures.has(name);
	}

	/** applies a patch to a picture already on screen; null when no picture carries that name */
	moveTo(name: string, patch: Partial<PictureOptions>): Picture | null {
		const picture = this.pictures.get(name);
		if (!picture) return null;
		picture.moveTo(patch);
		return picture;
	}

	/** turns a picture by `radians` clockwise; null when no picture carries that name */
	rotate(name: string, radians: number): Picture | null {
		return this.pictures.get(name)?.setRotation(radians) ?? null;
	}

	/** multiply-tints a picture; null when no picture carries that name */
	tint(name: string, color: number): Picture | null {
		return this.pictures.get(name)?.setTint(color) ?? null;
	}

	/**
	 * Destroys a picture and its sprite. Other pictures keep their relative order, and a
	 * later `show` of the same name starts at the top as if it had never been shown.
	 *
	 * @returns whether that name was on screen
	 */
	erase(name: string): boolean {
		const picture = this.pictures.get(name);
		if (!picture) return false;
		reorderHooks.delete(picture);
		this.pictures.delete(name);
		picture.destroy();
		return true;
	}

	/** destroys every picture, leaving an empty layer that is still usable */
	clear(): void {
		for (const name of [...this.pictures.keys()]) this.erase(name);
	}

	/** moves a picture above everything else the layer holds; reports whether it was there */
	bringToFront(name: string): boolean {
		const picture = this.pictures.get(name);
		if (!picture) return false;
		let highest = 0;
		for (const other of this.pictures.values()) highest = Math.max(highest, other.zIndex);
		picture.setZIndex(highest + 1);
		return true;
	}

	/** moves a picture below everything else the layer holds; reports whether it was there */
	sendToBack(name: string): boolean {
		const picture = this.pictures.get(name);
		if (!picture) return false;
		let lowest = 0;
		for (const other of this.pictures.values()) lowest = Math.min(lowest, other.zIndex);
		picture.setZIndex(lowest - 1);
		return true;
	}

	/** the pictures in draw order; ties on `zIndex` keep the order they were shown in */
	private drawOrder(): Picture[] {
		//Array#sort is stable, so equal zIndex values keep the map's insertion order
		return [...this.pictures.values()].sort((a, b) => a.zIndex - b.zIndex);
	}

	private resort(): void {
		const ordered = this.drawOrder();
		this.container.removeChildren();
		for (const picture of ordered) this.container.addChild(picture);
	}

	/** destroys every picture and the container; the layer is unusable afterwards */
	destroy(): void {
		this.clear();
		this.container.destroy();
	}
}
