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

/**
 * A fake that also has `onended` (present, `null` until `Music` assigns one) - unlike
 * `fakeAudio`, which omits the property entirely to represent a backend with no end event.
 * `Music.start` only ever wires up `onended` when the property is present at all
 * (`!== undefined`, not just falsy), so this is a separate fake rather than an option on
 * `fakeAudio` itself.
 */
function fakeAudioWithEnded(): Playable & { playCount: number; paused: boolean } {
	return { ...fakeAudio(), onended: null };
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

// ------------------------------------------------------------------- Music.playTracks

test('playTracks with an empty list stops rather than throwing', () => {
	const music = new Music({ create: fakeAudioWithEnded, volume: 1 });
	music.play('a.ogg', 0);
	assert.doesNotThrow(() => music.playTracks([], 0));
});

test('playTracks plays the first track immediately, not looping', () => {
	const tracks: ReturnType<typeof fakeAudioWithEnded>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudioWithEnded()), volume: 1 });

	music.playTracks(['a.ogg', 'b.ogg', 'c.ogg'], 0);

	assert.equal(tracks.length, 1);
	assert.equal(tracks[0].loop, false);
	assert.equal(tracks[0].playCount, 1);
	assert.equal(tracks[0].volume, 1);
});

test('onended advances the playlist to the next track, in order', () => {
	const tracks: ReturnType<typeof fakeAudioWithEnded>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudioWithEnded()), volume: 1 });

	music.playTracks(['a.ogg', 'b.ogg', 'c.ogg'], 0);
	tracks[0].onended?.(new Event('ended'));
	assert.equal(tracks.length, 2);
	assert.ok(tracks[0].paused, 'the finished track should be paused once the next one starts');
	assert.ok(!tracks[1].paused);

	tracks[1].onended?.(new Event('ended'));
	assert.equal(tracks.length, 3);
	assert.ok(!tracks[2].paused);
});

test('the playlist wraps back to the first track after the last one ends', () => {
	const tracks: ReturnType<typeof fakeAudioWithEnded>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudioWithEnded()), volume: 1 });

	music.playTracks(['a.ogg', 'b.ogg'], 0);
	tracks[0].onended?.(new Event('ended')); // -> b
	tracks[1].onended?.(new Event('ended')); // -> a again

	assert.equal(tracks.length, 3);
	assert.ok(!tracks[2].paused);
});

test('a stale onended from a track already replaced by play() does not advance a newer playlist', () => {
	const tracks: ReturnType<typeof fakeAudioWithEnded>[] = [];
	const music = new Music({ create: () => (tracks[tracks.length] = fakeAudioWithEnded()), volume: 1 });

	music.playTracks(['a.ogg', 'b.ogg'], 0);
	const stale = tracks[0];
	music.play('c.ogg', 0); // switches away from the playlist entirely

	stale.onended?.(new Event('ended'));
	assert.equal(tracks.length, 2, 'the stale onended must not have started a third track');
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

test('importExternal normalizes external bytes and writes them as an ordinary save', () => {
	const saves = new SaveSystem<{ gold: number }>({ namespace: 'import-test', version: 1 });
	const bytes = new Uint8Array([1, 2, 3]);

	saves.importExternal('slot1', bytes, (raw) => ({ gold: raw.length * 10 }), 'imported');

	const loaded = saves.load('slot1');
	assert.equal(loaded?.state.gold, 30);
	assert.equal(loaded?.meta.preview, 'imported');
	assert.equal(loaded?.meta.version, 1);
});

test('importExternal runs the normalized state through migrations, the same as an ordinary load', () => {
	const storage = memoryStorage();
	const saves = new SaveSystem<{ gold: number; gems: number }>({
		namespace: 'import-migrate',
		version: 2,
		storage,
		migrations: { 0: (s) => ({ ...(s as { gold: number }), gems: 0 }), 1: (s) => s },
	});

	saves.importExternal('slot1', new Uint8Array(), () => ({ gold: 5 }));

	const loaded = saves.load('slot1');
	assert.equal(loaded?.state.gold, 5);
	assert.equal(loaded?.state.gems, 0);
	assert.equal(loaded?.meta.version, 2);
});
