import { Sprite } from 'pixi.js';
import type { Texture, SpriteOptions } from 'pixi.js';
import { TINTED_SPRITE_PIPE, packColorAdd, packTintAdd } from './ColorTransformBatcher.ts';

export { registerColorTransform } from './ColorTransformBatcher.ts';

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
