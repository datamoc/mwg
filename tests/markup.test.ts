import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, markupToHtml, parseMarkup, stripMarkup } from '../src/two-d/ui/markup.ts';

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
