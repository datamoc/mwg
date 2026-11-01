import { Container, Sprite, extensions, SubtractBlend, type BLEND_MODES, type Filter } from 'pixi.js';
import type { Texture2D } from './Types2D.ts';
import {
	NEUTRAL_TONE,
	ToneFilter,
	attachToneFilter,
	detachToneFilter,
	normalizeTone,
	type NormalizedTone,
	type Tone,
} from './Tone.ts';
import { reducedMotion } from '../../core/Motion.ts';

/** options for a picture property tween; `ease` maps 0..1 to 0..1, linear when omitted */
export interface PictureTweenOptions {
	readonly ease?: (t: number) => number;
}

interface TweenGroup {
	pending: number;
	resolve: () => void;
}

interface TweenLane {
	group: TweenGroup;
	from: number;
	to: number;
	elapsed: number;
	duration: number;
	ease: (t: number) => number;
	write: (picture: Picture, value: number) => void;
}

const TONE_KEYS = ['tone.red', 'tone.green', 'tone.blue', 'tone.gray'] as const;

/** applies one tint channel while keeping the others, which is how a tint tween stays independent */
function writeTintChannel(picture: Picture, channel: 16 | 8 | 0, value: number): void {
	const rounded = Math.min(255, Math.max(0, Math.round(value)));
	const current = picture.tint;
	picture.tint =
		channel === 16
			? (rounded << 16) | (current & 0x00ffff)
			: channel === 8
				? (current & 0xff0000) | (rounded << 8) | (current & 0x0000ff)
				: (current & 0xffff00) | rounded;
}

/**
 * The blend modes a picture can name. `subtract` is RPG Maker XP's picture/fog type 2,
 * which Pixi implements as an advanced blend mode that has to be registered before use;
 * `Picture.setBlendMode` registers it on first call, so a game that never asks for it pays
 * nothing at runtime beyond the mode's own shader in the bundle.
 *
 * @example
 * ```ts
 * import { PICTURE_BLEND_MODES, Picture } from '@datamoc/mwg/two-d/render';
 *
 * const picture = new Picture('fog');
 * picture.setBlendMode('subtract'); // XP fog type 2, really subtractive
 * console.log(PICTURE_BLEND_MODES.includes('subtract')); // true
 * ```
 */
export const PICTURE_BLEND_MODES = [
	'normal',
	'add',
	'subtract',
	'multiply',
	'screen',
	'overlay',
	'darken',
	'lighten',
	'difference',
	'exclusion',
	'hard-light',
	'soft-light',
	'color-dodge',
	'color-burn',
	'hue',
	'saturation',
	'color',
	'luminosity',
] as const;

/** one of `PICTURE_BLEND_MODES` */
export type PictureBlendMode = (typeof PICTURE_BLEND_MODES)[number];

let subtractRegistered = false;

