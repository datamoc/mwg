import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAudioLoader } from '../src/audio/AudioLoader.ts';
import { TrackCache, bufferBytes, createBudgetedLoader } from '../src/audio/BusBudget.ts';
import type { LoadedTrack } from '../src/audio/Channels.ts';
import { fitToBudget, resampleStereo } from '../src/audio/Resample.ts';
import { FakeAudioContext } from '../src/testing/FakeAudio.ts';

const MB = 1024 * 1024;

/** a track of roughly `megabytes` of samples: one channel pair of float32 */
function track(megabytes: number): LoadedTrack {
	const frames = Math.floor((megabytes * MB) / 8);
	return { buffer: new FakeAudioContext().createBuffer(2, frames, 8000) as unknown as AudioBuffer };
}

test('bufferBytes counts 32-bit samples on every channel', () => {
	assert.equal(bufferBytes({ length: 1000, numberOfChannels: 2 }), 8000);
});

test('the cache evicts the least recently used track when the megabyte cap is passed', async () => {
	const cache = new TrackCache({ maxMegabytes: 2.5 });
	await cache.load('a', () => Promise.resolve(track(1)));
	await cache.load('b', () => Promise.resolve(track(1)));
	await cache.load('a', () => assert.fail('a is cached')); //touch a: b is now the oldest
	await cache.load('c', () => Promise.resolve(track(1)));
	const stats = cache.stats();
	assert.equal(stats.entries, 2);
	assert.equal(stats.evictions, 1);
	assert.ok(stats.bytes <= 2.5 * MB);
	let reloaded = false;
	await cache.load('b', () => {
		reloaded = true;
		return Promise.resolve(track(1));
	});
	assert.equal(reloaded, true, 'b was the one evicted');
});

test('the cache honours an entry cap and never evicts the track it just loaded', async () => {
	const cache = new TrackCache({ maxEntries: 2, maxMegabytes: 0.5 });
	await cache.load('a', () => Promise.resolve(track(1)));
	assert.equal(cache.stats().entries, 1, 'a single track bigger than the cap still plays');
	await cache.load('b', () => Promise.resolve(track(0.1)));
	await cache.load('c', () => Promise.resolve(track(0.1)));
	assert.ok(cache.stats().entries <= 2);
});

test('concurrent requests share one load, and a null or a failure is not remembered', async () => {
	const cache = new TrackCache();
	let makes = 0;
	const make = (): Promise<LoadedTrack> => {
		makes++;
		return Promise.resolve(track(0.01));
	};
	await Promise.all([cache.load('a', make), cache.load('a', make)]);
	assert.equal(makes, 1);
	assert.equal(await cache.load('missing', () => Promise.resolve(null)), null);
	assert.equal(cache.stats().entries, 1);
	await assert.rejects(
		cache.load('bad', () => Promise.reject(new Error('decode failed'))),
		/decode failed/,
	);
	assert.equal(cache.stats().entries, 1);
	assert.equal(cache.stats().hits, 1);
});

test('a budgeted loader keys by kind and exposes its cache', async () => {
	const seen: string[] = [];
	const loader = createBudgetedLoader(
		(kind, name) => {
			seen.push(`${kind}:${name}`);
			return Promise.resolve(track(0.01));
		},
		{ maxEntries: 8 },
	);
	await loader('bgm', 'town');
	await loader('se', 'town');
	await loader('bgm', 'town');
	assert.deepEqual(seen, ['bgm:town', 'se:town']);
	assert.equal(loader.cache.stats().entries, 2);
});

test('the audio loader reports progress, skips work for an aborted request and caches under a budget', async () => {
	const context = new FakeAudioContext();
	let reads = 0;
	const decoded = context.createBuffer(2, 1000, 8000);
	(context as unknown as { decodeAudioData: () => Promise<unknown> }).decodeAudioData = () =>
		Promise.resolve(decoded);
	const load = createAudioLoader(context.asContext(), {
		read: () => {
			reads++;
			return Promise.resolve(new ArrayBuffer(16));
		},
		budget: { maxEntries: 4 },
	});
	const fractions: number[] = [];
	const controller = new AbortController();
	const saved = { name: 'a.ogg', volume: 90, pitch: 100, pan: 0, pos: 0 };
	const result = await load('bgm', 'a.ogg', {
		signal: controller.signal,
		track: saved,
		progress: (fraction) => fractions.push(fraction),
	});
	assert.ok(result);
	assert.deepEqual(fractions, [0, 0.5, 1]);
	await load('bgm', 'a.ogg');
	assert.equal(reads, 1, 'second request came from the cache');

	controller.abort();
	const aborted = await load('bgm', 'b.ogg', { signal: controller.signal, track: saved, progress: () => {} });
	assert.equal(aborted, null);
	const retried = await load('bgm', 'b.ogg');
	assert.ok(retried, 'an aborted load is not remembered as a failure');
});

function stereo(frames: number, sampleRate: number): { sampleRate: number; left: Float32Array; right: Float32Array } {
	const left = new Float32Array(frames).fill(1);
	const right = new Float32Array(frames).fill(-1);
	return { sampleRate, left, right };
}

test('resampleStereo halves and doubles a rate and keeps a constant signal constant', () => {
	const half = resampleStereo(stereo(1000, 8000), 4000);
	assert.equal(half.sampleRate, 4000);
	assert.equal(half.left.length, 500);
	assert.ok(half.left.every((v) => Math.abs(v - 1) < 1e-6));
	const double = resampleStereo(stereo(1000, 8000), 16000);
	assert.equal(double.left.length, 2000);
	assert.ok(double.right.every((v) => Math.abs(v + 1) < 1e-6));
	const same = stereo(10, 8000);
	assert.equal(resampleStereo(same, 8000), same);
	assert.throws(() => resampleStereo(same, 0), /positive/);
});

test('fitToBudget cuts with a fade, folds to mono, halves the rate and pulls loop points back', () => {
	const source = { ...stereo(8000 * 10, 8000), loopStart: 2, loopEnd: 10, duration: 10 };
	const cut = fitToBudget(source, { maxSeconds: 4, fadeSeconds: 0.5 });
	assert.equal(cut.left.length, 32000);
	assert.equal(cut.duration, 4);
	assert.equal(cut.loopEnd, 4);
	assert.equal(cut.loopStart, 2);
	assert.equal(cut.left[0], 1);
	assert.ok(cut.left[cut.left.length - 1] < 0.001, 'faded to silence at the cut');

	const mono = fitToBudget(source, { mono: true });
	assert.equal(mono.left, mono.right, 'one shared array');
	assert.equal(mono.left[100], 0, 'opposite channels cancel');

	const small = fitToBudget(source, { maxSeconds: 1, mono: true, halfRate: true });
	assert.equal(small.sampleRate, 4000);
	assert.equal(small.left.length, 4000);

	assert.equal(fitToBudget(source, {}), source);
	assert.equal(fitToBudget(source, { maxSeconds: 20 }), source, 'a track under the limit is untouched');
	assert.throws(() => fitToBudget(source, { maxSeconds: 0 }), /positive/);
});
