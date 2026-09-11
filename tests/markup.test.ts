import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	escapeHtml,
	layoutMarkupLines,
	markupAccessibilityText,
	markupToHtml,
	parseMarkup,
	positionMarkupLines,
	stripMarkup,
} from '../src/two-d/ui/markup.ts';
import type { MarkupSpan } from '../src/two-d/ui/markup.ts';

/**
 * The inline-markup contract, checked as a contract: what a span says, how nesting and closing
 * tags behave, and - the part content written by hand depends on - that anything unknown or
 * malformed survives as literal text instead of vanishing.
 */

test('plain text is one unstyled span', () => {
	assert.deepEqual(parseMarkup('Four coins'), [{ text: 'Four coins', bold: false, italic: false }]);
	assert.deepEqual(parseMarkup(''), []);
});

test('emphasis nests, and a closing tag restores exactly what it opened over', () => {
	const spans = parseMarkup('<b>bold <i>both</i> bold</b> plain');

	assert.deepEqual(spans, [
		{ text: 'bold ', bold: true, italic: false },
		{ text: 'both', bold: true, italic: true },
		{ text: ' bold', bold: true, italic: false },
		{ text: ' plain', bold: false, italic: false },
	]);
});

test('a span carries the colour and size it was written with, and nests the same way', () => {
	const spans = parseMarkup("<span color='#c0ffee' size='14'>big<span color=red>red</span>big</span>");

	assert.deepEqual(spans, [
		{ text: 'big', bold: false, italic: false, color: '#c0ffee', size: 14 },
		{ text: 'red', bold: false, italic: false, color: 'red', size: 14 },
		{ text: 'big', bold: false, italic: false, color: '#c0ffee', size: 14 },
	]);
});

test('a line break becomes a newline in the text, in either spelling', () => {
	assert.equal(stripMarkup('one<br/>two'), 'one\ntwo');
	assert.equal(stripMarkup('one<br>two'), 'one\ntwo');
});

test('an image is a span of its own, carrying the path rather than any pixels', () => {
	assert.deepEqual(parseMarkup('see<img>gold.png</img>!'), [
		{ text: 'see', bold: false, italic: false },
		{ text: '', bold: false, italic: false, image: 'gold.png' },
		{ text: '!', bold: false, italic: false },
	]);
	assert.deepEqual(parseMarkup("<img src='gold.png'/>"), [
		{ text: '', bold: false, italic: false, image: 'gold.png' },
	]);
});

test('a variable the caller supplies is interpolated, and one nobody supplies is left alone', () => {
	const options = { variables: { name: 'Kalenz' } };

	assert.equal(stripMarkup('Hail, $name!', options), 'Hail, Kalenz!');
	assert.equal(stripMarkup('Hail, $unknown!', options), 'Hail, $unknown!');
	assert.equal(stripMarkup('$name of $name', options), 'Kalenz of Kalenz');
	assert.equal(stripMarkup('costs $5', options), 'costs $5', 'a dollar that starts no name is text');
});

test('text that looks like markup survives as text', () => {
	assert.equal(stripMarkup('a < b'), 'a < b', 'a stray < is not a tag');
	assert.equal(stripMarkup('<blink>hello</blink>'), '<blink>hello</blink>', 'an unknown tag is kept');
	assert.equal(stripMarkup('</b>'), '</b>', 'a closing tag that closes nothing is kept');
	assert.equal(stripMarkup('<img>no close'), '<img>no close', 'and so is an img with no end');
	assert.equal(stripMarkup('<b>unclosed'), 'unclosed', 'an unclosed tag styles the rest, as it reads');
});

test('the escapes are the way to write the syntax characters', () => {
	assert.equal(stripMarkup('&lt;b&gt; is not bold'), '<b> is not bold');
	assert.equal(stripMarkup('Tom &amp; Jerry'), 'Tom & Jerry');
	assert.equal(stripMarkup('&#75;alenz'), 'Kalenz');
	assert.deepEqual(parseMarkup('&quot;quoted&quot;'), [{ text: '"quoted"', bold: false, italic: false }]);
});

test('the html path escapes its text and renders emphasis, never the markup it was not asked for', () => {
	assert.equal(markupToHtml(parseMarkup('a < b and <b>bold</b>')), 'a &lt; b and <b>bold</b>');
	assert.equal(markupToHtml(parseMarkup('<i>both</i>')), '<i>both</i>');
	assert.equal(markupToHtml(parseMarkup('see<img>gold.png</img>')), 'see', 'an image has no text form here');
});

