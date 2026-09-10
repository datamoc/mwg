/**
 * The screen-reader bridge.
 *
 * `mwg` draws to a canvas, which assistive technology sees as one opaque element: a message
 * box, a window title or a list selection is invisible to it no matter how readable it looks.
 * This mirrors text a game wants read out into a visually hidden DOM node with `aria-live`,
 * which the framework's own `Window` and `MessageBox` already use, and which a game can drive
 * for its own widgets through the shared `screenReader`.
 *
 * It no-ops where there is no DOM, so the same scene code runs under `node --test` and the
 * calls cost nothing there. `role="status"` and `aria-live="polite"` mean an announcement waits
 * for a pause; pass `assertive: true` for something that should interrupt (a death, an alarm).
 *
 * @example
 * ```ts
 * import { ScreenReader, screenReader } from '@datamoc/mw_games/two-d/ui';
 *
 * // the built-in widgets use the shared instance; a game can own a second region
 * const reader = new ScreenReader();
 * reader.announce('You found a rusty key.');
 * screenReader.announce('Your torch goes out!', { assertive: true });
 * reader.destroy();
 * ```
 */

//the standard visually-hidden recipe: present to a screen reader, zero-sized on screen
const HIDDEN =
	'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
	'clip:rect(0 0 0 0);white-space:nowrap;border:0;';

export class ScreenReader {
	private polite: HTMLElement | null = null;
	private assertive: HTMLElement | null = null;

	private region(assertive: boolean): HTMLElement | null {
		if (typeof document === 'undefined' || !document.body) return null;

		const existing = assertive ? this.assertive : this.polite;
		if (existing) return existing;

		const node = document.createElement('div');
		node.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
		node.setAttribute('aria-atomic', 'true');
		node.setAttribute('role', 'status');
		node.setAttribute('style', HIDDEN);
		document.body.appendChild(node);

		if (assertive) this.assertive = node;
		else this.polite = node;
		return node;
	}

	/**
	 * Reads `text` out at the next pause, or interrupting with `assertive`. The region is
	 * cleared first, so announcing the same string twice is two announcements rather than none.
	 */
	announce(text: string, options: { assertive?: boolean } = {}): void {
		const region = this.region(options.assertive ?? false);
		if (!region) return;

		region.textContent = '';
		region.appendChild(document.createTextNode(text));
	}

	/** empties both regions without removing them */
	clear(): void {
		if (this.polite) this.polite.textContent = '';
		if (this.assertive) this.assertive.textContent = '';
	}

	/** removes the regions; a later `announce` recreates them lazily */
	destroy(): void {
		this.polite?.remove();
		this.assertive?.remove();
		this.polite = null;
		this.assertive = null;
	}
}

/** the shared instance the built-in widgets announce through */
export const screenReader = new ScreenReader();
