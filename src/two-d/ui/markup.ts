import type { MarkdownSpan } from './markdown.ts';

/**
 * One run of styled text from inline markup.
 *
 * It is a `MarkdownSpan` with what markup can say and markdown cannot, so anything that renders
 * markdown can render this: colour, a size, and a span that is an image rather than text. Colour and
 * size are kept as written (`red`, `#c0ffee`, `14`) because resolving them is the renderer's
 * business, not this parser's - which is what makes the contract renderer-neutral, and why an image
 * span carries a path for whoever asked rather than a texture.
 */
export interface MarkupSpan extends MarkdownSpan {
	/** a named or explicit colour, as written: `color='red'`, `color='#c0ffee'` */
	color?: string;
	/** a font size in pixels, as written: `size='14'` */
	size?: number;
	/** an image rather than text: `<img>path</img>`; the `text` of such a span is empty */
	image?: string;
}

export interface MarkupOptions {
	/**
	 * What a `$name` in the text becomes. A name that is not here is left as it was written, which is
	 * what Wesnoth does with an unset variable - dropping it would silently eat a player's name.
	 */
	readonly variables?: Readonly<Record<string, string>>;
}

/** the tags this parser knows; anything else is literal text, not a tag */
const KNOWN_TAGS = new Set(['b', 'i', 'span', 'br', 'img']);

interface Style {
	bold: boolean;
	italic: boolean;
	color?: string;
	size?: number;
}

interface Tag {
	readonly name: string;
	readonly closing: boolean;
	readonly selfClosing: boolean;
	/** what stood between the name and the `>`: attributes for `span`/`img`, nothing for `br` */
	readonly body: string;
	/** index of the `>` */
	readonly end: number;
}

/**
 * Reads `source` as inline markup and returns one span per styled run.
 *
 * Known tags are `<b>`, `<i>`, `<span color='…' size='…'>`, `<br/>` (or `<br>`, which becomes a
 * newline in the text) and `<img>path</img>` (or `<img src='path'/>`). Nesting works the way it
 * reads: a `<b>` inside an `<i>` is both, and a closing tag restores exactly the style it opened
 * over. `&lt;`, `&gt;`, `&amp;`, `&quot;` and `&apos;` are the escapes for the characters that would
 * otherwise be syntax.
 *
 * Two rules are deliberate, because content written by hand meets both. An **unknown or malformed**
 * tag - `<blink>`, a `</b>` that closes nothing, an `<img>` with no `</img>` - is kept literally in
 * the text rather than dropped or guessed at, so the worst case is text that reads oddly instead of
 * text that lost a piece. And a `$name` that nothing supplies is kept literally too, for the same
 * reason.
 *
 * @example
 * ```ts
 * import { escapeHtml, markupToHtml, parseMarkup, stripMarkup } from '@datamoc/mw_games/two-d/ui';
 *
 * const spans = parseMarkup("Hail, <b>$name</b>! <span color='#c0ffee'>Four</span> coins<br/>And an<img>gold.png</img>", {
 *   variables: { name: 'Kalenz' },
 * });
 *
 * console.log(spans[1]); // { text: 'Kalenz', bold: true, italic: false }
 * console.log(spans[2]); // { text: 'Four', bold: false, italic: false, color: '#c0ffee' }
 * console.log(spans[3].text); // '\nAnd an'
 * console.log(spans[4].image); // 'gold.png'
 * console.log(stripMarkup('<b>Bold</b> and <i>italic</i>')); // 'Bold and italic'
 * console.log(markupToHtml(spans)); // escaped text with <b>/<i> around the emphasis
 * ```
 */
export function parseMarkup(source: string, options: MarkupOptions = {}): MarkupSpan[] {
	const variables = options.variables ?? {};
	const spans: MarkupSpan[] = [];
	const stack: { tag: string; style: Style }[] = [];
	let style: Style = { bold: false, italic: false };
	let text = '';

	const flush = (): void => {
		if (!text) return;
		const span: MarkupSpan = { text, bold: style.bold, italic: style.italic };
		if (style.color !== undefined) span.color = style.color;
		if (style.size !== undefined) span.size = style.size;
		spans.push(span);
		text = '';
	};

	for (let index = 0; index < source.length; index++) {
		const char = source[index];

		if (char === '&') {
			const entity = readEntity(source, index);
			if (entity) {
				text += entity.text;
				index = entity.end;
				continue;
			}
		}

		if (char === '$') {
			const variable = readVariable(source, index);
			const value = variable ? variables[variable.name] : undefined;
			if (variable && value !== undefined) {
				text += value;
				index = variable.end;
				continue;
			}
		}

		if (char === '<') {
			const tag = readTag(source, index);
			if (tag && KNOWN_TAGS.has(tag.name)) {
				if (tag.name === 'img') {
					const image = readImage(source, tag);
					if (image) {
						flush();
						spans.push({ text: '', bold: false, italic: false, image: image.src });
						index = image.end;
						continue;
					}
				} else if (tag.name === 'br') {
					text += '\n';
					index = tag.end;
					continue;
				} else if (!tag.closing) {
					//flush before the style moves: the text so far belongs to the style it was written
					//in, and accumulating across a tag would give all of it the last style seen
					flush();
					stack.push({ tag: tag.name, style });
					style = opened(style, tag.name, tag.body);
					index = tag.end;
					continue;
				} else {
					const top = stack[stack.length - 1];
					if (top?.tag === tag.name) {
						flush();
						style = top.style;
						stack.pop();
						index = tag.end;
						continue;
					}
				}
			}
		}

		text += char;
	}

	flush();
	return spans;
}

