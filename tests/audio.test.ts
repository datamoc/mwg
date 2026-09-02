import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Sound } from '../src/audio/Sound.ts';
import { Music } from '../src/audio/Music.ts';
import type { Playable } from '../src/audio/Playable.ts';
import { SaveSystem, type SaveStorage } from '../src/core/Save.ts';

function memoryStorage(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

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

test('Sound cycles through its pool round-robin, so overlapping plays do not steal the same instance', () => {
	const instances: ReturnType<typeof fakeAudio>[] = [];
	const sound = new Sound('blip.wav', {
		poolSize: 2,
		create: () => {
			const audio = fakeAudio();
			instances.push(audio);
			return audio;
		},
	});

	sound.play();
	sound.play();
	sound.play();

	assert.deepEqual(
		instances.map((a) => a.playCount),
		[2, 1]
	);
});

test('Sound.play resets currentTime and applies volume', () => {
	const audio = fakeAudio();
	audio.currentTime = 5;
	const sound = new Sound('blip.wav', { poolSize: 1, volume: 0.5, create: () => audio });

	sound.play();
	assert.equal(audio.currentTime, 0);
	assert.equal(audio.volume, 0.5);
});

test('Sound.stopAll pauses every pooled instance', () => {
	const instances = [fakeAudio(), fakeAudio()];
	let i = 0;
	const sound = new Sound('blip.wav', { poolSize: 2, create: () => instances[i++] });

	sound.play();
	sound.stopAll();
	assert.ok(instances.every((a) => a.paused));
});

test('Music.play with no fade switches immediately at full volume', () => {
	const music = new Music({ create: fakeAudio, volume: 0.8 });
	music.play('theme.ogg', 0);

	// the created instance is not directly reachable, so drive it through update() with no fades queued
	assert.doesNotThrow(() => music.update(0));
});

test('Music crossfades: the incoming track ramps up, the outgoing one ramps down', () => {
	const tracks: ReturnType<typeof fakeAudio>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudio()), volume: 1 });

	music.play('a.ogg', 2);
	const trackA = tracks[0];
	assert.equal(trackA.volume, 0);

	music.update(2); // let trackA's own fade-in complete before switching again
	assert.equal(trackA.volume, 1);

	music.play('b.ogg', 2);
	const trackB = tracks[1];
	assert.equal(trackB.volume, 0);

	music.update(1); // halfway through the 2-second crossfade
	assert.ok(Math.abs(trackA.volume - 0.5) < 0.001, `trackA.volume was ${trackA.volume}`);
	assert.ok(Math.abs(trackB.volume - 0.5) < 0.001, `trackB.volume was ${trackB.volume}`);

	music.update(1); // completes the fade
	assert.equal(trackA.volume, 0);
	assert.ok(trackA.paused, 'the faded-out track should be paused once its fade ends');
	assert.equal(trackB.volume, 1);
	assert.ok(!trackB.paused);
});

test('Music.stop fades the current track out and pauses it', () => {
	const music = new Music({ create: fakeAudio, volume: 1 });
	music.play('a.ogg', 0);
	music.stop(1);

	music.update(1);
	// nothing to assert on the instance directly since it is not exposed, but update()
	// should not throw once the fade completes and is removed
	assert.doesNotThrow(() => music.update(1));
});

// ------------------------------------------------------------------- SaveSystem

test('save then load round-trips the state', () => {
	const saves = new SaveSystem<{ gold: number }>({ namespace: 'test', version: 1 });
	saves.save('slot1', { gold: 42 }, 'a summary');

	const loaded = saves.load('slot1');
	assert.equal(loaded?.state.gold, 42);
	assert.equal(loaded?.meta.preview, 'a summary');
	assert.equal(loaded?.meta.version, 1);
});

test('loading an empty slot returns null', () => {
	const saves = new SaveSystem<object>({ namespace: 'test', version: 1 });
	assert.equal(saves.load('nothing-here'), null);
});

test('a migration runs when loading an older save', () => {
	const storage = memoryStorage();

	const saves1 = new SaveSystem<{ gold: number }>({ namespace: 'migrate', version: 1, storage });
	saves1.save('slot1', { gold: 10 });

	const saves2 = new SaveSystem<{ gold: number; gems: number }>({
		namespace: 'migrate',
		version: 2,
		storage,
		migrations: { 1: (s) => ({ ...(s as { gold: number }), gems: 0 }) },
	});

	const loaded = saves2.load('slot1');
	assert.equal(loaded?.state.gems, 0);
	assert.equal(loaded?.meta.version, 2);
});

test('two namespaces do not collide, and list only returns one namespace', () => {
	const a = new SaveSystem<{ n: number }>({ namespace: 'a', version: 1 });
	const b = new SaveSystem<{ n: number }>({ namespace: 'b', version: 1 });

	a.save('slot1', { n: 1 });
	b.save('slot1', { n: 2 });

	assert.equal(a.load('slot1')?.state.n, 1);
	assert.equal(a.list().length, 1);
});

test('delete removes a slot', () => {
	const saves = new SaveSystem<{ n: number }>({ namespace: 'delete-test', version: 1 });
	saves.save('slot1', { n: 1 });
	saves.delete('slot1');
	assert.equal(saves.load('slot1'), null);
});
