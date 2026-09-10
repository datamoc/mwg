/**
 * Reduced motion, in one place: whether the things that move, shake or flash should instead
 * arrive at their end state.
 *
 * `reducedMotion()` follows the OS preference (`prefers-reduced-motion: reduce`) where a
 * browser exposes it, and a game's own settings screen can override it with
 * `setReducedMotion(true)` / `setReducedMotion(false)`; `setReducedMotion(null)` hands the
 * decision back to the OS. The framework's `Tweener`, `Camera`, `ScreenEffects` and
 * `ParticleEmitter` already consult it, so a game that calls nothing still respects the
 * preference on the paths it uses, and a game with its own motion can check the same answer.
 *
 * @example
 * ```ts
 * import { prefersReducedMotion, reducedMotion, setReducedMotion } from '@datamoc/mw_games/core';
 *
 * console.log(prefersReducedMotion()); // the OS preference
 * console.log(reducedMotion()); // the effective answer, override included
 *
 * setReducedMotion(true); // a game's own "reduce motion" settings toggle
 * setReducedMotion(null); // back to following the OS
 * ```
 */
let override: boolean | null = null;
let cached: MediaQueryList | null | undefined;

/** the OS preference, false where there is no `matchMedia` (tests, non-browser hosts) */
export function prefersReducedMotion(): boolean {
	if (cached === undefined) {
		cached = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
	}
	return cached?.matches ?? false;
}

/** the effective answer: a game's override, else the OS preference */
export function reducedMotion(): boolean {
	return override ?? prefersReducedMotion();
}

/** `true`/`false` forces it; `null` clears the override and follows the OS again */
export function setReducedMotion(value: boolean | null): void {
	override = value;
}
