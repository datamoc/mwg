import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMarkdown, stripMarkdown, sliceSpans } from '../src/two-d/ui/markdown.ts';

function styled(text: string): Array<{ text: string; bold: boolean; italic: boolean }> {
	return parseMarkdown(text);
}

test('plain text is one unstyled span', () => {
	assert.deepEqual(styled('Take two coins'), [{ text: 'Take two coins', bold: false, italic: false }]);
});

test('double markers style bold, singles italic', () => {
	assert.deepEqual(styled('Take **two** coins'), [
		{ text: 'Take ', bold: false, italic: false },
		{ text: 'two', bold: true, italic: false },
		{ text: ' coins', bold: false, italic: false },
	]);
	assert.deepEqual(styled('Take __two__ coins')[1], { text: 'two', bold: true, italic: false });
	assert.deepEqual(styled('a *small* coin')[1], { text: 'small', bold: false, italic: true });
	assert.deepEqual(styled('a _small_ coin')[1], { text: 'small', bold: false, italic: true });
});

test('a triple marker styles both at once', () => {
	assert.deepEqual(styled('a ***both*** coin'), [
		{ text: 'a ', bold: false, italic: false },
		{ text: 'both', bold: true, italic: true },
		{ text: ' coin', bold: false, italic: false },
	]);
});

test('properly nested markers compose', () => {
	assert.deepEqual(styled('**a *b* c**'), [
		{ text: 'a ', bold: true, italic: false },
		{ text: 'b', bold: true, italic: true },
		{ text: ' c', bold: true, italic: false },
	]);
});

test('an underscore inside a word is text, an asterisk is emphasis', () => {
	assert.deepEqual(styled('treasure_map'), [{ text: 'treasure_map', bold: false, italic: false }]);
	assert.deepEqual(styled('a*b*c')[1], { text: 'b', bold: false, italic: true });
});

test('unmatched markers stay literal', () => {
	assert.deepEqual(styled('a * b'), [{ text: 'a * b', bold: false, italic: false }]);
	assert.deepEqual(styled('**half'), [{ text: '**half', bold: false, italic: false }]);
	assert.deepEqual(
		styled('**a** **b**')
			.filter((span) => span.bold)
			.map((span) => span.text),
		['a', 'b'],
	);
});

test('a backslash escapes a marker', () => {
	assert.deepEqual(styled('a \\* b'), [{ text: 'a * b', bold: false, italic: false }]);
	assert.deepEqual(styled('a \\*b\\* c'), [{ text: 'a *b* c', bold: false, italic: false }]);
});

test('stripMarkdown keeps the words and drops the markers', () => {
	assert.equal(stripMarkdown('Take **two** *small* coins'), 'Take two small coins');
	assert.equal(stripMarkdown('a \\* b'), 'a * b');
	assert.equal(stripMarkdown('plain'), 'plain');
});

test('sliceSpans reveals visible characters across spans, styles kept', () => {
	const spans = parseMarkdown('Take **two** coins');
	assert.deepEqual(sliceSpans(spans, 7), [
		{ text: 'Take ', bold: false, italic: false },
		{ text: 'tw', bold: true, italic: false },
	]);
	assert.deepEqual(sliceSpans(spans, 0), []);
	assert.deepEqual(sliceSpans(spans, 100), spans);
});
