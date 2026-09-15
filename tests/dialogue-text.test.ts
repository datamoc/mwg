import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDialogueText, extractDialogueCatalog } from '../src/two-d/stage/dialogue-text.ts';

test('plain @id lines say their text', () => {
	const commands = parseDialogueText(`
@alice Hello.
@bob Hi!
Narration with no speaker.
`);
	assert.deepEqual(commands, [
		{ say: 'Hello.', as: 'alice' },
		{ say: 'Hi!', as: 'bob' },
		{ say: 'Narration with no speaker.' },
	]);
});

test('a bare @id line registers a speaker without saying anything', () => {
	const commands = parseDialogueText(`
@alice
@bob
- Hi!
`);
	assert.deepEqual(commands, [{ say: 'Hi!', as: 'alice' }]);
});

test('"-" lines alternate between the two established speakers', () => {
	const commands = parseDialogueText(`
@alice Hello.
@bob Hi!
- How are you?
- Fine, and you?
- Also fine.
`);
	assert.deepEqual(commands, [
		{ say: 'Hello.', as: 'alice' },
		{ say: 'Hi!', as: 'bob' },
		{ say: 'How are you?', as: 'alice' },
		{ say: 'Fine, and you?', as: 'bob' },
		{ say: 'Also fine.', as: 'alice' },
	]);
});

test('an explicit @id line in between still lets "-" resume alternating from it', () => {
	const commands = parseDialogueText(`
@alice Hello.
@bob Hi!
@alice Wait, one more thing.
- Sure.
`);
	assert.deepEqual(commands, [
		{ say: 'Hello.', as: 'alice' },
		{ say: 'Hi!', as: 'bob' },
		{ say: 'Wait, one more thing.', as: 'alice' },
		{ say: 'Sure.', as: 'bob' },
	]);
});

test('a "-" line before two speakers exist is refused', () => {
	assert.throws(() => parseDialogueText('@alice Hello.\n- Hi!\n'), /needs two established speakers/);
	assert.throws(() => parseDialogueText('- Hi!\n'), /needs two established speakers/);
});

test('a third distinct speaker is refused', () => {
	assert.throws(
		() => parseDialogueText('@alice Hi.\n@bob Hi.\n@carol Hi.\n'),
		/at most two speakers.*"carol".*"alice".*"bob"/s,
	);
});

test('extractDialogueCatalog builds an identity catalog from a command list', () => {
	const commands = parseDialogueText('@alice Hello.\n@bob Hi!\n');
	assert.deepEqual(extractDialogueCatalog(commands), {
		locale: 'en',
		direction: 'ltr',
		messages: { 'Hello.': 'Hello.', 'Hi!': 'Hi!' },
	});
});

test('extractDialogueCatalog also reads a StoryScript graph, and honors locale/direction', () => {
	const catalog = extractDialogueCatalog(
		{
			Start: [
				{ say: 'Hello.', as: 'alice' },
				{ ask: 'Go where?', choices: [{ text: 'North', goto: 'North' }] },
			],
			North: [{ say: 'Cold here.' }],
		},
		{ locale: 'fr', direction: 'rtl' },
	);
	assert.deepEqual(catalog, {
		locale: 'fr',
		direction: 'rtl',
		messages: { 'Hello.': 'Hello.', 'Go where?': 'Go where?', 'Cold here.': 'Cold here.' },
	});
});
