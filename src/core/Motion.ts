/**
 * Reduced motion, in one place: whether the things that move, shake or flash should instead
 * arrive at their end state, be replaced by a milder variant, or keep going shortened.
 *
 * `reducedMotion()` follows the OS preference (`prefers-reduced-motion: reduce`) where a
 * browser exposes it, and a game's own settings screen can override it with
 * `setReducedMotion(true)` / `setReducedMotion(false)`; `setReducedMotion(null)` hands the
 * decision back to the OS. `watchReducedMotion` reports a change while the game is running,
 * and `motionDuration` is the policy for how long a motion should then take.
 *
 * The preference is not "no animation". WebKit's "Responsive Design for Motion" is explicit
 * that removing motion that carries meaning makes an interface worse ("Don't Reduce Too
 * Much"), while scaling, zooming, spinning, parallax and peripheral movement are the triggers
 * that make people ill. So a caller classifies a motion: a `decorative` one (the default:
 * slides, zooms, spins, anything large or peripheral) collapses to nothing, a `meaningful` one
 * is shortened rather than deleted, and a caller that has a non-vestibular variant passes it
 * to `Tweener.tween` as an `alternate` (a fade where a slide was).
 *
 * @example
 * ```ts
 * import {
 *   motionDuration,
 *   prefersReducedMotion,
 *   reducedMotion,
 *   setReducedMotion,
 *   watchReducedMotion,
 * } from '@datamoc/mw_games/core';
 *
 * console.log(prefersReducedMotion()); // the OS preference
 * console.log(reducedMotion()); // the effective answer, override included
 * console.log(motionDuration(0.4)); // 0 while reduced, 0.4 otherwise
 *
 * const stop = watchReducedMotion((reduced) => console.log('reduced motion:', reduced));
 * setReducedMotion(true); // a game's own "reduce motion" settings toggle, and it fires the watcher
 * setReducedMotion(null); // back to following the OS
 * stop();
 * ```
 */
import { Signal } from './Signal.ts';

/** what a motion is for, which decides what reduced motion does to it */
export type MotionIntent = 'decorative' | 'meaningful';

/** the longest a meaningful motion runs under reduced motion: short, but not a cut */
const REDUCED_MOTION_DURATION = 0.12;

let override: boolean | null = null;
let cached: MediaQueryList | null | undefined;

/** fires on an OS change and on a game's own `setReducedMotion` call */
const changed = new Signal<boolean>();

function mediaQuery(): MediaQueryList | null {
	if (cached === undefined) {
		cached = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
		if (cached) {
			const onChange = (): void => {
				changed.dispatch(reducedMotion());
			};
			//`addListener` is the deprecated pre-Safari-14 spelling; support both rather than
			//assume one, since the media query outlives any single browser version
			if (typeof cached.addEventListener === 'function') cached.addEventListener('change', onChange);
			else if (typeof cached.addListener === 'function') cached.addListener(onChange);
		}
	}
	return cached;
}

/** the OS preference, false where there is no `matchMedia` (tests, non-browser hosts) */
export function prefersReducedMotion(): boolean {
	return mediaQuery()?.matches ?? false;
}

/** the effective answer: a game's override, else the OS preference */
export function reducedMotion(): boolean {
	return override ?? prefersReducedMotion();
}

/** `true`/`false` forces it; `null` clears the override and follows the OS again */
export function setReducedMotion(value: boolean | null): void {
	override = value;
	changed.dispatch(reducedMotion());
}

/**
 * Calls `listener` whenever the effective preference changes, whether the OS setting moved or
 * a game called `setReducedMotion`. It does not fire immediately: `reducedMotion()` is the
 * current value. A long-lived animation (a parallax layer, a looping background) subscribes
 * so it can stop mid-flight rather than at its next spawn or start.
 *
 * @returns a function that stops watching
 */
export function watchReducedMotion(listener: (reduced: boolean) => void): () => void {
	mediaQuery(); //make sure the change listener exists even if nobody read the value yet
	changed.add(listener);
	return () => changed.remove(listener);
}

/**
 * The duration a motion should actually take.
 *
 * A `decorative` motion (the default) collapses to zero under reduced motion, which is what
 * "reduce" means for a slide, spin or zoom. A `meaningful` motion, one that conveys state
 * rather than moving the viewer through space, is shortened instead of deleted, so a health
 * bar still visibly fills and a selection still visibly moves.
 */
export function motionDuration(duration: number, intent: MotionIntent = 'decorative'): number {
	if (!reducedMotion()) return duration;
	return intent === 'meaningful' ? Math.min(duration, REDUCED_MOTION_DURATION) : 0;
}
