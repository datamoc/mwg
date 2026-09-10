import type { Theme } from './theme.ts';

/**
 * The text options `Label` and `BitmapLabel` share. Each one extends this with whatever its
 * own renderer needs (`Label` adds stroke/resolution/roundPixels); the shared fields stay in
 * one place so the two labels cannot drift apart on what "themed text" accepts.
 */
export interface ThemedTextOptions {
	text?: string;
	color?: number;
	size?: number;
	/** wraps at this width in pixels; omit for a single unwrapped line */
	wrapWidth?: number;
	align?: 'left' | 'center' | 'right';
	bold?: boolean;
}

/** accepts the `options | string` shorthand both labels offer in their constructors */
export function normalizeTextOptions<T extends ThemedTextOptions>(options: T | string): T {
	return typeof options === 'string' ? ({ text: options } as T) : options;
}

/** the align a label uses when the game gave none: the theme direction, not a fixed left */
export function themedAlign(opts: ThemedTextOptions, t: Theme): 'left' | 'center' | 'right' {
	return opts.align ?? (t.direction === 'rtl' ? 'right' : 'left');
}