/** The same text with the markup taken out, for a place that cannot render any of it. */
export function stripMarkup(source: string, options: MarkupOptions = {}): string {
	return parseMarkup(source, options)
		.map((span) => span.image ?? span.text)
		.join('');
}

/**
 * Spans as an HTML fragment for a renderer that speaks HTML text, which is what the ui's `RichLabel`
 * is. Emphasis, colour and size all render - `HTMLText`'s dialect is real CSS, so a `color`/`size`
 * span becomes a `<span style="...">` wrapper - and the text is escaped, so `a < b` can never turn
 * into a tag. An image span renders as nothing here: `HTMLText` has no inline-image primitive, so a
 * caller that wants the image drawn positions a sprite itself, at the position `layoutMarkupLines`
 * reports for that span.
 */
export function markupToHtml(spans: readonly MarkupSpan[]): string {
	return spans
		.map((span) => {
			if (span.image !== undefined) return '';
			let text = escapeHtml(span.text);
			if (span.italic) text = `<i>${text}</i>`;
			if (span.bold) text = `<b>${text}</b>`;
			const style = [
				span.color !== undefined ? `color:${span.color}` : undefined,
				span.size !== undefined ? `font-size:${span.size}px` : undefined,
			].filter((declaration): declaration is string => declaration !== undefined);
			if (style.length > 0) text = `<span style="${style.join(';')}">${text}</span>`;
			return text;
		})
		.join('');
}

/**
 * The plain-text projection for a place that cannot render any markup at all - a screen reader, a
 * log line, a tooltip that only takes a string. Unlike `stripMarkup` (which keeps an image span's
 * raw path, useful for round-tripping but not for reading aloud), an image becomes `describeImage`'s
 * result, defaulting to `[image]` so an image is at least announced as present rather than silently
 * dropped or read as a file path.
 *
 * @example
 * ```ts
 * import { markupAccessibilityText, parseMarkup } from '@datamoc/mw_games/two-d/ui';
 *
 * const spans = parseMarkup("Pay <b>10</b> gold<img>coin.png</img>");
 * console.log(markupAccessibilityText(spans)); // 'Pay 10 gold[image]'
 * console.log(markupAccessibilityText(spans, { describeImage: () => ' (coin icon)' }));
 * // 'Pay 10 gold (coin icon)'
 * ```
 */
export function markupAccessibilityText(
	spans: readonly MarkupSpan[],
	options: { describeImage?: (path: string) => string } = {},
): string {
	const describeImage = options.describeImage ?? (() => '[image]');
	return spans.map((span) => (span.image !== undefined ? describeImage(span.image) : span.text)).join('');
}

/** One already-measured, already-wrapped line: the spans that belong on it, and its total width. */
export interface MarkupLine {
	readonly spans: readonly MarkupSpan[];
	readonly width: number;
}

/**
 * Measures one atomic layout piece - a word, a single space, or an image span - under whatever
 * style it carries. A canvas backend measures with `TextMetrics`; a fixed-width test double can
 * measure with a plain character count. `piece.image` is set instead of `piece.text` for an image
 * span, so a measurer can give it the icon's own width rather than treating it as zero-width text.
 */
export type MarkupMeasure = (piece: Pick<MarkupSpan, 'text' | 'bold' | 'italic' | 'size' | 'image'>) => number;

