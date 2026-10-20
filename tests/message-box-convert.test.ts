import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertBoxContent } from '../src/two-d/ui/MessageBox.ts';

const resolveCodes = (text: string): string => text.replace(/\\REM\[(\d)\]/g, 'room $1');

test('convertText reaches page text, speaker and choice labels, not just the first line', () => {
	const content = convertBoxContent(
		[{ text: 'Rooms: \\REM[0]', speaker: 'Warden \\REM[1]' }],
		[{ text: 'Assign \\REM[0]', value: 'assign', disabled: true }],
		resolveCodes,
	);
	assert.deepEqual(content.pages, [{ text: 'Rooms: room 0', speaker: 'Warden room 1', portrait: undefined }]);
	assert.deepEqual(content.choices, [{ text: 'Assign room 0', value: 'assign', disabled: true }]);
});

test('a string page becomes a page, converted like any other', () => {
	const content = convertBoxContent(['plain \\REM[2]'], [], resolveCodes);
	assert.deepEqual(content.pages, [{ text: 'plain room 2', speaker: undefined, portrait: undefined }]);
	assert.deepEqual(content.choices, []);
});

test('without a convertText hook the content passes through unchanged', () => {
	const choices = [{ text: 'Keep \\REM[0]', value: 1 }];
	const content = convertBoxContent([{ text: 'Verbatim \\REM[0]' }], choices, undefined);
	assert.equal(content.pages[0].text, 'Verbatim \\REM[0]');
	assert.equal(content.choices[0].text, 'Keep \\REM[0]');
	assert.equal(content.choices[0].value, 1);
});
