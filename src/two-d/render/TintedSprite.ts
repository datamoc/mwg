import { Sprite } from 'pixi.js';
import type { SpriteOptions } from 'pixi.js';
import { packColorAdd, packTintAdd, registerColorTransform, useColorTransformPipe } from './ColorTransformBatcher.ts';
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

export { registerColorTransform } from './ColorTransformBatcher.ts';

//registers the pipe the moment anything imports this file - see registerColorTransform's own
//doc comment for why a module-scope call, rather than "on first render", is what makes this
//genuinely automatic
registerColorTransform();

/**
 * A sprite that can be pulled *towards* a colour, not just darkened.
 *
 * `tint` multiplies, as it does on any Pixi sprite. `colorAdd` is added on top, which is
 * what makes effects like these possible.
 *
 * @example
 * ```ts
 * import { TintedSprite } from '@datamoc/mwg/two-d/render';
 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const texture: Texture2D;
 *
 * const rat = new TintedSprite({ texture });
 * rat.lerpTint(0x00ff00, 0.5);   // half-way to green: poisoned
 * rat.lerpTint(0xffffff, 0.8);   // nearly white: just took a hit
 * rat.tint = 0x404060;           // plain multiply: standing in the dark
 * rat.silhouette(0x000000);      // a solid black shape, keeping only the sprite's outline
 *
 * const ghost = new TintedSprite({ texture });
 * ghost.alpha = 0.5;             // translucent: a spectral/ghost-type enemy
 * ghost.lerpTint(0x8080ff, 0.3); // both compose freely: a pale, faintly-blue-tinted ghost
 * ```
 *
 * Both terms ride in the same batch, so a screen full of tinted sprites is still one draw
 * call. See ColorTransformBatcher for how, and for the caveat about Pixi internals.
 *
 * `alpha` (inherited from Pixi's own `Sprite`) composes with both terms for free: this class
 * only *adds* one vertex attribute (`colorAdd`) onto Pixi's own colour+alpha packing
 * (`groupColorAlpha`), it never replaces or shadows it, so ordinary translucency - a
 * see-through ghost, a fade-in/out, a cloaking preview - needs no extra API here. Verified
 * live, not just by reading the packing code: a `TintedSprite` with `alpha = 0.35` renders
 * genuinely see-through (the texture behind it shows through), the same as any plain Pixi
 * `Sprite`.
 */
export class TintedSprite extends Sprite {
	private _colorAdd = 0;
	private toneFilter: ToneFilter | null = null;
	private tonePixiFilter: Filter | null = null;
	private _tone: NormalizedTone = NEUTRAL_TONE;

	constructor(options?: SpriteOptions | Texture2D) {
		super(options as SpriteOptions);

		//Sprite's constructor points this at Pixi's own pipe; redirect it to ours, which
		//is what puts this sprite in the colour-transform batch
		useColorTransformPipe(this);
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
		this.setTone(null);
	}

	/**
	 * Applies an RGSS-style tone (per-channel offsets plus a gray desaturation) as one live
	 * colour-matrix filter, or removes it with null. Composes with `tint`/`colorAdd`, but a
	 * filtered sprite leaves the colour-transform batch and costs its own pass, so use it
	 * for the handful of sprites a scene tone covers rather than every sprite on the map -
	 * `ScreenEffects.tone` is the screen-wide version, one filter for the whole world.
	 *
	 * @example
	 * ```ts
	 * import { TintedSprite } from '@datamoc/mwg/two-d/render';
	 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
	 *
	 * declare const portrait: Texture2D;
	 *
	 * const memory = new TintedSprite({ texture: portrait });
	 * memory.setTone({ gray: 220, blue: 20 }); // a faded, cold flashback
	 * memory.setTone(null); // full colour again
	 * ```
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
}