/**
 * Wraps already-parsed spans into lines, word by word, each word measured under its own span's
 * style - which is the acceptance this item was missing: wrapping computed *after* styling, not
 * before it, so a bold or larger run wraps where its own wider glyphs actually land rather than
 * where the plain text would have. An explicit line break (`<br/>`, which `parseMarkup` turns into
 * a literal `\n`) always starts a new line; otherwise a word moves to the next line only once it
 * would overflow `maxWidth`, so a single word wider than `maxWidth` still renders (not clipped) as
 * ever a caller's original design.
 *
 * Backend-neutral by construction: the same spans, the same `measure` function and the same
 * `maxWidth` given to `layoutMarkupLines` decide the exact same line breaks whether the caller then
 * draws each line through `markupToHtml`/`HTMLText` or through a canvas `Text2D` per run - which is
 * what makes the two backends render "equivalent runs" rather than each doing its own wrapping.
 *
 * @example
 * ```ts
 * import { layoutMarkupLines, parseMarkup } from '@datamoc/mw_games/two-d/ui';
 *
 * const spans = parseMarkup('Take <b>two small</b> coins');
 * const lines = layoutMarkupLines(spans, (piece) => piece.text.length * 8, 100);
 * console.log(lines.map((line) => line.spans.map((span) => span.text).join('')));
 * ```
 */
export function layoutMarkupLines(
	spans: readonly MarkupSpan[],
	measure: MarkupMeasure,
	maxWidth: number,
): MarkupLine[] {
	type Piece = MarkupSpan & { readonly hardBreak?: boolean };
	const pieces: Piece[] = [];
	for (const span of spans) {
		if (span.image !== undefined) {
			pieces.push({ ...span });
			continue;
		}
		const parts = span.text.split('\n');
		parts.forEach((part, index) => {
			if (index > 0) pieces.push({ text: '', bold: span.bold, italic: span.italic, hardBreak: true });
			for (const word of part.match(/\S+|\s+/g) ?? []) {
				pieces.push({ text: word, bold: span.bold, italic: span.italic, color: span.color, size: span.size });
			}
		});
	}

	const lines: MarkupLine[] = [];
	let current: Piece[] = [];
	let width = 0;

	const flushLine = (): void => {
		//trailing whitespace never counts toward a line's own width or survives into it
		while (
			current.length > 0 &&
			current[current.length - 1].text.trim() === '' &&
			!current[current.length - 1].image
		) {
			width -= measure(current[current.length - 1]);
			current.pop();
		}
		lines.push({ spans: mergeMarkupSpans(current), width: Math.max(0, width) });
		current = [];
		width = 0;
	};

	for (const piece of pieces) {
		if (piece.hardBreak) {
			flushLine();
			continue;
		}
		const pieceWidth = measure(piece);
		const isSpace = piece.image === undefined && piece.text.trim() === '';
		if (width > 0 && !isSpace && width + pieceWidth > maxWidth) flushLine();
		current.push(piece);
		width += pieceWidth;
	}
	if (current.length > 0 || lines.length === 0) flushLine();

	return lines;
}

function mergeMarkupSpans(pieces: readonly MarkupSpan[]): MarkupSpan[] {
	const merged: MarkupSpan[] = [];
	for (const piece of pieces) {
		const last = merged[merged.length - 1];
		if (
			last &&
			piece.image === undefined &&
			last.image === undefined &&
			last.bold === piece.bold &&
			last.italic === piece.italic &&
			last.color === piece.color &&
			last.size === piece.size
		) {
			last.text += piece.text;
		} else {
			merged.push({ ...piece });
		}
	}
	return merged;
}

/** a line's flow direction; the same values `i18n.direction()` reports */
export type MarkupDirection = 'ltr' | 'rtl';

/** where a line sits within the wrap width, when it is shorter than that width */
export type MarkupAlign = 'left' | 'center' | 'right';

/** One run of a laid-out line, already measured and placed. */
export interface PositionedMarkupSpan {
	/** the span this run draws; `image` is set for an image run, `text` otherwise */
	readonly span: MarkupSpan;
	/** left edge of the run, in the same coordinate space the line was measured in */
	readonly x: number;
	/** top edge of the run's line */
	readonly y: number;
	/** the measured width of this run */
	readonly width: number;
}

export interface MarkupLayout {
	/** measures a piece under its own style, the same function `layoutMarkupLines` was given */
	readonly measure: MarkupMeasure;
	/** the wrap width the lines were laid out against, used to align each shorter line within it */
	readonly maxWidth: number;
	/** distance between baselines */
	readonly lineHeight: number;
	/** flow direction; defaults to `'ltr'` */
	readonly direction?: MarkupDirection;
	/** line alignment; defaults to `'right'` in `rtl`, `'left'` otherwise */
	readonly align?: MarkupAlign;
}

