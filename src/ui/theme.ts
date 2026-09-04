import type { Texture } from 'pixi.js';
import type { Direction } from '../i18n/index.ts';
import { Signal } from '../core/Signal.ts';

/**
 * How the interface looks.
 *
 * Widgets read from here rather than carrying their own colours, so a game restyles its
 * whole interface by assigning one object. Everything has a default that works, so a game
 * that does not care never has to think about it.
 */
export interface Theme {
	/** the panel texture behind windows; without one, windows draw a flat rectangle */
	panel?: Texture;

	/** how many pixels of `panel` are its fixed border */
	panelBorder: number;

	/** space between a window's frame and its contents */
	padding: number;

	/** space between stacked items in a list */
	spacing: number;

	font: {
		family: string;
		size: number;
		/** distance between baselines, as a multiple of size */
		lineHeight: number;
	};

	color: {
		text: number;
		textDim: number;
		textHighlight: number;
		/** used for the flat panel when no texture is set */
		panelFill: number;
		panelBorder: number;
		selection: number;
		/** the dim layer behind a modal window */
		overlay: number;
	};

	/** opacity of the layer behind a modal window, 0 to 1 */
	overlayAlpha: number;

	/**
	 * What widgets lay themselves out against, instead of a hardcoded "left".
	 *
	 * A game with `mwg/i18n` sets this from `I18n.direction()` whenever the active language
	 * changes; a game without it never has to think about the field at all.
	 */
	direction: Direction;
}

export const defaultTheme: Theme = {
	panelBorder: 4,
	padding: 8,
	spacing: 2,
	direction: 'ltr',
	font: {
		//a stack rather than one name, so a missing font degrades instead of disappearing
		family: 'ui-monospace, Consolas, "DejaVu Sans Mono", monospace',
		size: 12,
		lineHeight: 1.4,
	},
	color: {
		text: 0xe8e8f0,
		textDim: 0x8a8a96,
		textHighlight: 0xffe680,
		panelFill: 0x1c1c26,
		panelBorder: 0x4a4a5e,
		selection: 0x3a4a7a,
		overlay: 0x000000,
	},
	overlayAlpha: 0.5,
};

let current: Theme = defaultTheme;

export function theme(): Theme {
	return current;
}

/**
 * Fired with the new theme every time `setTheme` runs.
 *
 * `theme()` is read once, at construction, by every built-in widget - calling `setTheme`
 * changes nothing about what is already on screen. A widget that wants to restyle itself for
 * a day/night palette swap or a light/dark toggle subscribes here and reapplies its own style
 * from the value passed in, the same shape `i18n`'s `direction` already flows into
 * `theme.direction` from a game's own glue code. Every built-in widget already does this.
 */
export const themeChanged = new Signal<Theme>();

/** replaces the theme; partial objects are merged over the default */
export function setTheme(next: Partial<Theme>): void {
	current = {
		...defaultTheme,
		...next,
		font: { ...defaultTheme.font, ...next.font },
		color: { ...defaultTheme.color, ...next.color },
	};
	themeChanged.dispatch(current);
}
