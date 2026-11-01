import { TintedSprite } from './TintedSprite.ts';
import { Container2D, Texture2D } from './Types2D.ts';
import { texture as loadedTexture } from '../../assets/loader.ts';
import type { Tone } from './Tone.ts';
import type { BLEND_MODES } from 'pixi.js';

/**
 * What a host tells a `PluginLayer` about itself: how plugin URLs become textures, and where
 * the layer's container belongs.
 */
export interface PluginLayerOptions {
	/**
	 * Turns a plugin's own texture URL or asset path into art. Defaults to mwg's loaded-asset
	 * lookup, `texture(path, Texture.EMPTY)`, so a plugin naming a path the host already
	 * `load`ed draws it without knowing about mwg's compiled-asset map; a path that never
	 * loaded resolves to nothing and the sprite draws nothing.
	 */
	texture?: (path: string) => Texture2D;

	/** the container to add the layer's own container to, typically the camera world */
	parent?: Container2D;

	/** draw order of the whole layer against its siblings, for a layer already added to `parent` */
	zIndex?: number;
}

/**
 * One plugin-created sprite's placement: the arguments a bridge reads off the plugin's own
 * sprite object and hands here.
 *
 * Every field is optional and independent, which is what makes the same shape serve both a
 * fresh `create` and a later `moveTo` patch that changes only one property.
 */
export interface PluginSpriteOptions {
	/** the plugin's own art URL or asset path, resolved by the layer's texture resolver */
	texture?: string;

	/** position in the layer's coordinates; default 0 */
	x?: number;
	/** position in the layer's coordinates; default 0 */
	y?: number;

	/** drawn width; applied after the texture, so it wins over the art's own size */
	width?: number;
	/** drawn height; applied after the texture, so it wins over the art's own size */
	height?: number;

	/** 0 (invisible) to 1 (opaque); default 1 */
	alpha?: number;

	/** radians, clockwise on screen; default 0 */
	rotation?: number;

	/** false hides the sprite without removing it; default true */
	visible?: boolean;

	/** draw order within the layer, compared like `Picture`'s own `zIndex`; default 0 */
	zIndex?: number;

	/** a Pixi blend mode name such as `'normal'`, `'add'` or `'multiply'`; default `'normal'` */
	blendMode?: string;

	/** an RGSS/MV tone for this sprite alone, or null for none; costs one filter pass while set */
	tone?: Tone | null;
}

//the layer a sprite belongs to, so a direct `setZIndex` re-sorts the stack it sits in
const reorders = new WeakMap<PluginSprite, () => void>();

/** the default resolver: mwg's own loaded-asset lookup, drawing nothing for a path never loaded */
function loaded(path: string): Texture2D {
	return loadedTexture(path, Texture2D.EMPTY);
}

/**
 * One live sprite a plugin put on screen through a `PluginLayer`.
 *
 * It is a `TintedSprite`, so everything a sprite has still works (`anchor`, `tint`,
 * `rotation`, `parent`) and `setTone` comes from there; the methods here are the fluent
 * spelling a plugin bridge calls, plus an identity and a removal path back through the
 * layer. Construct one through `PluginLayer.create` rather than directly, so it knows
 * which layer owns it and which resolver turns its URLs into art.
 *
 * `id` is the layer's own generated key, stable for the sprite's lifetime. It is also written
 * to Pixi's `label`, so the sprite is identifiable in a scene graph, and a host is free to
 * overwrite `label` with the plugin's own sprite id, which is what a bridge mapping a plugin's
 * sprite table onto this layer does.
 *
 * @example
 * ```ts
 * import { PluginLayer } from '@datamoc/mwg/two-d/render';
 * import type { Container2D, PluginSprite } from '@datamoc/mwg/two-d/render';
 *
 * declare const cameraWorld: Container2D;
 *
 * const layer = new PluginLayer({ parent: cameraWorld });
 * const sprite: PluginSprite = layer.create({ texture: 'plugin/hud.png', x: 16, y: 16 });
 *
 * sprite.setTone({ blue: 20 }).setAlpha(0.8); // a cold, slightly faded HUD icon
 * console.log(layer.sprites.includes(sprite)); // true
 * sprite.erase(); // destroyed, and the layer no longer counts it
 * ```
 */
export class PluginSprite extends TintedSprite {
	/** the layer's generated key for this sprite, unique within that layer */
	readonly id: string;

	private owner: PluginLayer | null;
	//a plugin can call destroy() directly, which must also drop the layer's bookkeeping; this
	//stops the layer's own remove() from destroying the same sprite a second time
	private destroying = false;

