import { Container } from 'pixi.js';

import { dispatchAction, dispatchText, type Action } from '../../core/Input.ts';
import { Button } from './Button.ts';
import { theme } from './theme.ts';

/** one key: what it is labelled, what it types, or which action it fires */
export interface KeyboardKey {
	/** the key's own caption */
	label: string;
	/**
	 * What the key types through `core.Input`'s `onText`. Defaults to `label`, so an
	 * ordinary letter key is just `{ label: 'A' }`; a wider gap or an accented glyph
	 * can say `{ label: 'a`', text: 'à' }`.
	 */
	text?: string;
	/**
	 * The named action the key fires instead of typing - `backspace`/`delete`/`left`/
	 * `right`/`confirm`/`cancel`, the same vocabulary a physical key is bound to. A
	 * key with an action types nothing.
	 */
	action?: Action;
	/** row units wide; a space bar is wide, an ordinary key is 1. Default 1 */
	span?: number;
}

/**
 * Rows of keys as plain data - the shape a game authors, never code. Ragged rows are
 * fine: each starts at the left edge and ends where it ends.
 */
export interface KeyboardLayout {
	/** the rows, top to bottom */
	rows: KeyboardKey[][];
}

const letters = (word: string): KeyboardKey[] => word.split('').map((label) => ({ label }));

/**
 * One shipped default: the uppercase alphabet over a digit row, then the editing tail
 * (`Bksp`, caret moves, space, `OK`, `Esc`). A game with its own needs - digits only, a
 * seed code's letters and hyphens - authors its own layout; the default exists so a
 * first game does not start from a blank page.
 */
export const UPPERCASE_KEYBOARD: KeyboardLayout = {
	rows: [
		letters('QWERTYUIOP'),
		letters('ASDFGHJKL'),
		letters('ZXCVBNM'),
		letters('1234567890'),
		[
			{ label: 'Bksp', action: 'backspace' },
			{ label: 'Left', action: 'left' },
			{ label: 'Right', action: 'right' },
			{ label: 'Space', text: ' ', span: 3 },
			{ label: 'OK', action: 'confirm' },
			{ label: 'Esc', action: 'cancel' },
		],
	],
};

/**
 * What pressing a key does: a typing key feeds `core.Input`'s `onText`, an action key
 * fires its action through `onAction` - the same two paths a physical key travels, so
 * a prompt or menu cannot tell an on-screen tap from a keyboard press. Pure, so the
 * dispatch semantics are testable without a renderer.
 */
export function pressKey(key: KeyboardKey): void {
	if (key.action !== undefined) dispatchAction(key.action);
	else dispatchText(key.text ?? key.label);
}

/** where one laid-out key sits, and which key it is */
export interface LaidOutKey {
	key: KeyboardKey;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The rows-to-buttons arithmetic as a pure function: a row's span units share its width
 * minus the gaps, wide keys take their units plus the gaps between them, and rows stack
 * at a fixed height. The class below is the thin Button shell over this.
 */
export function layoutKeys(
	layout: KeyboardLayout,
	options: { width: number; keyHeight: number; gap: number },
): LaidOutKey[] {
	const laid = [];
	let y = 0;
	for (const row of layout.rows) {
		const units = row.reduce((sum, key) => sum + (key.span ?? 1), 0);
		//a row is span-units wide with a gap between every unit slot, so a span-S key
		//covers S slots plus its internal gaps and the row consumes its width exactly
		const unitWidth = (options.width - options.gap * (units - 1)) / units;
		let x = 0;
		for (const key of row) {
			const span = key.span ?? 1;
			const width = unitWidth * span + options.gap * (span - 1);
			laid.push({ key, x, y, width, height: options.keyHeight });
			x += width + options.gap;
		}
		y += options.keyHeight + options.gap;
	}
	return laid;
}

/**
 * An on-screen keyboard: rows of keys as data, rendered through the theme's own
 * `Button`, each tap pressing its key through `pressKey` - `dispatchText` for a typing
 * key, `dispatchAction` for an action key - so a `TextPrompt` (or any listener of
 * `onText`/`onAction`) cannot tell the tap from a physical key press. Pointer-only
 * devices get a way to type; nothing game-specific lives here.
 *
 * @example
 * ```ts
 * import { OnScreenKeyboard, UPPERCASE_KEYBOARD } from '@datamoc/mw_games/two-d/ui';
 * import type { Container2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const layer: Container2D;
 *
 * const keyboard = new OnScreenKeyboard(UPPERCASE_KEYBOARD, { width: 320 });
 * keyboard.x = 20;
 * keyboard.y = 240;
 * layer.addChild(keyboard);
 * // taps type through core.Input, exactly like a physical key
 * ```
 */
export class OnScreenKeyboard extends Container {
	private readonly laidOutHeight: number;

	constructor(layout: KeyboardLayout, options: { width: number }) {
		super();
		const gap = theme().spacing;
		const keyHeight = Math.max(theme().font.size * 2, 18);

		let maxY = 0;
		for (const laid of layoutKeys(layout, { width: options.width, keyHeight, gap })) {
			const button = new Button({
				width: laid.width,
				height: laid.height,
				text: laid.key.label,
				onClick: () => pressKey(laid.key),
			});
			button.position.set(laid.x, laid.y);
			this.addChild(button);
			maxY = Math.max(maxY, laid.y + laid.height);
		}
		this.laidOutHeight = maxY;
	}

	/** the laid-out height, so a host window can size itself to the keyboard */
	get contentHeight(): number {
		return this.laidOutHeight;
	}
}
