import type { MarkupAlign } from './markup.ts';

/** one source line with its own alignment, when it asked for one */
export interface AlignedTextLine {
	text: string;
	align?: MarkupAlign;
}

/**
 * Reads a per-line alignment marker off the front of each source line. A line may start
 * with `{align:center}`, `{align:right}` or `{align:left}` (case-insensitive, spaces
 * allowed), or the markup-shaped `<align=center>` / `<align value='right'>`; the marker is
 * removed and the rest of the line is the text. An unrecognised or mid-line marker stays
 * literal, the same rule `parseMarkup` follows.
 *
 * This is deliberately a line splitter, not a markup parser: it answers the RPG Maker
 * `\#` / `\_` ask (a line that starts with a marker is centred or right-aligned) for a
 * renderer that lays out one `Text` per line, measured with the real font. Whole-block
 * alignment remains the renderer's own style option.
 *
 * @example
 * ```ts
 * import { splitAlignedLines } from '@datamoc/mwg/two-d/ui';
 *
 * console.log(splitAlignedLines('{align:center}MIDDLE\nplain\n{align:right}EDGE'));
 * // [{ text: 'MIDDLE', align: 'center' }, { text: 'plain' }, { text: 'EDGE', align: 'right' }]
 * ```
 */
export function splitAlignedLines(source: string): AlignedTextLine[] {
	return String(source)
		.split('\n')
		.map((line) => {
			const match =
				/^\s*(?:\{align\s*:\s*(left|center|centre|right)\s*\}|<align\s*(?:=\s*)?(?:(?:value\s*=\s*)?["']?)(left|center|centre|right)["']?\s*\/?>)\s*/i.exec(
					line,
				);
			if (!match) return { text: line };
			const word = (match[1] ?? match[2]).toLowerCase();
			const align: MarkupAlign = word === 'right' ? 'right' : word === 'left' ? 'left' : 'center';
			return { text: line.slice(match[0].length), align };
		});
}

/** Strips the alignment markers without laying anything out, for a plain-text projection.
 *
 * @example
 * ```ts
 * import { stripAlignedLines } from '@datamoc/mwg/two-d/ui';
 *
 * console.log(stripAlignedLines('{align:center}A\nB')); // 'A\nB'
 * ```
 */
export function stripAlignedLines(source: string): string {
	return splitAlignedLines(source)
		.map((line) => line.text)
		.join('\n');
}

/**
 * The first `count` characters of a set of lines, counting the newline between them as one
 * character - the typewriter slice for a renderer that draws one label per line.
 *
 * @example
 * ```ts
 * import { sliceAlignedLines, splitAlignedLines } from '@datamoc/mwg/two-d/ui';
 *
 * const lines = splitAlignedLines('ab\ncd');
 * console.log(sliceAlignedLines(lines, 3)); // [{ text: 'ab' }, { text: '' }]
 * ```
 */
export function sliceAlignedLines(lines: readonly AlignedTextLine[], count: number): AlignedTextLine[] {
	let remaining = Math.max(0, Math.floor(count));
	return lines.map((line) => {
		const text = line.text.slice(0, Math.max(0, remaining));
		remaining -= line.text.length + 1;
		return line.align === undefined ? { text } : { text, align: line.align };
	});
}
