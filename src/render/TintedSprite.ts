import { Sprite, ExtensionType, extensions } from 'pixi.js';
import type { Renderer, InstructionSet, Texture, SpriteOptions, BLEND_MODES } from 'pixi.js';
import { ColorTransformBatcher, packColorAdd, packTintAdd } from './ColorTransformBatcher.ts';

const TINTED_SPRITE_PIPE = 'mwg-tinted-sprite';

/**
 * A sprite that can be pulled *towards* a colour, not just darkened.
 *
 * `tint` multiplies, as it does on any Pixi sprite. `colorAdd` is added on top, which is
 * what makes effects like these possible:
 *
 * ```ts
 * const rat = new TintedSprite({ texture });
 * rat.lerpTint(0x00ff00, 0.5);   // half-way to green: poisoned
 * rat.flash(0xffffff, 0.8);      // nearly white: just took a hit
 * rat.tint = 0x404060;           // plain multiply: standing in the dark
 * ```
 *
 * Both terms ride in the same batch, so a screen full of tinted sprites is still one draw
 * call. See ColorTransformBatcher for how, and for the caveat about Pixi internals.
 */
export class TintedSprite extends Sprite {
	private _colorAdd = 0;

	constructor(options?: SpriteOptions | Texture) {
		super(options as SpriteOptions);

		//Sprite's constructor points this at Pixi's own pipe; redirect it to ours, which
		//is what puts this sprite in the colour-transform batch
		(this as unknown as { renderPipeId: string }).renderPipeId = TINTED_SPRITE_PIPE;
	}

	/** the packed additive colour; use `setColorAdd` or `lerpTint` rather than setting it raw */
	get colorAdd(): number {
		return this._colorAdd;
	}

	set colorAdd(value: number) {
		if (this._colorAdd === value) return;
		this._colorAdd = value;
		//the vertex data holds the packed colour, so the batch has to be repacked
		this.onViewUpdate();
	}

	/** @param r @param g @param b each 0 to 1 @param a extra alpha to add, usually 0 */
	setColorAdd(r: number, g: number, b: number, a = 0): void {
		this.colorAdd = packColorAdd(r, g, b, a);
	}

	/**
	 * Moves the sprite `strength` of the way towards `color`, leaving its shading intact.
	 *
	 * This sets both halves of the transform: the tint carries `1 - strength` and the
	 * additive term carries `color × strength`.
	 */
	lerpTint(color: number, strength: number): void {
		const keep = Math.round((1 - strength) * 0xff);
		this.tint = (keep << 16) | (keep << 8) | keep;
		this.colorAdd = packTintAdd(color, strength);
	}

	/** a solid silhouette in `color`, keeping only the sprite's shape */
	silhouette(color: number): void {
		this.tint = 0x000000;
		this.colorAdd = packTintAdd(color, 1);
	}

	/** back to the texture's own colours */
	resetColor(): void {
		this.tint = 0xffffff;
		this.colorAdd = 0;
	}
}

/**
 * Routes TintedSprite through the colour-transform batcher.
 *
 * Pixi decides which batcher an object joins from `batcherName` on its batchable element,
 * and that element is built by a render pipe. So selecting a different batcher means
 * supplying a pipe; this one mirrors Pixi's own SpritePipe and changes two things: the
 * batcher name, and copying `colorAdd` across before each pack.
 */
class TintedSpritePipe {
	/** @internal */
	static extension = {
		type: [ExtensionType.WebGLPipes, ExtensionType.WebGPUPipes, ExtensionType.CanvasPipes],
		name: TINTED_SPRITE_PIPE,
	} as const;

	private renderer: Renderer;

	constructor(renderer: Renderer) {
		this.renderer = renderer;
	}

	addRenderable(sprite: TintedSprite, instructionSet: InstructionSet): void {
		const element = this.element(sprite);
		if (sprite.didViewUpdate) this.sync(sprite, element);
		this.renderer.renderPipes.batch.addToBatch(element, instructionSet);
	}

	updateRenderable(sprite: TintedSprite): void {
		const element = this.element(sprite);
		if (sprite.didViewUpdate) this.sync(sprite, element);
		element._batcher.updateElement(element);
	}

	validateRenderable(sprite: TintedSprite): boolean {
		const element = this.element(sprite);
		return !element._batcher.checkAndUpdateTexture(element, sprite.texture);
	}

	private sync(sprite: TintedSprite, element: BatchableTintedSprite): void {
		element.bounds = sprite.visualBounds;
		element.texture = sprite.texture;
		element.colorAdd = sprite.colorAdd;
	}

	private element(sprite: TintedSprite): BatchableTintedSprite {
		const gpuData = (sprite as unknown as { _gpuData: Record<number, BatchableTintedSprite> })._gpuData;
		return gpuData[this.renderer.uid] ?? this.create(sprite, gpuData);
	}

	private create(
		sprite: TintedSprite,
		gpuData: Record<number, BatchableTintedSprite>
	): BatchableTintedSprite {
		const element = new BatchableTintedSprite();
		element.renderable = sprite;
		element.transform = sprite.groupTransform;
		element.texture = sprite.texture;
		element.bounds = sprite.visualBounds;
		element.roundPixels = ((this.renderer as unknown as { _roundPixels: number })._roundPixels |
			(sprite as unknown as { _roundPixels: number })._roundPixels) as 0 | 1;
		element.colorAdd = sprite.colorAdd;

		gpuData[this.renderer.uid] = element;
		return element;
	}

	destroy(): void {
		this.renderer = null as unknown as Renderer;
	}
}

/** the same shape as Pixi's BatchableSprite, plus the additive colour */
class BatchableTintedSprite {
	batcherName = ColorTransformBatcher.extension.name;
	topology = 'triangle-list' as const;

	attributeSize = 4;
	indexSize = 6;
	packAsQuad = true;
	roundPixels: 0 | 1 = 0;

	colorAdd = 0;

	renderable!: TintedSprite;
	texture!: Texture;
	transform!: unknown;
	bounds!: unknown;

	//Pixi fills these in while batching; they exist on its own element type too
	_attributeStart = 0;
	_textureId = 0;
	_indexStart = 0;
	_batcher: any = null;
	_batch: any = null;

	get blendMode(): BLEND_MODES {
		return (this.renderable as unknown as { groupBlendMode: BLEND_MODES }).groupBlendMode;
	}

	get color(): number {
		return (this.renderable as unknown as { groupColorAlpha: number }).groupColorAlpha;
	}

	reset(): void {
		this.renderable = null as unknown as TintedSprite;
		this.texture = null as unknown as Texture;
		this._batcher = null;
		this._batch = null;
		this.bounds = null;
		this.colorAdd = 0;
	}

	destroy(): void {
		this.reset();
	}
}

let registered = false;

/**
 * Registers the batcher and pipe with Pixi.
 *
 * Called automatically the first time a TintedSprite is rendered is not possible, because
 * registration has to happen before the renderer is created — so `Game` calls this during
 * start-up, and it is exported for anyone building their own renderer.
 */
export function registerColorTransform(): void {
	if (registered) return;
	registered = true;

	extensions.add(ColorTransformBatcher);
	extensions.add(TintedSpritePipe);
}
