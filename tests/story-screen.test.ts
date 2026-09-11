import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StorySequence } from '../src/two-d/stage/StoryScreen.ts';

/**
 * The story-screen sequence (item 264): the paging rules behind a between-scenario interlude.
 * `StoryScreen` itself draws a `Label`, which needs a DOM, so the model is what is pinned here -
 * the same split the repo keeps for every widget whose interesting part is a rule.
 */

const beats = [
	{ title: 'Prologue', text: 'The war begins.', image: 'intro.png', music: 'intro.ogg' },
	{ text: 'The first battle.' },
	{ title: 'End', text: 'It ended.', music: 'outro.ogg' },
];

test('a sequence starts on its first beat', () => {
	const story = new StorySequence(beats);
	assert.equal(story.position, 0);
	assert.equal(story.current?.title, 'Prologue');
	assert.equal(story.done, false);
	assert.equal(story.length, 3);
});

test('advance turns one page and reports the beat and its music', () => {
	const story = new StorySequence(beats);
	const seen: string[] = [];
	const music: (string | null)[] = [];
	story.onChange.add((beat) => {
		seen.push(beat.text);
	});
	story.onMusic.add((track) => {
		music.push(track);
	});

	assert.equal(story.advance(), true);
	assert.equal(story.position, 1);
	assert.equal(story.current?.text, 'The first battle.');
	assert.deepEqual(seen, ['The first battle.']);
	assert.deepEqual(music, [null], 'a silent beat reports null so the previous track stops');
});

test('advance stops at the last beat and says so', () => {
	const story = new StorySequence(beats);
	story.advance();
	story.advance();
	assert.equal(story.done, true);
	assert.equal(story.advance(), false, 'there is no fourth page');
	assert.equal(story.position, 2, 'and the last page stays up');
});

test('back turns back a page and stops at the first', () => {
	const story = new StorySequence(beats);
	assert.equal(story.back(), false, 'already at the first page');

	story.goTo(2);
	assert.equal(story.back(), true);
	assert.equal(story.position, 1);
});

test('goTo clamps past either end', () => {
	const story = new StorySequence(beats);
	story.goTo(99);
	assert.equal(story.position, 2);
	story.goTo(-99);
	assert.equal(story.position, 0);
});

test('skip jumps to the end for a player who has read it before', () => {
	const story = new StorySequence(beats);
	story.skip();
	assert.equal(story.position, 2);
	assert.equal(story.done, true);
	assert.equal(story.current?.title, 'End');
});

test('restart returns to the first beat', () => {
	const story = new StorySequence(beats);
	story.skip();
	story.restart();
	assert.equal(story.position, 0);
	assert.equal(story.done, false);
});

test('the current beat music is reported on demand', () => {
	const story = new StorySequence(beats);
	assert.equal(story.music, 'intro.ogg');
	story.goTo(1);
	assert.equal(story.music, null);
});

test('an empty story is done at once and has no beat or music', () => {
	const story = new StorySequence([]);
	assert.equal(story.done, true);
	assert.equal(story.current, null);
	assert.equal(story.music, null);
	assert.equal(story.advance(), false);
	assert.equal(story.back(), false);
});
