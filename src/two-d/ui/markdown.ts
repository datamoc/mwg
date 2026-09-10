/**
 * Minimal inline markdown for UI text: bold and italic spans, nothing block-level.
 * `**bold**` and `__bold__` render bold, `*italic*` and `_italic_` italic (including the
 * combined `***both***`), a backslash escapes a marker (`\*` stays a literal asterisk),
 * and anything unmatched stays literal text rather than vanishing.
 *
 * Pure logic, no Pixi dependency: `parseMarkdown` turns a string into styled spans for
 * `RichLabel` to draw, and `stripMarkdown` recovers the plain text (for measuring,
 * accessibility names, or any widget that stays single-style). Headings, links, lists
 * and code spans are deliberately out - a game label needs emphasis inside a sentence,
 * not a document renderer.
 *
 * An underscore run inside a word (`treasure_map`) is not emphasis, matching CommonMark;
 * asterisks always are (`a*b*c` italicizes `b`). Markers pair strictly sequentially per
 * kind (`**a** **b**` is two spans), so exotic nesting degrades to literal markers rather
 * than surprising styling.
 *
 * @example
 * ```ts
 * import { parseMarkdown, stripMarkdown } from '@datamoc/mw_games/two-d/ui';
 *
 * parseMarkdown('Take **two** *small* coins');
 * // [{ text: 'Take ', bold: false, italic: false },
 * //  { text: 'two', bold: true, italic: false },
 * //  { text: ' ', bold: false, italic: false },
 * //  { text: 'small', bold: false, italic: true },
 * //  { text: ' coins', bold: false, italic: false }]
 *
 * stripMarkdown('Take **two** coins'); // 'Take two coins'
 * ```
 */
export interface MarkdownSpan {
	text: string;
	bold: boolean;
	italic: boolean;
}

/** escapes (`\*`, `\_`, `\\`) hidden from marker scanning, then restored */
const ESCAPED_STAR = '';
const ESCAPED_UNDERSCORE = '';
const ESCAPED_BACKSLASH = '';

function hideEscapes(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\\' && i + 1 < text.length && (text[i + 1] === '*' || text[i + 1] === '_' || text[i + 1] === '\\')) {
			const next = text[i + 1];
			out += next === '*' ? ESCAPED_STAR : next === '_' ? ESCAPED_UNDERSCORE : ESCAPED_BACKSLASH;
			i++;
		} else {
			out += text[i];
		}
	}
	return out;
}

function showEscapes(text: string): string {
	return text.replaceAll(ESCAPED_STAR, '*').replaceAll(ESCAPED_UNDERSCORE, '_').replaceAll(ESCAPED_BACKSLASH, '\\');
}

function isWordChar(char: string | undefined): boolean {
	return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
}

interface StyleRange {
	from: number;
	to: number;
	style: 'bold' | 'italic';
}

interface Excluded {
	from: number;
	to: number;
}

/**
 * Offsets of one marker kind, in order. A run of three stars reads as a double plus a
 * trailing single (`***` opens bold and italic together); an underscore run with word
 * characters on both sides is text, not emphasis.
 */
function markerPositions(text: string, char: '*' | '_', double: boolean): number[] {
	const positions: number[] = [];
	let i = 0;
	while (i < text.length) {
		if (text[i] !== char) {
			i++;
			continue;
		}
		let run = 0;
		while (text[i + run] === char) run++;
		if (!(char === '_' && isWordChar(text[i - 1]) && isWordChar(text[i + run]))) {
			if (double) {
				for (let m = 0; m < Math.floor(run / 2); m++) positions.push(i + m * 2);
			} else if (run % 2 === 1) {
				//the single left over after the doubles took theirs from the front
				positions.push(i + run - 1);
			}
		}
		i += run;
	}
	return positions;
}

/** pairs one marker kind sequentially (0-1, 2-3); a trailing opener stays literal */
function pairMarkers(text: string, char: '*' | '_', double: boolean, style: 'bold' | 'italic', ranges: StyleRange[], excluded: Excluded[]): void {
	const positions = markerPositions(text, char, double);
	const width = double ? 2 : 1;
	for (let m = 0; m + 1 < positions.length; m += 2) {
		const open = positions[m];
		const close = positions[m + 1];
		ranges.push({ from: open + width, to: close, style });
		excluded.push({ from: open, to: open + width }, { from: close, to: close + width });
	}
}

function mergeSpans(spans: MarkdownSpan[]): MarkdownSpan[] {
	const merged: MarkdownSpan[] = [];
	for (const span of spans) {
		if (!span.text) continue;
		const last = merged[merged.length - 1];
		if (last && last.bold === span.bold && last.italic === span.italic) last.text += span.text;
		else merged.push({ ...span });
	}
	return merged;
}

export function parseMarkdown(text: string): MarkdownSpan[] {
	const hidden = hideEscapes(text);
	const ranges: StyleRange[] = [];
	const excluded: Excluded[] = [];
	pairMarkers(hidden, '*', true, 'bold', ranges, excluded);
	pairMarkers(hidden, '_', true, 'bold', ranges, excluded);
	pairMarkers(hidden, '*', false, 'italic', ranges, excluded);
	pairMarkers(hidden, '_', false, 'italic', ranges, excluded);

	//every range and marker edge splits the string, so no emitted chunk ever straddles
	//a style change or a consumed marker - each chunk just reads which ranges cover it
	const bounds = new Set<number>([0, hidden.length]);
	for (const range of ranges) {
		bounds.add(range.from);
		bounds.add(range.to);
	}
	for (const skip of excluded) {
		bounds.add(skip.from);
		bounds.add(skip.to);
	}
	const points = [...bounds].sort((a, b) => a - b);
	const spans: MarkdownSpan[] = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const from = points[i];
		const to = points[i + 1];
		if (from >= to || excluded.some((skip) => skip.from <= from && to <= skip.to)) continue;
		spans.push({
			text: hidden.slice(from, to),
			bold: ranges.some((range) => range.style === 'bold' && range.from <= from && to <= range.to),
			italic: ranges.some((range) => range.style === 'italic' && range.from <= from && to <= range.to),
		});
	}
	return mergeSpans(spans).map((span) => ({ ...span, text: showEscapes(span.text) }));
}

export function stripMarkdown(text: string): string {
	return parseMarkdown(text)
		.map((span) => span.text)
		.join('');
}

/**
 * The first `count` visible characters across already-parsed spans, styles kept -
 * the progressive-reveal slice for `RichLabel`, where markers must never count toward
 * the total nor leak onto screen half-shown. Counts in string characters, the same unit
 * `String.slice` (and `MessageBox`'s own reveal) uses.
 *
 * @example
 * ```ts
 * import { parseMarkdown, sliceSpans } from '@datamoc/mw_games/two-d/ui';
 *
 * sliceSpans(parseMarkdown('Take **two** coins'), 7);
 * // [{ text: 'Take ', bold: false, italic: false },
 * //  { text: 'tw', bold: true, italic: false }]
 * ```
 */
export function sliceSpans(spans: readonly MarkdownSpan[], count: number): MarkdownSpan[] {
	const out: MarkdownSpan[] = [];
	let remaining = Math.max(0, Math.floor(count));
	for (const span of spans) {
		if (remaining <= 0) break;
		const take = Math.min(span.text.length, remaining);
		out.push({ ...span, text: span.text.slice(0, take) });
		remaining -= take;
	}
	return out;
}
