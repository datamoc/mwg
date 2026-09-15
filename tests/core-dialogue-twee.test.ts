import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDialogueLines } from '../src/core/DialogueText.ts';
import { parseTwee } from '../src/core/Twee.ts';

test('parseDialogueLines is the shared engine both two-d/stage and rpg wrap', () => {
	const lines = parseDialogueLines(`
@alice Hello.
@bob Hi!
- How are you?
`);
	assert.deepEqual(lines, [
		{ text: 'Hello.', speaker: 'alice' },
		{ text: 'Hi!', speaker: 'bob' },
		{ text: 'How are you?', speaker: 'alice' },
	]);
});

test('parseTwee is the shared engine both two-d/stage and rpg wrap', () => {
	const { story, start } = parseTwee(`:: Start
Pick a door.

[[Left->A]]
[[Right->B]]

:: A
Treasure.

:: B
Nothing.
`);
	assert.equal(start, 'Start');
	assert.deepEqual(story['Start'], [
		{
			ask: 'Pick a door.',
			choices: [
				{ text: 'Left', goto: 'A' },
				{ text: 'Right', goto: 'B' },
			],
		},
	]);
});
