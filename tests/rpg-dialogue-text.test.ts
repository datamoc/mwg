import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDialogueText, extractDialogueCatalog } from '../src/rpg/dialogue-text.ts';

test('plain @id lines say their text as EventCommand.say/speaker', () => {
	const commands = parseDialogueText(`
@alice Hello.
@bob Hi!
Narration with no speaker.
`);
	assert.deepEqual(commands, [
		{ say: 'Hello.', speaker: 'alice' },
		{ say: 'Hi!', speaker: 'bob' },
		{ say: 'Narration with no speaker.' },
	]);
});

test('"-" lines alternate between the two established speakers', () => {
	const commands = parseDialogueText(`
@alice Hello.
@bob Hi!
- How are you?
- Fine, and you?
`);
	assert.deepEqual(commands, [
		{ say: 'Hello.', speaker: 'alice' },
		{ say: 'Hi!', speaker: 'bob' },
		{ say: 'How are you?', speaker: 'alice' },
		{ say: 'Fine, and you?', speaker: 'bob' },
	]);
});

test('a "-" line before two speakers exist, and a third speaker, are both refused', () => {
	assert.throws(() => parseDialogueText('@alice Hello.\n- Hi!\n'), /needs two established speakers/);
	assert.throws(() => parseDialogueText('@alice Hi.\n@bob Hi.\n@carol Hi.\n'), /at most two speakers/);
});

test('extractDialogueCatalog builds an identity catalog', () => {
	const commands = parseDialogueText('@alice Hello.\n@bob Hi!\n');
	assert.deepEqual(extractDialogueCatalog(commands), {
		locale: 'en',
		direction: 'ltr',
		messages: { 'Hello.': 'Hello.', 'Hi!': 'Hi!' },
	});
});
