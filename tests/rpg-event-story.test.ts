import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameState } from '../src/rpg/GameState.ts';
import { EventRunner, type EventCommand, type EventStoryScript } from '../src/rpg/EventRunner.ts';
import { importTwee } from '../src/rpg/twee-events.ts';

const silent = async () => undefined;

test('runStory follows a goto command to another passage', async () => {
	const state = new GameState();
	const runner = new EventRunner({ present: silent, game: state });

	const story: EventStoryScript = {
		Start: [{ setVariable: 'visited', value: 1 }, { goto: 'End' }, { setVariable: 'visited', value: 999 }],
		End: [{ addVariable: 'visited', amount: 10 }],
	};
	await runner.runStory(story, 'Start');
	assert.equal(state.variable('visited'), 11);
});

test('runStory follows a choice goto, resolved by the presenter', async () => {
	const state = new GameState();
	const runner = new EventRunner({
		present: async (request) => request.choices?.[1]?.value ?? request.choices?.[1]?.text,
		game: state,
	});

	const story: EventStoryScript = {
		Start: [
			{
				ask: 'Which way?',
				choices: [
					{ text: 'Left', goto: 'Left' },
					{ text: 'Right', goto: 'Right' },
				],
			},
		],
		Left: [{ setVariable: 'path', value: 1 }],
		Right: [{ setVariable: 'path', value: 2 }],
	};
	await runner.runStory(story, 'Start');
	assert.equal(state.variable('path'), 2);
});

test('a goto inside an "if" branch can still jump to a different passage', async () => {
	const state = new GameState();
	const runner = new EventRunner({ present: silent, game: state });
	state.setSwitch('hasKey', true);

	const story: EventStoryScript = {
		Start: [
			{
				if: { switch: 'hasKey', equals: true },
				then: [{ goto: 'Unlocked' }],
				else: [{ goto: 'Locked' }],
			},
		],
		Unlocked: [{ setVariable: 'result', value: 1 }],
		Locked: [{ setVariable: 'result', value: 2 }],
	};
	await runner.runStory(story, 'Start');
	assert.equal(state.variable('result'), 1);
});

test('a plain run() refuses a "goto" - it only resolves inside runStory', async () => {
	const state = new GameState();
	const runner = new EventRunner({ present: silent, game: state });
	await assert.rejects(() => runner.run([{ goto: 'Nowhere' } as EventCommand]), /only runs inside runStory/);
});

test('runStory refuses a start or goto passage that does not exist', async () => {
	const state = new GameState();
	const runner = new EventRunner({ present: silent, game: state });
	await assert.rejects(() => runner.runStory({ Start: [] }, 'Missing'), /no passage named "Missing"/);
	await assert.rejects(
		() => runner.runStory({ Start: [{ goto: 'Missing' }] }, 'Start'),
		/no passage named "Missing"/,
	);
});

test('importTwee links become a closing ask with goto choices', () => {
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

test('an imported twee story runs end to end through EventRunner.runStory', async () => {
	const { story, start } = importTwee(`:: Start
Pick a door.

[[Left->A]]
[[Right->B]]

:: A
You found treasure.

:: B
You found nothing.
`);

	const state = new GameState();
	const seen: string[] = [];
	const runner = new EventRunner({
		present: async (request) => {
			seen.push(request.text);
			return request.choices?.[0]?.value ?? request.choices?.[0]?.text;
		},
		game: state,
	});
	await runner.runStory(story, start);
	assert.deepEqual(seen, ['Pick a door.', 'You found treasure.']);
});

test('importTwee refuses a link to a missing passage, a doubled passage, and an empty file', () => {
	assert.throws(() => importTwee(':: A\nSee [[Elsewhere]].\n'), /links to "Elsewhere"/);
	assert.throws(() => importTwee(':: A\nOne.\n\n:: A\nTwo.\n'), /defines "A" twice/);
	assert.throws(() => importTwee('just prose, no headers\n'), /no passages/);
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
});