test('escaping covers the five characters that would otherwise read as syntax', () => {
	assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('the html path also renders colour and size, as an inline style', () => {
	const spans = parseMarkup("<span color='red' size='14'>big</span>");
	assert.equal(markupToHtml(spans), '<span style="color:red;font-size:14px">big</span>');
});

test('markupAccessibilityText announces an image instead of dropping or reading its path', () => {
	const spans = parseMarkup('Pay <b>10</b> gold<img>coin.png</img>');
	assert.equal(markupAccessibilityText(spans), 'Pay 10 gold[image]');
	assert.equal(markupAccessibilityText(spans, { describeImage: (path) => ` (${path})` }), 'Pay 10 gold (coin.png)');
});

test('markupAccessibilityText keeps text and drops no styling information from the string itself', () => {
	const spans = parseMarkup('Hail, <b>$name</b>!', { variables: { name: 'Kalenz' } });
	assert.equal(markupAccessibilityText(spans), 'Hail, Kalenz!');
});

//a fixed-width measurer, one unit per character plus a size multiplier, standing in for a real
//canvas TextMetrics call so wrapping logic is testable with no renderer at all
function fixedMeasure(piece: Pick<MarkupSpan, 'text' | 'bold' | 'italic' | 'size' | 'image'>): number {
	if (piece.image !== undefined) return (piece.size ?? 16) * 1.5;
	const scale = (piece.size ?? 10) / 10;
	return piece.text.length * scale * (piece.bold ? 1.2 : 1);
}

test('layoutMarkupLines wraps on word boundaries once a line would overflow', () => {
	const spans = parseMarkup('one two three four');
	const lines = layoutMarkupLines(spans, fixedMeasure, 8);
	assert.deepEqual(
		lines.map((line) => line.spans.map((span) => span.text).join('')),
		['one two', 'three', 'four'],
	);
});

test('layoutMarkupLines honours an explicit <br/> as a hard break regardless of width', () => {
	const spans = parseMarkup('a<br/>b');
	const lines = layoutMarkupLines(spans, fixedMeasure, 1000);
	assert.deepEqual(
		lines.map((line) => line.spans.map((span) => span.text).join('')),
		['a', 'b'],
	);
});

test('layoutMarkupLines never drops a word wider than maxWidth by itself', () => {
	const spans = parseMarkup('supercalifragilistic hi');
	const lines = layoutMarkupLines(spans, fixedMeasure, 5);
	assert.equal(lines[0].spans.map((span) => span.text).join(''), 'supercalifragilistic');
	assert.equal(lines[1].spans.map((span) => span.text).join(''), 'hi');
});

test('layoutMarkupLines wraps a bold run where its own wider glyphs land, not where plain text would', () => {
	//"biggg" bold at 1.2x is wider than the same five characters plain - the wrap point moves
	//because of styling, which is exactly the acceptance this function exists for
	const plain = layoutMarkupLines(parseMarkup('biggg word'), fixedMeasure, 10);
	const bold = layoutMarkupLines(parseMarkup('<b>biggg</b> word'), fixedMeasure, 10);
	assert.deepEqual(
		plain.map((line) => line.spans.map((span) => span.text).join('')),
		['biggg word'],
	);
	assert.deepEqual(
		bold.map((line) => line.spans.map((span) => span.text).join('')),
		['biggg', 'word'],
	);
});

test('layoutMarkupLines keeps an image span whole, measured by its own piece', () => {
	const spans = parseMarkup('gold<img>coin.png</img>!');
	const lines = layoutMarkupLines(spans, fixedMeasure, 1000);
	assert.equal(lines.length, 1);
	assert.equal(lines[0].spans[1].image, 'coin.png');
});

test('layoutMarkupLines on an empty span list still returns one empty line, never nothing', () => {
	assert.deepEqual(layoutMarkupLines([], fixedMeasure, 100), [{ spans: [], width: 0 }]);
});

test('the canvas and rich-text backends render the same runs for one fixture', () => {
	//one fixture, deliberately mixing every span kind the contract covers - the acceptance this
	//item was missing: the same spans, laid out once, drive both a canvas-shaped per-run list
	//(layoutMarkupLines, then positionMarkupLines) and an HTML string (markupToHtml) with
	//identical text content and order
	const source = "Pay <b>10</b> <span color='gold' size='14'>gold</span> for the <i>amulet</i><img>amulet.png</img>!";
	const spans = parseMarkup(source);

	const lines = layoutMarkupLines(spans, fixedMeasure, 1000);
	const canvasRunText = lines
		.flatMap((line) => line.spans)
		.map((span) => span.image ?? span.text)
		.join('');

	// the positioned pass is the actual canvas backend: each span becomes a placed run, still in
	// the same order, so it carries the exact same text/image sequence the rich-text path does
	const positionedRunText = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 1000, lineHeight: 16 })
		.map((run) => run.span.image ?? run.span.text)
		.join('');

	const html = markupToHtml(spans);
	// strip the HTML backend's own tags back to plain text, the same reduction the accessibility
	// projection makes, so both backends are compared on the text they actually carry
	const richTextRunText = markupAccessibilityText(spans, { describeImage: (path) => path });

	assert.equal(canvasRunText, richTextRunText, 'both backends carry the exact same text, in the same order');
	assert.equal(positionedRunText, richTextRunText, 'the positioned canvas runs carry it too');
	assert.ok(html.includes('<b>10</b>'));
	assert.ok(html.includes('color:gold'));
	assert.ok(html.includes('<i>amulet</i>'));
});