/** registers Pixi's subtract blend mode once, when a picture actually asks for it */
function ensureSubtractBlend(): void {
	if (subtractRegistered) return;
	subtractRegistered = true;
	extensions.add(SubtractBlend);
}

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

	/**
	 * An RGSS/MV tone to apply with the picture (per-channel offsets plus gray
	 * desaturation), or null to clear it. A patch's tone is merged channel by channel over
	 * the current one, so `moveTo({ tone: { gray: 255 } })` desaturates without disturbing
	 * a red offset already set.
	 */
	tone?: Tone | null;
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
	private toneFilter: ToneFilter | null = null;
	private tonePixiFilter: Filter | null = null;
	private _tone: NormalizedTone = NEUTRAL_TONE;
	private readonly lanes = new Map<string, TweenLane>();

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
		//an instant write wins over a running tween on the same field, leaving other fields' tweens alone
		this.cancelLanesForPatch(patch);
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
		if (patch.tone !== undefined) {
			this.setTone(patch.tone === null ? null : { ...this._tone, ...patch.tone });
		}
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

	/**
	 * Applies an RGSS/MV tone (per-channel offsets plus gray desaturation) to this picture
	 * alone, or removes it with null. This is the XP picture tone: `setTint` can only
	 * multiply a colour, while a tone brightens and darkens channels independently and can
	 * desaturate, which is what a picture shown over a night map or a memory flashback asks
	 * for. It costs one filter pass on this picture.
	 *
	 * @example
	 * ```ts
	 * import { PictureLayer } from '@datamoc/mwg/two-d/render';
	 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
	 *
	 * declare const flashback: Texture2D;
	 *
	 * const layer = new PictureLayer();
	 * const picture = layer.show('memory', { texture: flashback });
	 * picture.setTone({ gray: 200, blue: 30 }); // a cold, faded memory
	 * picture.setTone(null); // full colour again
	 * ```
	 */
	setTone(tone: Tone | null): this {
		this.cancelKeys(TONE_KEYS);
		if (!tone) {
			this.removeToneFilter();
			return this;
		}
		this.writeTone(tone);
		return this;
	}

	/**
	 * Writes one tone channel while leaving the other three where they are. Used by
	 * `tweenTo`'s tone lanes, so four independently easing channels compose into one tone
	 * rather than each overwriting the others.
	 */
	toneChannel(channel: keyof Tone, value: number): this {
		this.writeTone({ ...this._tone, [channel]: value });
		return this;
	}

	private writeTone(tone: Tone): void {
		this.toneFilter ??= new ToneFilter();
		this.toneFilter.tone = tone;
		this._tone = this.toneFilter.tone;
		this.tonePixiFilter = attachToneFilter(this, this.toneFilter);
	}

	private removeToneFilter(): void {
		if (!this.toneFilter) return;
		detachToneFilter(this, this.tonePixiFilter);
		this.toneFilter = null;
		this.tonePixiFilter = null;
		this._tone = NEUTRAL_TONE;
	}

	/** the live tone last passed to `setTone`, neutral when there is none */
	get tone(): NormalizedTone {
		return this._tone;
	}

	/**
	 * Eases the patch's fields over `seconds`, one target per property, and resolves when
	 * that call's own lanes finish. This is `Game_Picture`'s target model: a `tweenTo({ x, y })`
	 * and a `tweenTo({ tone })` run independently, so a running move never re-applies an old
	 * tone and undoes an instant tint. Tweening the same property again retargets from its
	 * live value and resolves the superseded promise. A zero duration or a reduced-motion
	 * preference applies the patch instantly.
	 *
	 * `PictureLayer.update(dt)` (or this picture's own `update(dt)`) drives it: like every
	 * other renderable here, a picture owns no clock.
	 *
	 * @example
	 * ```ts
	 * import { PictureLayer } from '@datamoc/mwg/two-d/render';
	 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
	 *
	 * declare const art: Texture2D;
	 *
	 * const pictures = new PictureLayer();
	 * const picture = pictures.show('1', { texture: art });
	 * void picture.tweenTo({ x: 320, y: 180 }, 1); // slides over a second
	 * void picture.tweenTo({ tone: { gray: 255 } }, 2); // desaturates over two, independently
	 *
	 * function onFrame(dt: number): void {
	 * 	pictures.update(dt);
	 * }
	 * ```
	 */
	tweenTo(patch: Partial<PictureOptions>, seconds: number, options: PictureTweenOptions = {}): Promise<void> {
		if (!(seconds > 0) || reducedMotion()) {
			this.moveTo(patch);
			return Promise.resolve();
		}

		const group: TweenGroup = { pending: 0, resolve: () => undefined };
		const done = new Promise<void>((resolve) => {
			group.resolve = resolve;
		});
		const ease = options.ease ?? ((t: number): number => t);

		//fields with no in-between value are applied once, at the start
		const instant: Partial<PictureOptions> = {};
		for (const key of [
			'texture',
			'originX',
			'originY',
			'blendMode',
			'zIndex',
			'visible',
			'width',
			'height',
		] as const) {
			if (patch[key] !== undefined) (instant as Record<string, unknown>)[key] = patch[key];
		}
		if (Object.keys(instant).length > 0) this.moveTo(instant);

		const add = (key: string, from: number, to: number, write: (picture: Picture, value: number) => void): void => {
			const existing = this.lanes.get(key);
			if (existing) this.finishLane(key, existing);
			group.pending++;
			this.lanes.set(key, { group, from, to, elapsed: 0, duration: seconds, ease, write });
		};

		if (patch.x !== undefined) add('x', this.x, patch.x, (p, v) => (p.x = v));
		if (patch.y !== undefined) add('y', this.y, patch.y, (p, v) => (p.y = v));
		if (patch.scale !== undefined) {
			add('scaleX', this.scale.x, patch.scale, (p, v) => (p.scale.x = v));
			add('scaleY', this.scale.y, patch.scale, (p, v) => (p.scale.y = v));
		}
		if (patch.scaleX !== undefined) add('scaleX', this.scale.x, patch.scaleX, (p, v) => (p.scale.x = v));
		if (patch.scaleY !== undefined) add('scaleY', this.scale.y, patch.scaleY, (p, v) => (p.scale.y = v));
		if (patch.rotation !== undefined) add('rotation', this.rotation, patch.rotation, (p, v) => (p.rotation = v));
		if (patch.alpha !== undefined) add('alpha', this.alpha, patch.alpha, (p, v) => (p.alpha = v));
		if (patch.tint !== undefined) {
			const current = this.tint;
			add('tintR', (current >> 16) & 0xff, (patch.tint >> 16) & 0xff, (p, v) => writeTintChannel(p, 16, v));
			add('tintG', (current >> 8) & 0xff, (patch.tint >> 8) & 0xff, (p, v) => writeTintChannel(p, 8, v));
			add('tintB', current & 0xff, patch.tint & 0xff, (p, v) => writeTintChannel(p, 0, v));
		}
		if (patch.tone !== undefined) {
			const target = patch.tone === null ? NEUTRAL_TONE : normalizeTone({ ...this._tone, ...patch.tone });
			add('tone.red', this._tone.red, target.red, (p, v) => p.toneChannel('red', v));
			add('tone.green', this._tone.green, target.green, (p, v) => p.toneChannel('green', v));
			add('tone.blue', this._tone.blue, target.blue, (p, v) => p.toneChannel('blue', v));
			add('tone.gray', this._tone.gray, target.gray, (p, v) => p.toneChannel('gray', v));
		}

		if (group.pending === 0) group.resolve();
		return done;
	}

	/** freezes every property tween where it is, resolving their promises, and leaves the values as they stand */
	stopTween(): void {
		for (const [key, lane] of [...this.lanes]) this.finishLane(key, lane);
	}

	/** advances every active lane; call once per frame from `PictureLayer.update` or the scene */
	update(dt: number): void {
		if (this.lanes.size === 0) return;
		for (const [key, lane] of [...this.lanes]) {
			lane.elapsed = Math.min(lane.duration, lane.elapsed + Math.max(0, dt));
			const t = lane.duration > 0 ? lane.elapsed / lane.duration : 1;
			lane.write(this, lane.from + (lane.to - lane.from) * lane.ease(t));
			if (lane.elapsed >= lane.duration) this.finishLane(key, lane);
		}
	}

	private finishLane(key: string, lane: TweenLane): void {
		if (this.lanes.get(key) !== lane) return;
		this.lanes.delete(key);
		lane.group.pending--;
		if (lane.group.pending === 0) lane.group.resolve();
	}

	/** cancels one lane by key and resolves its group if that was its last one */
	private cancelKeys(keys: readonly string[]): void {
		for (const key of keys) {
			const lane = this.lanes.get(key);
			if (lane) this.finishLane(key, lane);
		}
	}

	private cancelLanesForPatch(patch: Partial<PictureOptions>): void {
		const keys: string[] = [];
		if (patch.x !== undefined) keys.push('x');
		if (patch.y !== undefined) keys.push('y');
		if (patch.scale !== undefined) keys.push('scaleX', 'scaleY');
		if (patch.scaleX !== undefined) keys.push('scaleX');
		if (patch.scaleY !== undefined) keys.push('scaleY');
		if (patch.rotation !== undefined) keys.push('rotation');
		if (patch.alpha !== undefined) keys.push('alpha');
		if (patch.tint !== undefined) keys.push('tintR', 'tintG', 'tintB');
		if (patch.tone !== undefined) keys.push(...TONE_KEYS);
		this.cancelKeys(keys);
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
		if (!(PICTURE_BLEND_MODES as readonly string[]).includes(mode)) {
			throw new Error(`picture blend mode "${mode}" is not one of ${PICTURE_BLEND_MODES.join(', ')}`);
		}
		if (mode === 'subtract') ensureSubtractBlend();
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
	 * Re-keys a live picture, keeping its sprite, its `zIndex` and its slot in the stack.
	 * This is the Maniac "change picture id" case: capture-and-reshow would lose the
	 * instance and its draw position. Reports false when `from` is absent or `to` is taken.
	 */
	rename(from: string, to: string): boolean {
		if (from === to) return this.pictures.has(from);
		if (!this.pictures.has(from) || this.pictures.has(to)) return false;
		const rebuilt = new Map<string, Picture>();
		for (const [key, picture] of this.pictures) {
			if (key === from) {
				picture.name = to;
				rebuilt.set(to, picture);
			} else {
				rebuilt.set(key, picture);
			}
		}
		this.replacePictures(rebuilt);
		return true;
	}

	/**
	 * Swaps the names of two live pictures, keeping both sprites, their properties and
	 * their slots in the stack. Reports false unless both names exist and differ.
	 */
	swap(a: string, b: string): boolean {
		if (a === b) return this.pictures.has(a);
		if (!this.pictures.has(a) || !this.pictures.has(b)) return false;
		const rebuilt = new Map<string, Picture>();
		for (const [key, picture] of this.pictures) {
			if (key === a) {
				picture.name = b;
				rebuilt.set(b, picture);
			} else if (key === b) {
				picture.name = a;
				rebuilt.set(a, picture);
			} else {
				rebuilt.set(key, picture);
			}
		}
		this.replacePictures(rebuilt);
		return true;
	}

	private replacePictures(next: Map<string, Picture>): void {
		this.pictures.clear();
		for (const [key, picture] of next) this.pictures.set(key, picture);
	}

	/** advances every picture's own property tweens; call once per frame */
	update(dt: number): void {
		for (const picture of this.pictures.values()) picture.update(dt);
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
