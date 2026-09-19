import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Sound } from '../src/audio/Sound.ts';
import { Music } from '../src/audio/Music.ts';
import { Orchestrator } from '../src/audio/Orchestrator.ts';
import type { Playable } from '../src/audio/Playable.ts';

/**
 * A fake `Playable` in place of a real `Audio` element, which nothing outside a browser can
 * create - the same seam tests/audio.test.ts uses.
 */
function fakeAudio(): Playable & { playCount: number; paused: boolean } {
	return {
		playCount: 0,
		paused: true,
		volume: 1,
		currentTime: 0,
		loop: false,
		play() {
			this.playCount++;
			this.paused = false;
		},
		pause() {
			this.paused = true;
		},
	};
}

test('Music.suspend pauses the current track and freezes update until resume', () => {
	const audio = fakeAudio();
	const music = new Music({ create: () => audio });
	music.play('town.mp3', 0);
	assert.equal(audio.paused, false);

	music.suspend();
	assert.equal(music.isSuspended, true);
	assert.equal(audio.paused, true);

	music.update(10);
	music.resume();
	assert.equal(music.isSuspended, false);
	assert.equal(audio.paused, false);
	assert.equal(audio.playCount, 2);
});

test('Music.update while suspended advances no fade', () => {
	const audio = fakeAudio();
	const music = new Music({ create: () => audio });
	music.play('town.mp3', 0);
	music.play('battle.mp3', 4);
	music.suspend();

	music.update(4);
	assert.equal(audio.volume, 0, 'the incoming fade never ran while suspended');
});

test('Music.resume without suspend does nothing, and suspend is idempotent', () => {
	const audio = fakeAudio();
	const music = new Music({ create: () => audio });
	music.play('town.mp3', 0);

	music.resume();
	assert.equal(audio.playCount, 1);

	music.suspend();
	music.suspend();
	music.resume();
	assert.equal(audio.playCount, 2);
});

test('Sound.suspend cuts in-flight sounds and silences play until resume', () => {
	const audio = fakeAudio();
	const sound = new Sound('hit.mp3', { poolSize: 1, create: () => audio });
	sound.play();
	assert.equal(audio.playCount, 1);

	sound.suspend();
	assert.equal(sound.isSuspended, true);
	assert.equal(audio.paused, true);

	sound.play();
	assert.equal(audio.playCount, 1, 'no new instance plays while suspended');

	sound.resume();
	sound.play();
	assert.equal(audio.playCount, 2);
});

test('Orchestrator suspend and resume reach the music and every cue', () => {
	const musicAudio = fakeAudio();
	const cueAudio = fakeAudio();
	const orchestrator = new Orchestrator(new Music({ create: () => musicAudio }));
	orchestrator.define('exploring', { track: 'music/town.mp3', fadeDuration: 0 });
	orchestrator.on('levelUp', new Sound('sounds/level-up.mp3', { create: () => cueAudio }));
	orchestrator.enter('exploring');
	orchestrator.trigger('levelUp');
	assert.equal(cueAudio.playCount, 1);

	orchestrator.suspend();
	assert.equal(musicAudio.paused, true);
	orchestrator.trigger('levelUp');
	assert.equal(cueAudio.playCount, 1, 'cues stay silent while suspended');

	orchestrator.resume();
	orchestrator.trigger('levelUp');
	assert.equal(cueAudio.playCount, 2);
});
