import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importTwee } from '../src/stage/twee.ts';

test('links become a closing ask, and the last line becomes its prompt', () => {
	const { story, start } = importTwee(`:: Start
You stand at a crossroads.

[[Take the left path->Left]]
[[Take the right path->Right]]

:: Left
A wall. Dead end.

:: Right
An open road.
`);

	assert.equal(start, 'Start');
	assert.deepEqual(story['Start'], [
		{
			ask: 'You stand at a crossroads.',
			choices: [
				{ text: 'Take the left path', goto: 'Left' },
				{ text: 'Take the right path', goto: 'Right' },
			],
		},
	]);
	assert.deepEqual(story['Left'], [{ say: 'A wall. Dead end.' }]);
});

test('all three link forms are read', () => {
	const { story } = importTwee(`:: A
Pick.

[[B]]
[[over there->C]]
[[C<-back here]]
[[gone->B]]

:: B
End.

:: C
End.
`);

	const choices = story['A'][0];
	assert.ok('ask' in choices);
	assert.deepEqual(choices.choices, [
		{ text: 'B', goto: 'B' },
		{ text: 'over there', goto: 'C' },
		{ text: 'back here', goto: 'C' },
		{ text: 'gone', goto: 'B' },
	]);
});

test('inline links leave their sentence behind, and tags and metadata are ignored', () => {
	const { story } = importTwee(`:: Start [forest dark] {"position":"100,200"}
Go [[north->North]] now.

:: North
Here.
`);

	assert.deepEqual(story['Start'], [
		{ ask: 'Go now.', choices: [{ text: 'north', goto: 'North' }] },
	]);
});

test('StoryData names the start, and StoryTitle names the story', () => {
	const imported = importTwee(`:: StoryTitle
The Test

:: StoryData
{"ifid":"1234","start":"Second"}

:: First
One.

:: Second
Two.
`);

	assert.equal(imported.title, 'The Test');
	assert.equal(imported.start, 'Second');
	assert.ok(!('StoryTitle' in imported.story));
	assert.ok(!('StoryData' in imported.story));
});

test('the first passage starts the story when StoryData names none', () => {
	const { start } = importTwee(`:: Alpha
One.

:: Beta
Two.
`);
	assert.equal(start, 'Alpha');
});

test('a link to nowhere, a doubled passage, and an empty file are refused', () => {
	assert.throws(() => importTwee(':: A\nSee [[Elsewhere]].\n'), /links to "Elsewhere"/);
	assert.throws(() => importTwee(':: A\nOne.\n\n:: A\nTwo.\n'), /defines "A" twice/);
	assert.throws(() => importTwee('just prose, no headers\n'), /no passages/);
	assert.throws(() => importTwee(':: StoryTitle\nOnly a title\n'), /no story passages/);
});

test('setter links and unclosed links are refused, not half-read', () => {
	assert.throws(() => importTwee(':: A\nGo [[there->B][$x to 1]].\n\n:: B\nHere.\n'), /setter/);
	assert.throws(() => importTwee(':: A\nGo [[there.\n'), /no closing "\]\]"/);
});

test('a header without a name and a bad StoryData are refused', () => {
	assert.throws(() => importTwee('::\nBody.\n'), /needs a name/);
	assert.throws(() => importTwee(':: StoryData\nnot json\n\n:: A\nHere.\n'), /must be JSON/);
	assert.throws(
		() => importTwee(':: StoryData\n{"start":"Missing"}\n\n:: A\nHere.\n'),
		/starts at "Missing"/
	);
});