/**
 * Positions already-laid-out lines into a flat list of placed runs, one per span, so a canvas
 * backend draws each span as its own `Text2D` (or an image as its own sprite) at the reported
 * `x`/`y`. This is the half `layoutMarkupLines` deliberately leaves out: it decides *which*
 * spans share a line, this decides *where* on the line each one lands.
 *
 * Direction is what makes the two backends equivalent rather than merely identical in text: an
 * `rtl` line places its first (logical) span at the right edge and flows left from it, while an
 * `ltr` line flows right from the left edge, so the same spans read in the language's own order
 * on either side. Alignment then moves the whole line within `maxWidth`, defaulting to the
 * direction's natural edge (`'right'` for `rtl`, `'left'` for `ltr`). A line wider than
 * `maxWidth` is not clipped - the same "a single long word still renders" rule
 * `layoutMarkupLines` already keeps - it simply starts left of zero.
 *
 * @example
 * ```ts
 * import { layoutMarkupLines, parseMarkup, positionMarkupLines } from '@datamoc/mw_games/two-d/ui';
 *
 * const spans = parseMarkup('Take <b>two</b> coins<img>coin.png</img>');
 * const measure = (piece: { text: string; image?: string }) =>
 * 	piece.image !== undefined ? 16 : piece.text.length * 8;
 * const lines = layoutMarkupLines(spans, measure, 120);
 * const runs = positionMarkupLines(lines, { measure, maxWidth: 120, lineHeight: 16 });
 * console.log(runs.map((run) => run.span.image ?? run.span.text).join(''));
 * ```
 */
export function positionMarkupLines(lines: readonly MarkupLine[], layout: MarkupLayout): PositionedMarkupSpan[] {
	const direction = layout.direction ?? 'ltr';
	const align = layout.align ?? (direction === 'rtl' ? 'right' : 'left');
	const placed: PositionedMarkupSpan[] = [];

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		const y = lineIndex * layout.lineHeight;
		const widths = line.spans.map((span) => layout.measure(span));
		const total = widths.reduce((sum, width) => sum + width, 0);
		const startX =
			align === 'left' ? 0 : align === 'right' ? layout.maxWidth - total : (layout.maxWidth - total) / 2;

		let cursor = direction === 'rtl' ? startX + total : startX;
		for (let index = 0; index < line.spans.length; index++) {
			const width = widths[index];
			const x = direction === 'rtl' ? cursor - width : cursor;
			cursor = direction === 'rtl' ? cursor - width : cursor + width;
			placed.push({ span: line.spans[index], x, y, width });
		}
	}

	return placed;
}

/** escapes the five characters that would otherwise read as syntax */
export function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function opened(style: Style, name: string, body: string): Style {
	if (name === 'b') return { ...style, bold: true };
	if (name === 'i') return { ...style, italic: true };

	const color = attribute(body, 'color');
	const size = Number(attribute(body, 'size') ?? '');
	const next: Style = { ...style };
	if (color) next.color = color;
	if (Number.isFinite(size) && size > 0) next.size = size;
	return next;
}

/** the value of one attribute, quoted or bare; `undefined` when it is not there */
function attribute(body: string, name: string): string | undefined {
	const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`).exec(body);
	return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function readTag(source: string, at: number): Tag | null {
	const match = /^<(\/?)([a-zA-Z]+)([^>]*)>/.exec(source.slice(at));
	if (!match) return null;
	const body = match[3].trimEnd();
	return {
		name: match[2].toLowerCase(),
		closing: match[1] === '/',
		selfClosing: body.endsWith('/') && match[1] === '',
		body: body.replace(/\/$/, '').trim(),
		end: at + match[0].length - 1,
	};
}

/** `<img>path</img>` or `<img src='path'/>`, whichever shape was written; null when neither is */
function readImage(source: string, tag: Tag): { src: string; end: number } | null {
	if (tag.selfClosing) {
		const src = attribute(tag.body, 'src');
		return src ? { src, end: tag.end } : null;
	}

	const close = source.indexOf('</img>', tag.end + 1);
	if (close < 0) return null;
	const src = source.slice(tag.end + 1, close).trim();
	return src ? { src, end: close + '</img>'.length - 1 } : null;
}

function readEntity(source: string, at: number): { text: string; end: number } | null {
	const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
	const match = /^&(lt|gt|amp|quot|apos);/.exec(source.slice(at));
	if (match) return { text: named[match[1]], end: at + match[0].length - 1 };

	const numeric = /^&#(\d+);/.exec(source.slice(at));
	if (numeric) return { text: String.fromCodePoint(Number(numeric[1])), end: at + numeric[0].length - 1 };
	return null;
}

function readVariable(source: string, at: number): { name: string; end: number } | null {
	const match = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(at));
	return match ? { name: match[1], end: at + match[0].length - 1 } : null;
}
