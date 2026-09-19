import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Music } from '../src/audio/Music.ts';
import type { Playable } from '../src/audio/Playable.ts';

/** a fake `Playable` in place of a real `Audio` element, which nothing outside a browser can create */
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

test('duck glides the current track to the attenuated level and unduck restores it', () => {
	const audio = fakeAudio();
	const music = new Music({ create: () => audio });
	music.play('town.mp3', 0);
	assert.equal(audio.volume, 1);

	music.duck(0.5, 2);
	music.update(1);
	assert.equal(audio.volume, 0.75);
	music.update(1);
	assert.equal(audio.volume, 0.5);
	assert.equal(music.duckLevel, 0.5);

	music.unduck(2);
	music.update(2);
	assert.equal(audio.volume, 1);
	assert.equal(music.duckLevel, 1);
});

test('duck with no time cuts straight to the level', () => {
	const audio = fakeAudio();
	const music = new Music({ create: () => audio });
	music.play('town.mp3', 0);

	music.duck(0.25, 0);
	assert.equal(audio.volume, 0.25);
});

test('tracks started while ducked start ducked', () => {
	const audios: ReturnType<typeof fakeAudio>[] = [];
	const music = new Music({
		create: () => {
			const audio = fakeAudio();
			audios.push(audio);
			return audio;
		},
	});
	music.play('town.mp3', 0);
	music.duck(0.5, 0);

	music.play('battle.mp3', 0);
	assert.equal(audios[1].volume, 0.5);

	music.unduck(0);
	music.play('boss.mp3', 0);
	assert.equal(audios[2].volume, 1);
});

test('ducking mid-crossfade retargets the pending fade instead of landing loud', () => {
	const audios: ReturnType<typeof fakeAudio>[] = [];
	const music = new Music({
		create: () => {
			const audio = fakeAudio();
			audios.push(audio);
			return audio;
		},
	});
	music.play('town.mp3', 0);
	music.play('battle.mp3', 4);
	music.update(2);

	music.duck(0.5, 0);
	music.update(2);
	assert.equal(audios[1].volume, 0.5);
});

test('duck levels clamp to 0..1 and a non-finite level reads as full', () => {
	const audio = fakeAudio();
	const music = new Music({ create: () => audio });
	music.play('town.mp3', 0);

	music.duck(2, 0);
	assert.equal(audio.volume, 1);
	music.duck(-1, 0);
	assert.equal(audio.volume, 0);
	music.duck(Number.NaN, 0);
	assert.equal(audio.volume, 1);
	assert.equal(music.duckLevel, 1);
});

test('ducking with no current track only holds the level for the next one', () => {
	const music = new Music({ create: () => fakeAudio() });
	music.duck(0.5, 0);
	assert.equal(music.duckLevel, 0.5);
});
