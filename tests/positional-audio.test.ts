import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioListener, SoundSource, audioGain, audioPan } from '../src/audio/Positional.ts';
import { Sound } from '../src/audio/Sound.ts';
import type { Playable } from '../src/audio/Playable.ts';

function fakeAudio(): Playable & { playCount: number } {
	return {
		playCount: 0,
		volume: 1,
		currentTime: 0,
		loop: false,
		play() {
			this.playCount++;
		},
		pause() {},
	};
}

test('audioGain is 1 up to the reference distance and an inverse curve past it', () => {
	assert.equal(audioGain(0, { refDistance: 2 }), 1);
	assert.equal(audioGain(2, { refDistance: 2 }), 1, 'the reference distance itself is full volume');
	assert.equal(audioGain(4, { refDistance: 2 }), 0.5);
	assert.equal(audioGain(8, { refDistance: 2 }), 0.25);
});

test('audioGain reaches zero exactly at maxDistance and stays there', () => {
	assert.equal(audioGain(9.999, { refDistance: 1, maxDistance: 10 }) > 0, true);
	assert.equal(audioGain(10, { refDistance: 1, maxDistance: 10 }), 0, 'the edge of hearing is silent');
	assert.equal(audioGain(100, { refDistance: 1, maxDistance: 10 }), 0);
});

test('a higher rolloff drops the gain faster', () => {
	const linear = audioGain(4, { refDistance: 2, rolloff: 1 });
	const square = audioGain(4, { refDistance: 2, rolloff: 2 });
	assert.equal(linear, 0.5);
	assert.equal(square, 0.25);
	assert.ok(square < linear, 'the squared law is quieter at the same distance');
});

test('audioGain defaults to a reference distance of 1 with no maximum', () => {
	assert.equal(audioGain(0.5), 1);
	assert.equal(audioGain(1), 1);
	assert.equal(audioGain(2), 0.5);
	assert.equal(audioGain(1000) > 0, true, 'no maximum means never fully silent');
});

test('audioPan puts a sound to the listener right or left of its facing', () => {
	const facingEast = { x: 0, y: 0, facing: 0 };

	assert.equal(audioPan(facingEast, { x: 10, y: 0 }), 0, 'straight ahead');
	assert.equal(audioPan(facingEast, { x: 0, y: 10 }), 1, 'to the right');
	assert.equal(audioPan(facingEast, { x: 0, y: -10 }), -1, 'to the left');
	assert.equal(audioPan(facingEast, { x: -10, y: 0 }), 0, 'directly behind');
});

test('turning the listener turns what counts as right', () => {
	const facingSouth = { x: 0, y: 0, facing: Math.PI / 2 };
	assert.ok(Math.abs(audioPan(facingSouth, { x: 10, y: 0 }) - 1) < 1e-9, 'world east is now the right');
	assert.ok(Math.abs(audioPan(facingSouth, { x: 0, y: 10 }) - 0) < 1e-9, 'world south is now straight ahead');
});

test('panning is centred at zero distance, with no direction to report', () => {
	assert.equal(audioPan({ x: 3, y: 4, facing: 1 }, { x: 3, y: 4 }), 0);
});

test('an AudioListener moves and faces by method, not by poking its fields', () => {
	const listener = new AudioListener();
	assert.deepEqual({ x: listener.x, y: listener.y, facing: listener.facing }, { x: 0, y: 0, facing: 0 });

	listener.moveTo(4, 9);
	listener.face(Math.PI);
	assert.deepEqual({ x: listener.x, y: listener.y, facing: listener.facing }, { x: 4, y: 9, facing: Math.PI });
});

test('a SoundSource mixes by distance and applies that gain through Sound.play', () => {
	const instances: ReturnType<typeof fakeAudio>[] = [];
	const sound = new Sound('arrow.mp3', {
		volume: 0.8,
		create: () => {
			const audio = fakeAudio();
			instances.push(audio);
			return audio;
		},
	});

	const listener = new AudioListener({ x: 0, y: 0 });
	const source = new SoundSource(sound, { x: 6, y: 8, refDistance: 4, maxDistance: 20 });

	assert.equal(source.gainTo(listener), 0.4, 'distance 10, reference 4');
	source.x = 0;
	source.y = 0;
	assert.equal(source.gainTo(listener), 1, 'on top of the listener');

	source.moveTo(6, 8);
	const gained = source.playFor(listener);
	assert.equal(gained, 0.4);
	assert.equal(instances.length, 4, 'the pool was allocated once, nothing new per play');
	assert.equal(instances[0].volume, 0.8 * 0.4, 'the base volume times the distance gain');
	assert.equal(instances[0].playCount, 1);
});

test('a SoundSource past maxDistance stays silent instead of playing at volume 0', () => {
	const instances: ReturnType<typeof fakeAudio>[] = [];
	const sound = new Sound('drip.mp3', {
		create: () => {
			const audio = fakeAudio();
			instances.push(audio);
			return audio;
		},
	});

	const listener = new AudioListener();
	const source = new SoundSource(sound, { x: 50, y: 0, refDistance: 1, maxDistance: 10 });
	assert.equal(source.gainTo(listener), 0);
	assert.equal(source.playFor(listener), 0);
	assert.equal(instances[0].playCount, 0, 'nothing was played');
});

test('a SoundSource reports its pan against a listener that has a facing', () => {
	const sound = new Sound('bell.mp3', { create: () => fakeAudio() });
	const source = new SoundSource(sound, { x: 0, y: 5 });
	const listener = new AudioListener({ facing: 0 });
	assert.equal(source.panTo(listener), 1);
});