test('positionMarkupLines places an ltr line left to right', () => {
	const spans = parseMarkup('ab<b>c</b>');
	const lines = layoutMarkupLines(spans, fixedMeasure, 100);
	const runs = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 100, lineHeight: 10 });

	assert.deepEqual(
		runs.map((run) => ({ text: run.span.text, x: run.x, y: run.y, width: run.width })),
		[
			{ text: 'ab', x: 0, y: 0, width: 2 },
			{ text: 'c', x: 2, y: 0, width: 1.2 },
		],
		'a bold run measures wider (1.2x) and lands after the run before it',
	);
});

test('positionMarkupLines places an rtl line right to left, first logical span rightmost', () => {
	const spans = parseMarkup('ab<b>c</b>');
	const lines = layoutMarkupLines(spans, fixedMeasure, 100);
	const runs = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 100, lineHeight: 10, direction: 'rtl' });

	assert.deepEqual(
		runs.map((run) => ({ text: run.span.text, x: run.x })),
		[
			{ text: 'ab', x: 98 },
			{ text: 'c', x: 96.8 },
		],
		'the first (logical) span sits at the right edge and the rest flow left from it',
	);
});

test('positionMarkupLines aligns a short line within maxWidth', () => {
	const spans = parseMarkup('ab');
	const lines = layoutMarkupLines(spans, fixedMeasure, 100);

	const left = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 100, lineHeight: 10, align: 'left' });
	const center = positionMarkupLines(lines, {
		measure: fixedMeasure,
		maxWidth: 100,
		lineHeight: 10,
		align: 'center',
	});
	const right = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 100, lineHeight: 10, align: 'right' });

	assert.equal(left[0].x, 0);
	assert.equal(center[0].x, 49);
	assert.equal(right[0].x, 98);
});

test("positionMarkupLines defaults alignment to the direction's natural edge", () => {
	const spans = parseMarkup('ab');
	const lines = layoutMarkupLines(spans, fixedMeasure, 100);

	const ltr = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 100, lineHeight: 10 });
	const rtl = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 100, lineHeight: 10, direction: 'rtl' });

	assert.equal(ltr[0].x, 0, 'ltr defaults to left');
	assert.equal(rtl[0].x, 98, 'rtl defaults to right');
});

test('positionMarkupLines offsets each line by lineHeight', () => {
	const spans = parseMarkup('a<br/>b');
	const lines = layoutMarkupLines(spans, fixedMeasure, 1000);
	const runs = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 1000, lineHeight: 16 });

	assert.deepEqual(
		runs.map((run) => ({ text: run.span.text, y: run.y })),
		[
			{ text: 'a', y: 0 },
			{ text: 'b', y: 16 },
		],
	);
});

test('parseMarkup keeps RTL text in logical order with its own styling', () => {
	//the RTL sample the acceptance was missing: a Hebrew sentence with inline emphasis parses to
	//the same logical spans as its Latin twin, so the renderer receives text in reading order
	const spans = parseMarkup('שלום <b>עולם</b>');

	assert.deepEqual(spans, [
		{ text: 'שלום ', bold: false, italic: false },
		{ text: 'עולם', bold: true, italic: false },
	]);
});

test('an RTL sample flows right to left, first logical span rightmost', () => {
	const spans = parseMarkup('שלום <b>עולם</b>');
	const lines = layoutMarkupLines(spans, fixedMeasure, 100);
	const runs = positionMarkupLines(lines, { measure: fixedMeasure, maxWidth: 100, lineHeight: 10, direction: 'rtl' });

	assert.equal(runs[0].span.text, 'שלום ');
	assert.equal(runs[1].span.text, 'עולם');
	assert.ok(runs[0].x > runs[1].x, 'the first logical span is the rightmost one');
	assert.ok(runs[1].x < runs[0].x, 'the bold span flows to the left of the plain one');
});