	/** @param id the key the owning layer generated for this sprite */
	constructor(id: string, owner: PluginLayer, options: PluginSpriteOptions = {}) {
		super();
		this.id = id;
		this.label = id;
		this.owner = owner;
		this.moveTo(options);
	}

	/**
	 * Applies every field the patch actually sets, leaving the rest alone, so
	 * `moveTo({ x: 10 })` moves a sprite without touching its texture, alpha or tone.
	 * Returns this sprite for chaining.
	 */
	moveTo(patch: Partial<PluginSpriteOptions>): this {
		if (patch.texture !== undefined) this.setTexture(patch.texture);
		if (patch.x !== undefined) this.x = patch.x;
		if (patch.y !== undefined) this.y = patch.y;
		if (patch.rotation !== undefined) this.setRotation(patch.rotation);
		if (patch.alpha !== undefined) this.setAlpha(patch.alpha);
		if (patch.blendMode !== undefined) this.setBlendMode(patch.blendMode);
		if (patch.tone !== undefined) this.setTone(patch.tone);
		if (patch.zIndex !== undefined) this.setZIndex(patch.zIndex);
		if (patch.visible !== undefined) this.setVisible(patch.visible);
		//after the texture, so an explicit drawn size is the one that ends up on screen
		if (patch.width !== undefined) this.width = patch.width;
		if (patch.height !== undefined) this.height = patch.height;
		return this;
	}

	/**
	 * Swaps the art through the layer's resolver, leaving the placement and identity alone. A
	 * URL that resolves to nothing draws nothing, which is the same rule `create` follows.
	 */
	setTexture(url: string): this {
		this.texture = this.owner?.textureFor(url) ?? Texture2D.EMPTY;
		return this;
	}

	/** an RGSS/MV tone (per-channel offsets plus gray) on this sprite alone, or null for none */
	override setTone(tone: Tone | null): this {
		super.setTone(tone);
		return this;
	}

	/** 0 (invisible) to 1 (opaque) */
	setAlpha(value: number): this {
		this.alpha = value;
		return this;
	}

	/** false hides the sprite without removing it */
	setVisible(value: boolean): this {
		this.visible = value;
		return this;
	}

	/** radians, clockwise on screen */
	setRotation(radians: number): this {
		this.rotation = radians;
		return this;
	}

	/** a Pixi blend mode name; the advanced modes need their own registration, as in Pixi */
	setBlendMode(mode: string): this {
		this.blendMode = mode as BLEND_MODES;
		return this;
	}

	/** changes this sprite's slot in the layer immediately, re-sorting the stack it is in */
	setZIndex(value: number): this {
		this.zIndex = value;
		reorders.get(this)?.();
		return this;
	}

	/** removes this sprite from its layer, which destroys it; false once it is already gone */
	erase(): boolean {
		return this.owner?.remove(this) ?? false;
	}

	/**
	 * Destroys the sprite and forgets it in the layer that owned it, so a host that reaches
	 * for `destroy` directly cannot leave a stale entry behind. A destroyed sprite is inert.
	 */
	override destroy(options?: Parameters<TintedSprite['destroy']>[0]): void {
		if (this.destroying || this.destroyed) return;
		this.destroying = true;
		reorders.delete(this);
		this.owner?.remove(this);
		this.owner = null;
		super.destroy(options);
	}
}

