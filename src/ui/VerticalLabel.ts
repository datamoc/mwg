import { Container, Text } from 'pixi.js';
import { theme, themeChanged, type Theme } from './theme.ts';

export interface GlyphLayout {
	char: string;
	x: number;
	y: number;
	rotate: boolean;
}

export interface VerticalLayoutOptions {
	lineHeight: number;
	/** a column wraps to a new one, further left, once it reaches this height */
	columnHeight: number;
	/** characters matching this are rotated a quarter turn rather than kept upright */
	rotate?: RegExp;
}

/** ASCII letters and digits read sideways in vertical Japanese/Chinese text by default */
const DEFAULT_ROTATE = /[A-Za-z0-9]/;

/**
 * The pure layout math behind `VerticalLabel`, kept separate from Pixi's `Text` so it can
 * be tested without a canvas - `Text` needs a real `document` to measure glyphs, which does
 * not exist outside a browser.
 *
 * Columns run right to left, each one top to bottom, which is the traditional order for
 * vertical Japanese and Chinese. `\n` in the source text forces a new column, the same way
 * it forces a new line in horizontal text.
 */
export function layoutVertical(text: string, options: VerticalLayoutOptions): GlyphLayout[] {
	const { lineHeight, columnHeight } = options;
	const rotate = options.rotate ?? DEFAULT_ROTATE;

	const glyphs: GlyphLayout[] = [];
	let column = 0;
	let row = 0;

	for (const char of text) {
		if (char === '\n') {
			column++;
			row = 0;
			continue;
		}
		if (row * lineHeight >= columnHeight) {
			column++;
			row = 0;
		}

		const doRotate = rotate.test(char);
		//`column` is 0 at the start; -0 * lineHeight is still -0, which is never a value worth
		//exposing over a plain 0
		const columnX = column === 0 ? 0 : -column * lineHeight;
		glyphs.push({
			char,
			x: doRotate ? columnX - lineHeight / 2 : columnX,
			y: doRotate ? row * lineHeight + lineHeight / 2 : row * lineHeight,
			rotate: doRotate,
		});
		row++;
	}

	return glyphs;
}

export interface VerticalLabelOptions {
	text: string;
	color?: number;
	size?: number;
	columnHeight: number;
	rotate?: RegExp;
}

/**
 * Text laid out top to bottom, column by column, right to left - vertical writing, which
 * canvas has no writing-mode for at all. Each character is its own `Text`, positioned by
 * `layoutVertical`; this is real per-glyph work, not a flag, which is why the README
 * schedules it separately from left-to-right/right-to-left (see `mwg/i18n`).
 *
 * What this does not do: tate-chu-yoko (shrinking a short latin/digit run to sit upright
 * within one column instead of rotating whole characters), and it does not reposition
 * punctuation to a cell's corner the way professionally typeset Japanese does. Both are
 * real refinements a native reader would want on top of this, not included here.
 */
export class VerticalLabel extends Container {
	private readonly opts: VerticalLabelOptions;
	private readonly themeListener = (t: Theme) => this.build(t);

	constructor(options: VerticalLabelOptions) {
		super();
		this.opts = options;
		this.build(theme());
		themeChanged.add(this.themeListener);
	}

	/** rebuilds every glyph from scratch - font family, and possibly size, both follow the theme */
	private build(t: Theme): void {
		this.removeChildren().forEach((child) => child.destroy());

		const size = this.opts.size ?? t.font.size;
		const lineHeight = Math.ceil(size * t.font.lineHeight);

		const glyphs = layoutVertical(this.opts.text, {
			lineHeight,
			columnHeight: this.opts.columnHeight,
			rotate: this.opts.rotate,
		});

		for (const glyph of glyphs) {
			const text = new Text({
				text: glyph.char,
				style: { fontFamily: t.font.family, fontSize: size, fill: this.opts.color ?? t.color.text },
			});

			if (glyph.rotate) {
				text.anchor.set(0.5);
				text.rotation = Math.PI / 2;
			}
			text.x = glyph.x;
			text.y = glyph.y;
			this.addChild(text);
		}
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}
