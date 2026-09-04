import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Orchestrator } from '../src/audio/Orchestrator.ts';
import { Music } from '../src/audio/Music.ts';
import { Sound } from '../src/audio/Sound.ts';
import type { Playable } from '../src/audio/Playable.ts';

/**
 * A fake `Playable` in place of a real `Audio` element, which nothing outside a browser can
 * create. Both Sound and Music accept a `create` override for exactly this reason.
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

test('entering a state plays its track', () => {
	const tracks: ReturnType<typeof fakeAudio>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudio()) });
	const orchestrator = new Orchestrator(music);

	orchestrator.define('exploring', { track: 'overworld.ogg', fadeDuration: 0 });
	orchestrator.enter('exploring');

	assert.equal(tracks.length, 1);
	assert.equal(tracks[0].playCount, 1);
});

test('re-entering the same state does not restart or refade the track', () => {
	const tracks: ReturnType<typeof fakeAudio>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudio()) });
	const orchestrator = new Orchestrator(music);

	orchestrator.define('combat', { track: 'battle.ogg', fadeDuration: 1 });
	orchestrator.enter('combat');
	orchestrator.enter('combat');
	orchestrator.enter('combat');

	assert.equal(tracks.length, 1, 'only one track instance should ever have been created');
	assert.equal(tracks[0].playCount, 1, 'the track should not be replayed on re-entry');
});

test('entering a different state crossfades to the new track', () => {
	const tracks: ReturnType<typeof fakeAudio>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudio()), volume: 1 });
	const orchestrator = new Orchestrator(music);

	orchestrator.define('exploring', { track: 'overworld.ogg', fadeDuration: 2 });
	orchestrator.define('combat', { track: 'battle.ogg', fadeDuration: 2 });

	orchestrator.enter('exploring');
	const overworld = tracks[0];
	music.update(2); // let the fade-in complete

	orchestrator.enter('combat');
	const battle = tracks[1];
	assert.equal(tracks.length, 2);
	assert.equal(battle.volume, 0);

	music.update(1); // halfway through the 2-second crossfade
	assert.ok(Math.abs(overworld.volume - 0.5) < 0.001);
	assert.ok(Math.abs(battle.volume - 0.5) < 0.001);

	music.update(1); // completes the fade
	assert.equal(overworld.volume, 0);
	assert.ok(overworld.paused);
	assert.equal(battle.volume, 1);
	assert.ok(!battle.paused);
});

test('entering an undefined state throws', () => {
	const orchestrator = new Orchestrator(new Music({ create: fakeAudio }));
	assert.throws(() => orchestrator.enter('nowhere'));
});

test('triggering a registered event plays its cue', () => {
	const audio = fakeAudio();
	const cue = new Sound('hit.wav', { poolSize: 1, create: () => audio });
	const orchestrator = new Orchestrator(new Music({ create: fakeAudio }));

	orchestrator.on('hit', cue);
	orchestrator.trigger('hit');

	assert.equal(audio.playCount, 1);
});

test('triggering an unregistered event is a silent no-op', () => {
	const orchestrator = new Orchestrator(new Music({ create: fakeAudio }));
	assert.doesNotThrow(() => orchestrator.trigger('nothing-registered'));
});

test('two different states that share a track do not refade into each other', () => {
	const tracks: ReturnType<typeof fakeAudio>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudio()) });
	const orchestrator = new Orchestrator(music);

	orchestrator.define('miniboss', { track: 'battle.ogg', fadeDuration: 1 });
	orchestrator.define('combat', { track: 'battle.ogg', fadeDuration: 1 });

	orchestrator.enter('combat');
	orchestrator.enter('miniboss');

	assert.equal(tracks.length, 1, 'the same track should not be recreated for an equivalent state');
});
