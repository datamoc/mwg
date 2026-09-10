/**
 * The one interpolation primitive every dt-driven feature wants: given a duration and a
 * function of progress, run it from 0 to 1 and resolve. `DialogueStage`'s fades and
 * `render.Camera`'s shake decay each used to hand-roll this same shape under a different
 * name; this is that shape, pulled out once.
 */
import { motionDuration, reducedMotion, type MotionIntent } from './Motion.ts';

export type Easing = (t: number) => number;

/** a small standard set, named the way CSS and most engines already do */
export const Easing: Record<
	'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic',
	Easing
> = {
	linear: (t) => t,
	easeInQuad: (t) => t * t,
	easeOutQuad: (t) => t * (2 - t),
	easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
	easeInCubic: (t) => t * t * t,
	easeOutCubic: (t) => 1 - (1 - t) ** 3,
	easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

export interface TweenOptions {
	/** defaults to `Easing.linear` */
	ease?: Easing;

	/**
	 * What the motion is for. `decorative` (the default: a slide, spin, zoom or anything
	 * large or peripheral) collapses under reduced motion; `meaningful` is shortened
	 * instead, so state that motion conveys is still readable. See `core.MotionIntent`.
	 */
	intent?: MotionIntent;

	/**
	 * A non-vestibular variant to run instead of `apply` under reduced motion, for the case
	 * the preference asks for rather than removal: `(t) => (sprite.alpha = t)` beside an
	 * `apply` that slides and fades. It runs over the shortened duration, not the full one.
	 * Not used when the preference is off.
	 */
	alternate?: (t: number) => void;
}

interface ActiveTween {
	elapsed: number;
	duration: number;
	ease: Easing;
	apply: (t: number) => void;
	resolve: () => void;
	/** a decorative motion finishes at once if the preference arrives mid-flight */
	finishOnReduced: boolean;
}

/**
 * Runs any number of concurrent tweens; a game or a widget drives it from its own `update(dt)`.
 *
 * @example
 * ```ts
 * import { Tweener, Easing } from '@datamoc/mw_games/core';
 *
 * const tweener = new Tweener();
 * const sprite = { alpha: 0 };
 *
 * tweener.tween(0.5, (t) => { sprite.alpha = t; }, Easing.easeOutQuad);
 *
 * // in the game loop:
 * tweener.update(1 / 60);
 * ```
 */
export class Tweener {
	private tweens: ActiveTween[] = [];

	/**
	 * Runs `apply` with progress eased from 0 to 1 over `duration` seconds, resolving once it
	 * reaches 1. A non-positive duration applies the end state at once rather than waiting a
	 * frame for it, and so does a `decorative` motion under reduced motion
	 * (`core.reducedMotion`); a `meaningful` one is shortened instead, and an `alternate`
	 * replaces it outright. See `TweenOptions`.
	 */
	tween(duration: number, apply: (t: number) => void, options: Easing | TweenOptions = Easing.linear): Promise<void> {
		const {
			ease = Easing.linear,
			intent = 'decorative',
			alternate,
		} = typeof options === 'function' ? { ease: options } : options;

		//the alternate *replaces* the motion, so it runs even though the original is a trigger
		const substituting = reducedMotion() && alternate !== undefined;
		const run = substituting ? alternate : apply;
		const effective = motionDuration(duration, substituting ? 'meaningful' : intent);

		if (!(effective > 0)) {
			run(1);
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			this.tweens.push({
				elapsed: 0,
				duration: effective,
				ease,
				apply: run,
				resolve,
				finishOnReduced: !substituting && intent === 'decorative',
			});
		});
	}

	update(dt: number): void {
		if (this.tweens.length === 0) return;

		//iterate a copy: a tween's resolve may start another, which must not be advanced
		//again within this same update
		for (const tween of [...this.tweens]) {
			//the preference can arrive while this is running; a decorative motion has no
			//reason to keep moving once it does
			if (tween.finishOnReduced && reducedMotion()) {
				this.tweens.splice(this.tweens.indexOf(tween), 1);
				tween.apply(1);
				tween.resolve();
				continue;
			}

			tween.elapsed += dt;
			const t = Math.min(1, tween.elapsed / tween.duration);
			tween.apply(tween.ease(t));

			if (t >= 1) {
				this.tweens.splice(this.tweens.indexOf(tween), 1);
				tween.resolve();
			}
		}
	}

	/** true while any tween is still running */
	get isBusy(): boolean {
		return this.tweens.length > 0;
	}

	/** drops every running tween without applying its end state or resolving it - a teardown, not a completion */
	clear(): void {
		this.tweens = [];
	}
}