/**
 * The display half of plugin support: a live layer a host can hand to sandboxed plugin code,
 * plus a stated rule for how a sprite the plugin creates lands on screen.
 *
 * A plugin running in an MV/MZ-style sandbox knows its own objects (`Sprite`, `parent`,
 * `setBlendMode`, a picture `tone`) but nothing about mwg. This layer is the counterpart a
 * host passes in: the plugin's `new Sprite()` becomes `layer.create()`, its `bitmap` becomes
 * `{ texture: url }`, its `addChild` becomes a child of `layer.container`, and its `remove`
 * becomes `sprite.erase()`. Mapping the plugin's own object model onto these calls is the
 * host's job; this class only owns the display side, which is why it never reads a plugin's
 * data and never names one.
 *
 * The mapping rule, stated once so a bridge can follow it by name:
 *
 * - the plugin's texture URL goes through the resolver the host supplied (by default mwg's
 *   own loaded-asset lookup, `texture(path, Texture.EMPTY)`), and the result is set on one
 *   Pixi sprite;
 * - `x`, `y`, `width`, `height`, `alpha` and `rotation` apply to that same sprite, so a
 *   plugin's rectangle and opacity are one sprite's transform, not a wrapper object;
 * - `visible` and `zIndex` are that sprite's own fields: `zIndex` orders it inside the
 *   layer, and later `create` calls draw on top of earlier ones at the same `zIndex`;
 * - `tone` is a colour-matrix filter on that sprite alone, `alpha` is Pixi's own alpha;
 * - `container` is added to the scene (typically to the camera world, over the map), so
 *   everything in the layer follows the camera for free: a HUD that should not follow a
 *   scrolling map is added to the stage instead;
 * - removing a sprite (`remove`, `erase`, `clear`, the layer's `destroy`) destroys it, so a
 *   plugin that removes its own overlay leaves nothing behind;
 * - a URL the resolver cannot turn into a texture draws nothing rather than throwing, so one
 *   missing plugin asset never takes a frame down.
 *
 * Nothing here touches the DOM at module scope and a sprite needs no renderer to exist, so a
 * headless test can build the layer, create sprites from URLs and assert what a plugin asked
 * for without a canvas.
 *
 * This is the display half of plugin support; the filtering half (plugin shaders and tints)
 * is a separate bridge over the same sandbox-to-scene mapping.
 *
 * @example
 * ```ts
 * import { PluginLayer } from '@datamoc/mwg/two-d/render';
 * import type { Container2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const cameraWorld: Container2D;
 *
 * // the host hands the plugin this layer and, implicitly, the resolver behind it
 * const foreground = new PluginLayer({ parent: cameraWorld, zIndex: 500 });
 *
 * const mist = foreground.create({ texture: 'plugin/mist.png', x: 0, y: 0, alpha: 0.5 });
 * mist.moveTo({ x: 32, alpha: 0.3 }).setZIndex(10);
 * console.log(foreground.count); // 1, one Pixi child over the map
 *
 * mist.erase(); // destroyed and forgotten: foreground.count is 0 again
 * ```
 */
export class PluginLayer {
	/** the display list to add to the scene; the layer itself is bookkeeping */
	readonly container = new Container2D();

	private readonly resolve: (path: string) => Texture2D;
	private readonly items = new Set<PluginSprite>();
	private created = 0;

	constructor(options: PluginLayerOptions = {}) {
		this.resolve = options.texture ?? loaded;
		//manual ordering via resort() puts the same order on the children list without a frame,
		//and the flag keeps a later addChild from undoing it
		this.container.sortableChildren = true;
		if (options.zIndex !== undefined) this.container.zIndex = options.zIndex;
		if (options.parent) options.parent.addChild(this.container);
	}

	/** how many sprites the layer currently holds */
	get count(): number {
		return this.items.size;
	}

	/** every sprite the layer holds, in the order it was created (not draw order) */
	get sprites(): readonly PluginSprite[] {
		return [...this.items];
	}

	/**
	 * Creates one sprite from the plugin's options, adds it to the layer's container and
	 * returns it. A `texture` the resolver cannot resolve draws nothing rather than throwing.
	 */
	create(options: PluginSpriteOptions = {}): PluginSprite {
		const sprite = new PluginSprite(`plugin-sprite-${++this.created}`, this, options);
		reorders.set(sprite, () => this.resort());
		this.items.add(sprite);
		this.container.addChild(sprite);
		this.resort();
		return sprite;
	}

	/**
	 * The same URL-to-texture lookup `create` and `setTexture` use, exposed so a host bridging
	 * its plugin object model can ask before it creates: null when the resolver throws or
	 * returns nothing, which is the "draws nothing" case.
	 */
	textureFor(url: string): Texture2D | null {
		try {
			return this.resolve(url) ?? null;
		} catch {
			//one missing plugin asset must not take the frame down; the class comment states this
			return null;
		}
	}

	/** destroys a sprite and takes it out of the layer; false when it was not this layer's */
	remove(sprite: PluginSprite): boolean {
		//out of the layer first, so the destroy below does not re-enter this method's lookup
		if (!this.items.delete(sprite)) return false;
		reorders.delete(sprite);
		sprite.destroy();
		return true;
	}

	/** destroys every sprite, leaving an empty layer that is still usable */
	clear(): void {
		for (const sprite of [...this.items]) sprite.destroy();
	}

	/** destroys every sprite and the container; the layer is unusable afterwards */
	destroy(): void {
		this.clear();
		this.container.destroy();
	}

	/** the sprites in draw order; ties on `zIndex` keep the order they were created in */
	private drawOrder(): PluginSprite[] {
		//Array#sort is stable, so equal zIndex values keep the set's insertion order
		return [...this.items].sort((a, b) => a.zIndex - b.zIndex);
	}

	private resort(): void {
		this.container.removeChildren();
		for (const sprite of this.drawOrder()) this.container.addChild(sprite);
	}
}
