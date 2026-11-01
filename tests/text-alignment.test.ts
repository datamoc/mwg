import { test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutMarkupLines, parseMarkup, positionMarkupLines, stripMarkup } from '../src/two-d/ui/markup.ts';
import { sliceAlignedLines, splitAlignedLines, stripAlignedLines } from '../src/two-d/ui/text-align.ts';

test('splitAlignedLines reads brace and tag markers off the front of each line', () => {
	assert.deepEqual(splitAlignedLines('{align:center}MIDDLE\nplain\n{align:right}EDGE'), [
		{ text: 'MIDDLE', align: 'center' },
		{ text: 'plain' },
		{ text: 'EDGE', align: 'right' },
	]);
	assert.deepEqual(splitAlignedLines('<align=center>one\n<align value="right">two\n<align center>three'), [
		{ text: 'one', align: 'center' },
		{ text: 'two', align: 'right' },
		{ text: 'three', align: 'center' },
	]);
});

test('a marker mid-line or one this parser does not know stays literal text', () => {
	assert.deepEqual(splitAlignedLines('say {align:center} this'), [{ text: 'say {align:center} this' }]);
	assert.deepEqual(splitAlignedLines('{align:justify}nope'), [{ text: '{align:justify}nope' }]);
	assert.equal(stripAlignedLines('{align:center}A\nB'), 'A\nB');
});

test('sliceAlignedLines reveals across lines, counting the newline between them', () => {
	const lines = splitAlignedLines('{align:center}abc\ndef');
	assert.deepEqual(sliceAlignedLines(lines, 0), [{ text: '', align: 'center' }, { text: '' }]);
	assert.deepEqual(sliceAlignedLines(lines, 4), [{ text: 'abc', align: 'center' }, { text: '' }]);
	assert.deepEqual(sliceAlignedLines(lines, 5), [{ text: 'abc', align: 'center' }, { text: 'd' }]);
});

test('parseMarkup turns alignment markers into empty control spans, keeping the text', () => {
	const spans = parseMarkup('{align:center}Hello <align=right>world');
	assert.deepEqual(
		spans.map((span) => ({ text: span.text, align: span.align })),
		[
			{ text: '', align: 'center' },
			{ text: 'Hello ', align: undefined },
			{ text: '', align: 'right' },
			{ text: 'world', align: undefined },
		],
	);
	assert.equal(stripMarkup('{align:center}Hello'), 'Hello');
});

test('layoutMarkupLines carries a line marker across a soft wrap and stops at a hard break', () => {
	const spans = parseMarkup('{align:center}one two three<br/>{align:right}four');
	const measure = (piece: { text: string }) => piece.text.length * 4;
	const lines = layoutMarkupLines(spans, measure, 16);
	assert.deepEqual(
		lines.map((line) => ({ text: line.spans.map((span) => span.text).join(''), align: line.align })),
		[
			{ text: 'one', align: 'center' },
			{ text: 'two', align: 'center' },
			{ text: 'three', align: 'center' },
			{ text: 'four', align: 'right' },
		],
	);
});

test('positionMarkupLines places each line by its own align, measured within the wrap width', () => {
	const spans = parseMarkup('{align:center}ab\ncd');
	const measure = (piece: { text: string }) => piece.text.length * 4;
	const lines = layoutMarkupLines(spans, measure, 40);
	const runs = positionMarkupLines(lines, { measure, maxWidth: 40, lineHeight: 10 });

	const first = runs.filter((run) => run.y === 0);
	const second = runs.filter((run) => run.y === 10);
	assert.deepEqual(
		first.map((run) => ({ text: run.span.text, x: run.x })),
		[{ text: 'ab', x: 16 }],
	);
	assert.deepEqual(
		second.map((run) => ({ text: run.span.text, x: run.x })),
		[{ text: 'cd', x: 0 }],
	);
});
