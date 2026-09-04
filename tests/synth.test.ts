import { test } from 'node:test';
import assert from 'node:assert/strict';

import { synthesizeTone, playTone } from '../src/audio/Synth.ts';
import type { Playable } from '../src/audio/Playable.ts';

function decodeWav(uri: string): { sampleRate: number; samples: Int16Array } {
	assert.ok(uri.startsWith('data:audio/wav;base64,'), `not a WAV data URI: ${uri.slice(0, 30)}`);
	const bytes = Buffer.from(uri.slice('data:audio/wav;base64,'.length), 'base64');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
	assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), 'WAVE');
	assert.equal(String.fromCharCode(...bytes.subarray(36, 40)), 'data');

	const sampleRate = view.getUint32(24, true);
	const dataSize = view.getUint32(40, true);
	const samples = new Int16Array(dataSize / 2);
	for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(44 + i * 2, true);
	return { sampleRate, samples };
}

test('synthesizeTone produces a valid WAV with the requested duration and sample rate', () => {
	const { sampleRate, samples } = decodeWav(synthesizeTone({ duration: 0.1, sampleRate: 8000 }));
	assert.equal(sampleRate, 8000);
	assert.equal(samples.length, 800);
});

test('the same options reproduce the same waveform, including noise given the same seed', () => {
	const a = synthesizeTone({ waveform: 'noise', seed: 42, duration: 0.05, sampleRate: 4000 });
	const b = synthesizeTone({ waveform: 'noise', seed: 42, duration: 0.05, sampleRate: 4000 });
	assert.equal(a, b);

	const c = synthesizeTone({ waveform: 'noise', seed: 7, duration: 0.05, sampleRate: 4000 });
	assert.notEqual(a, c);
});

test('square, triangle, sine and noise are all audibly different waveforms', () => {
	const options = { frequency: 220, duration: 0.05, sampleRate: 4000, decay: 0 } as const;
	const square = decodeWav(synthesizeTone({ ...options, waveform: 'square' })).samples;
	const triangle = decodeWav(synthesizeTone({ ...options, waveform: 'triangle' })).samples;
	const sine = decodeWav(synthesizeTone({ ...options, waveform: 'sine' })).samples;

	assert.notDeepEqual([...square], [...triangle]);
	assert.notDeepEqual([...triangle], [...sine]);
	assert.notDeepEqual([...square], [...sine]);

	//a square wave only ever sits at its two extremes
	const distinctSquareValues = new Set(square);
	assert.ok(distinctSquareValues.size <= 2, `square wave had ${distinctSquareValues.size} distinct values`);
});

test('decay fades the envelope toward zero by the end of the tone', () => {
	const { samples } = decodeWav(synthesizeTone({ waveform: 'square', frequency: 100, duration: 0.2, sampleRate: 4000, decay: 12 }));
	const early = Math.abs(samples[10]);
	const late = Math.abs(samples[samples.length - 1]);
	assert.ok(late < early, `expected decay: early=${early}, late=${late}`);
});

test('decay: 0 holds full amplitude for the whole tone', () => {
	const { samples } = decodeWav(synthesizeTone({ waveform: 'square', frequency: 100, duration: 0.1, sampleRate: 4000, decay: 0, volume: 1 }));
	assert.ok(Math.abs(samples[0]) > 0x7ff0);
	assert.ok(Math.abs(samples[samples.length - 1]) > 0x7ff0);
});

test('rejects a non-positive duration, frequency, or sample rate', () => {
	assert.throws(() => synthesizeTone({ duration: 0 }), /duration/);
	assert.throws(() => synthesizeTone({ frequency: 0 }), /frequency/);
	assert.throws(() => synthesizeTone({ sampleRate: 0 }), /sample rate/);
});

test('noise does not require a frequency', () => {
	assert.doesNotThrow(() => synthesizeTone({ waveform: 'noise' }));
});

test('playTone hands the generated URI to create() and plays the result', () => {
	let receivedUri = '';
	const fake: Playable & { playCount: number } = {
		playCount: 0,
		volume: 1,
		currentTime: 0,
		loop: false,
		play() {
			this.playCount++;
		},
		pause() {},
	};

	const playable = playTone({ duration: 0.05 }, (uri) => {
		receivedUri = uri;
		return fake;
	});

	assert.ok(receivedUri.startsWith('data:audio/wav;base64,'));
	assert.equal(playable, fake);
	assert.equal(fake.playCount, 1);
});
