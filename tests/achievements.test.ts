import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Achievements } from '../src/core/Achievements.ts';

function tracker(): Achievements {
	const achievements = new Achievements();
	achievements.define({ id: 'first-blood', counter: 'kills', target: 1 });
	achievements.define({ id: 'slayer', counter: 'kills', target: 10 });
	achievements.define({ id: 'rich', counter: 'gold', target: 100 });
	return achievements;
}

test('nothing is unlocked before its counter arrives', () => {
	const achievements = tracker();
	assert.equal(achievements.unlocked('slayer'), false);
	assert.deepEqual(achievements.progress('slayer'), { count: 0, target: 10 });
});

test('crossing a target unlocks it and reports it exactly once', () => {
	const achievements = tracker();
	assert.deepEqual(achievements.increment('kills'), ['first-blood']);
	assert.equal(achievements.unlocked('first-blood'), true);
	assert.deepEqual(achievements.increment('kills', 9), ['slayer']);
	assert.deepEqual(achievements.increment('kills'), [], 'already earned, nothing new');
});

test('one increment can earn several achievements sharing a counter', () => {
	const achievements = tracker();
	assert.deepEqual(achievements.increment('kills', 10), ['first-blood', 'slayer']);
});

test('unrelated counters never unlock each other', () => {
	const achievements = tracker();
	achievements.increment('kills', 50);
	assert.equal(achievements.unlocked('rich'), false);
});

test('drainNew announces each unlock once, then goes quiet', () => {
	const achievements = tracker();
	achievements.increment('gold', 100);
	assert.deepEqual(achievements.drainNew(), ['rich']);
	assert.deepEqual(achievements.drainNew(), []);
});

test('unknown ids throw instead of guessing', () => {
	const achievements = tracker();
	assert.throws(() => achievements.unlocked('missing'), /no such achievement/);
	assert.throws(() => achievements.progress('missing'), /no such achievement/);
});

test('save and restore keeps counts but announces nothing', () => {
	const achievements = tracker();
	achievements.increment('kills', 10);
	const restored = Achievements.fromJSON(
		[
			{ id: 'first-blood', counter: 'kills', target: 1 },
			{ id: 'slayer', counter: 'kills', target: 10 },
			{ id: 'rich', counter: 'gold', target: 100 },
		],
		achievements.toJSON()
	);
	assert.equal(restored.unlocked('slayer'), true);
	assert.deepEqual(restored.drainNew(), []);
});
