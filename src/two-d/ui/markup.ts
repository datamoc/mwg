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
 * is. Emphasis is rendered and the text is escaped, so `a < b` can never turn into a tag; colour,
 * size and images are left to the renderer that asked for this, because the HTML dialect an
 * `HTMLText` accepts is narrower than the markup a game may write.
 */
export function markupToHtml(spans: readonly MarkupSpan[]): string {
	return spans
		.map((span) => {
			if (span.image !== undefined) return '';
			let text = escapeHtml(span.text);
			if (span.italic) text = `<i>${text}</i>`;
			if (span.bold) text = `<b>${text}</b>`;
			return text;
		})
		.join('');
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
