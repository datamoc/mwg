import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TextModel } from '../src/two-d/ui/TextModel.ts';

/**
 * The text-field model (item 261): the editing rules `core.Input`'s `onText` feeds. Everything
 * here is index arithmetic - caret, anchor, selection, the length cap - so it is tested without a
 * DOM, which a `Label` showing the result would need.
 */

test('a field starts at the end of its value', () => {
	const model = new TextModel({ value: 'Hero' });
	assert.equal(model.value, 'Hero');
	assert.equal(model.caret, 4);
	assert.equal(model.hasSelection, false);
});

test('insert puts text at the caret and leaves the caret after it', () => {
	const model = new TextModel({ value: 'Hro' });
	model.setCaret(1);
	model.insert('e');
	assert.equal(model.value, 'Hero');
	assert.equal(model.caret, 2);
});

test('insert replaces the selection rather than adding to it', () => {
	const model = new TextModel({ value: 'Hero' });
	model.setCaret(0);
	model.setCaret(2, true); //select 'He'
	model.insert('Ash');
	assert.equal(model.value, 'Ashro');
	assert.equal(model.caret, 3);
});

test('backspace removes the selection or the character before the caret, and stops at 0', () => {
	const model = new TextModel({ value: 'Hero' });
	model.backspace();
	assert.equal(model.value, 'Her');

	model.setCaret(0);
	model.backspace();
	assert.equal(model.value, 'Her', 'nothing before the caret');

	model.selectAll();
	model.backspace();
	assert.equal(model.value, '', 'a selection goes whole');
});

test('deleteForward removes the character after the caret, and stops at the end', () => {
	const model = new TextModel({ value: 'Hero' });
	model.setCaret(1);
	model.deleteForward();
	assert.equal(model.value, 'Hro');

	model.setCaret(model.length);
	model.deleteForward();
	assert.equal(model.value, 'Hro');
});

test('moveCaret clamps to the value and extends the selection when asked', () => {
	const model = new TextModel({ value: 'Hero' });
	model.moveToStart();
	assert.equal(model.caret, 0);

	model.moveCaret(-5);
	assert.equal(model.caret, 0, 'past the start clamps');
	model.moveCaret(2, true);
	assert.equal(model.selectedText, 'He');
	assert.equal(model.selectionStart, 0);
	assert.equal(model.selectionEnd, 2);
});

test('selection helpers report the selection in reading order', () => {
	const model = new TextModel({ value: 'Hero' });
	model.setCaret(3);
	model.setCaret(1, true); //anchor 3, caret 1: still "er"
	assert.equal(model.selectionStart, 1);
	assert.equal(model.selectionEnd, 3);
	assert.equal(model.selectedText, 'er');

	model.clearSelection();
	assert.equal(model.hasSelection, false);
});

test('maxLength truncates a set value and a paste, but not a legitimate insert', () => {
	const model = new TextModel({ maxLength: 4 });
	model.setValue('Heroic');
	assert.equal(model.value, 'Hero');

	model.setCaret(4);
	model.insert('s!');
	assert.equal(model.value, 'Hero', 'a full field takes nothing more');
});

test('a mask hides the value for a password field', () => {
	const model = new TextModel({ value: 'hunter2', mask: true });
	assert.equal(model.maskedValue, '\u2022'.repeat(7));
	assert.equal(model.value, 'hunter2', 'the real value is still what edits read');

	const plain = new TextModel({ value: 'hunter2' });
	assert.equal(plain.maskedValue, 'hunter2');
});

test('a single-line field strips newlines from every edit', () => {
	const model = new TextModel({ value: 'one\ntwo' });
	assert.equal(model.value, 'onetwo', 'the constructor shapes too');

	model.setValue('a\r\nb');
	assert.equal(model.value, 'ab');

	model.setCaret(1);
	model.insert('\n');
	assert.equal(model.value, 'ab', 'Enter cannot grow a second row');
	assert.equal(model.lineCount, 1);
});

test('a multiline field keeps newlines and counts rows', () => {
	const model = new TextModel({ multiline: true, value: 'one\ntwo\nthree' });
	assert.equal(model.value, 'one\ntwo\nthree');
	assert.equal(model.lineCount, 3);

	model.setCaret(0);
	model.insert('zero\n');
	assert.equal(model.value, 'zero\none\ntwo\nthree');
	assert.equal(model.lineCount, 4);
});

test('multiline normalises carriage returns and caps the shaped text', () => {
	const model = new TextModel({ multiline: true, maxLength: 5 });
	model.setValue('a\r\nb\rc');
	assert.equal(model.value, 'a\nb\nc');

	model.setCaret(6);
	model.insert('def');
	assert.equal(model.value, 'a\nb\nc', 'the cap counts newlines too');
});

test('caretLine and lineRange locate the caret by row', () => {
	const model = new TextModel({ multiline: true, value: 'one\ntwo\nthree' });
	assert.deepEqual(model.lineRange(0), [0, 3]);
	assert.deepEqual(model.lineRange(1), [4, 7]);
	assert.deepEqual(model.lineRange(2), [8, 13]);
	assert.deepEqual(model.lineRange(9), [8, 13], 'out of range clamps');

	model.setCaret(5);
	assert.equal(model.caretLine, 1);
});

test('moveCaretLine holds the column across rows of different lengths', () => {
	const model = new TextModel({ multiline: true, value: 'longer\nno\nrow' });
	model.setCaret(4); //column 4 of row 0
	model.moveCaretLine(1);
	assert.equal(model.value.slice(0, model.caret), 'longer\nno', 'short rows stop the caret');
	assert.equal(model.caretLine, 1);

	model.moveCaretLine(1);
	assert.equal(model.caretLine, 2);
	assert.equal(model.caret - model.lineRange(2)[0], 3);

	model.moveCaretLine(-2);
	assert.equal(model.caret, 4, 'back up restores the column');
});

test('a mask hides text but keeps newlines so rows survive', () => {
	const model = new TextModel({ multiline: true, mask: true, value: 'ab\ncd' });
	assert.equal(model.maskedValue, '\u2022\u2022\n\u2022\u2022');
});
