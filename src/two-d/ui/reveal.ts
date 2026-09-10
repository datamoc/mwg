/**
 * Progressive text display - the typewriter reveal every dialogue box wants, shared
 * rather than reimplemented per widget. `MessageBox` pages, `Label` lines and `RichLabel`
 * markdown all run on this one character count; what differs is only what each widget
 * counts (`Label` counts string characters, `RichLabel` visible ones via
 * `sliceSpans`, markers excluded) and who calls `advanceReveal` each frame.
 *
 * Pure logic, no Pixi dependency: a game driving its own reveal (a title screen, a
 * tutorial toast) can use this without any widget at all.
 *
 * @example
 * ```ts
 * import { startReveal, advanceReveal, completeReveal, revealComplete } from '@datamoc/mw_games/two-d/ui';
 *
 * const reveal = startReveal('Hello.'.length, 40);
 * advanceReveal(reveal, 0.5); // 20 characters per half second at speed 40
 * revealComplete(reveal); // false
 * completeReveal(reveal); // skip ahead, for a confirm press mid-reveal
 * revealComplete(reveal); // true
 * ```
 */
export interface RevealState {
	/** characters to reveal in total, counted the caller's way */
	total: number;
	/** characters per second; 0 starts fully revealed */
	speed: number;
	/** characters revealed so far, possibly fractional between frames */
	revealed: number;
}

/** starts a reveal; a zero speed (or zero length) is already complete, like `MessageBox` */
export function startReveal(total: number, speed = 40): RevealState {
	const safe = Math.max(0, total);
	return { total: safe, speed: Math.max(0, speed), revealed: speed === 0 ? safe : 0 };
}

/**
 * Moves the reveal forward by `dt` seconds, clamped to the total. Returns whether the
 * reveal is now complete, so a game can prompt, auto-advance, or play a blip on the
 * exact frame the last character lands.
 */
export function advanceReveal(state: RevealState, dt: number): boolean {
	state.revealed = Math.min(state.total, Math.max(0, state.revealed + state.speed * dt));
	return revealComplete(state);
}

/** shows everything at once - the confirm-press-skips-the-reveal behaviour */
export function completeReveal(state: RevealState): void {
	state.revealed = state.total;
}

export function revealComplete(state: RevealState): boolean {
	return state.revealed >= state.total;
}
