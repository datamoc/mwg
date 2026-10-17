import { CanvasTextMetrics, type TextStyle } from 'pixi.js';

/**
 * Pixi measures text by drawing it to a canvas, which `node --test` does not have, so anything that
 * reads a `Label`'s width (a `Button` with a caption lays itself out from it) throws here. This
 * replaces the measurement with a fixed one: every glyph is `glyphWidth` wide and a line is the font
 * size tall, enough for layout tests to read sizes that depend on the text.
 */
export function installFakeTextMetrics(glyphWidth = 8): void {
	CanvasTextMetrics.measureText = (text: string, style: TextStyle) => {
		const size = Number(style.fontSize) || 16;
		const lines = text.split('\n');
		const widths = lines.map((line) => line.length * glyphWidth);
		const width = Math.max(0, ...widths);
		const height = size * lines.length;
		return new CanvasTextMetrics(text, style, width, height, lines, widths, size, width, {
			ascent: size * 0.8,
			descent: size * 0.2,
			fontSize: size,
		});
	};
}
