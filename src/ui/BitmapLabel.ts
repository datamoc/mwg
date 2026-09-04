import { BitmapText } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import { theme, themeChanged, type Theme } from './theme.ts';

export interface BitmapLabelOptions {
	text?: string;
	color?: number;
	size?: number;
	/** wraps at this width in pixels; omit for a single unwrapped line */
	wrapWidth?: number;
	align?: 'left' | 'center' | 'right';
	bold?: boolean;
}

/**
 * A piece of text baked into a glyph-atlas texture instead of rasterised fresh on every
 * change, the way `Label` (a thin wrapper over Pixi's `Text`) does. `Label`'s own doc
 * comment already names the cost this exists to avoid: "wasteful for something updated
 * every frame". A live HUD counter, a scrolling log, or a fixed pixel font a pixel-art game
 * wants for all its UI copy are what this is for; a game whose text rarely changes has no
 * reason to prefer it over `Label`.
 *
 * Pixi generates and caches the underlying bitmap font itself the first time a given
 * family/size/colour/weight combination is used (see `BitmapText`'s "Dynamic Bitmap Fonts"
 * behaviour) - nothing here downloads or ships a font file, keeping this the same
 * generated-not-borrowed shape as every other asset in this project.
 */
export class BitmapLabel extends BitmapText {
	private readonly opts: BitmapLabelOptions;
	private readonly themeListener = (t: Theme) => this.restyle(t);

	constructor(options: BitmapLabelOptions | string = {}) {
		const opts = typeof options === 'string' ? { text: options } : options;
		const t = theme();

		super({
			text: opts.text ?? '',
			style: bitmapLabelStyle(opts, t),
		});

		this.opts = opts;
		themeChanged.add(this.themeListener);
	}

	/** avoids the atlas relookup when the text has not actually changed */
	setText(value: string): void {
		if (this.text !== value) this.text = value;
	}

	/**
	 * Reapplies whichever style fields were never given an explicit option, so an explicit
	 * `color`/`size` a game passed in survives a theme change untouched while anything left
	 * to the theme's own defaults picks up the new one - the same rule `Label.restyle` follows.
	 */
	private restyle(t: Theme): void {
		this.style = bitmapLabelStyle(this.opts, t);
	}

	override destroy(options?: Parameters<BitmapText['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

/** the pure style-mapping `BitmapLabel` builds its underlying `BitmapText` style from, exported for testing without constructing a `BitmapText` (which needs a real DOM `document`, unlike `Text`) */
export function bitmapLabelStyle(opts: BitmapLabelOptions, t: Theme): TextStyleOptions {
	return {
		fontFamily: t.font.family,
		fontSize: opts.size ?? t.font.size,
		fontWeight: opts.bold ? 'bold' : 'normal',
		fill: opts.color ?? t.color.text,
		align: opts.align ?? (t.direction === 'rtl' ? 'right' : 'left'),
		wordWrap: opts.wrapWidth !== undefined,
		wordWrapWidth: opts.wrapWidth ?? 0,
		breakWords: true,
	};
}
