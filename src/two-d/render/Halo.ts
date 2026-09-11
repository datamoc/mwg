import { AnimatedSprite } from './AnimatedSprite.ts';
import type { AnimationFrameInput, AnimationOptions } from './AnimatedSprite.ts';

/** the name the halo's own cycle is registered under, so a caller can `has`/`play` it knowingly */
export const HALO_ANIMATION = 'halo';

export interface HaloOptions {
	/** the halo's frames, as `Animation` takes them: textures, or `{ texture, duration, offsetX, offsetY }` */
	readonly frames: readonly AnimationFrameInput[];

	/** the cycle's timing, `fps`/`loop`/`startTime` */
	readonly animation?: AnimationOptions;

	/** where the halo sits relative to its target, in pixels: Wesnoth's `[halo] x`/`y` */
	readonly offsetX?: number;
	readonly offsetY?: number;

	/**
	 * How the halo is composited. Additive by default, which is what a glow wants and what Wesnoth's
	 * `[halo] blend_mode=add` asks for; `'normal'` is there for a halo that is only an overlay.
	 *
	 * The list stops at what a halo is for rather than at every mode the renderer has: a caller who
	 * wants another one sets the inherited `blendMode` property directly.
	 */
	readonly blendMode?: 'add' | 'normal' | 'multiply' | 'screen';
}

/**
 * The glow around a unit, an aura, a shrine's light: an animated sprite that follows a target and is
 * drawn additively.
 *
 * It is an `AnimatedSprite`, so frames may carry their own durations and offsets, and `update(dt)`
 * advances it exactly as it advances any other animation. Two things are its own: `follow`, which
 * applies the halo's offset once rather than in every game that draws one, and the blend mode.
 *
 * Z-order is the caller's, and that is not an oversight: a halo that should sit *behind* its unit is
 * added before it (`container.addChild(glow, glow2, unit)`), and one that should sit in front is
 * added after. A framework that guessed would be wrong half the time, and a game that wants the
 * glow to be part of the unit's own rotation adds it to the unit instead.
 *
 * @example
 * ```ts
 * import { Halo, HALO_ANIMATION, SpriteSheet } from '@datamoc/mw_games/two-d/render';
 *
 * declare const sheet: SpriteSheet;
 * declare const unit: { x: number; y: number };
 *
 * const glow = new Halo({ frames: sheet.range(20, 22), animation: { fps: 6 }, offsetY: -6 });
 * glow.follow(unit.x, unit.y);
 * glow.update(1 / 60);
 * console.log(glow.playing === HALO_ANIMATION); // true - a halo is always playing its own cycle
 * ```
 */
export class Halo extends AnimatedSprite {
	private readonly offsetX: number;
	private readonly offsetY: number;

	constructor(options: HaloOptions) {
		super();
		this.offsetX = options.offsetX ?? 0;
		this.offsetY = options.offsetY ?? 0;
		this.blendMode = options.blendMode ?? 'add';
		this.add(HALO_ANIMATION, options.frames, options.animation);
		this.play(HALO_ANIMATION);
	}

	/**
	 * Puts the halo where its target stands, with whatever offset it was built with. Call it whenever
	 * the target moves, or every frame - the halo's own position is never touched by its animation.
	 */
	follow(x: number, y: number): this {
		this.position.set(x + this.offsetX, y + this.offsetY);
		return this;
	}
}
