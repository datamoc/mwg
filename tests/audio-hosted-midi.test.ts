import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AudioCore } from '../src/audio/CoreHost.ts';
import { parseMidi } from '../src/audio/Midi.ts';
import { playMidiHosted, reportUnderruns, sendMidiToHost } from '../src/audio/HostedMidi.ts';
import { AudioCoreHost } from '../src/audio/CoreHost.ts';
import { StreamChannel } from '../src/audio/StreamChannel.ts';
import { onAudioUnderrun } from '../src/audio/Underrun.ts';
import { FakeAudioContext } from '../src/testing/FakeAudio.ts';

const RATE = 8000;

/** self-contained, since a host may ship it to a worker: a square wave at the pitch of the last note-on */
const squareCore = (sampleRate: number): AudioCore => {
	let frequency = 0;
	let phase = 0;
	return {
		sampleRate,
		event(status, data1, data2) {
			const kind = status & 0xf0;
			if (kind === 0x90 && data2 > 0) frequency = 440 * 2 ** ((data1 - 69) / 12);
			else if (kind === 0x80 || kind === 0x90) frequency = 0;
		},
		sysex() {},
		render(left, right, start, count) {
			for (let i = start; i < start + count; i++) {
				if (frequency > 0) {
					phase = (phase + frequency / sampleRate) % 1;
					const value = phase < 0.5 ? 0.25 : -0.25;
					left[i] += value;
					right[i] += value;
				}
			}
		},
		reset() {
			frequency = 0;
			phase = 0;
		},
	};
};

/** a quarter note of A4 at tick 0, 96 ticks per quarter, 120 bpm: 0.5 s */
function oneNote() {
	const track = [0, 0x90, 69, 100, 96, 0x80, 69, 0, 0, 0xff, 0x2f, 0];
	return parseMidi(
		new Uint8Array([
			...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
			...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
			...track,
		]),
	);
}

test('sendMidiToHost puts the file on the host at its frames and returns the last one', () => {
	const host = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'inline', blockFrames: 256 });
	const last = sendMidiToHost(host, oneNote(), 1000);
	assert.equal(last, 1000 + RATE / 2, 'the note-off is half a second after the note-on');
	const left = new Float32Array(RATE);
	const right = new Float32Array(RATE);
	host.read(left, right, 0, RATE);
	assert.ok(
		left.slice(0, 1000).every((v) => v === 0),
		'silent until the file starts',
	);
	assert.ok(
		left.slice(1100, 4900).some((v) => v !== 0),
		'sounding while the note is held',
	);
	assert.ok(
		left.slice(5100).every((v) => v === 0),
		'quiet after the note-off',
	);
	host.dispose();
});

test('a file started right after the host is made sounds from its first frame on a worker too', async () => {
	const rendered: Record<string, Float32Array> = {};
	for (const mode of ['inline', 'worker'] as const) {
		const host = new AudioCoreHost({
			factory: squareCore,
			sampleRate: RATE,
			mode,
			blockFrames: 256,
			queueSeconds: 1,
		});
		sendMidiToHost(host, oneNote());
		await new Promise((resolve) => setTimeout(resolve, mode === 'worker' ? 400 : 0));
		const left = new Float32Array(RATE / 2);
		const right = new Float32Array(RATE / 2);
		for (let at = 0; at < left.length; at += 500) host.read(left, right, at, Math.min(500, left.length - at));
		rendered[mode] = left;
		host.dispose();
	}
	assert.ok(
		rendered.inline.slice(0, 200).some((value) => value !== 0),
		'the note starts at frame 0',
	);
	assert.deepEqual(rendered.worker, rendered.inline, 'a worker renders exactly what the main thread does');
});

test('playMidiHosted hands the host to a stream channel and stops both', () => {
	const context = new FakeAudioContext(RATE);
	const channel = new StreamChannel(context.asContext(), undefined, { pumpMs: 0 });
	const running = playMidiHosted(oneNote(), { factory: squareCore, sampleRate: RATE, mode: 'inline', channel });
	assert.equal(channel.isPlaying, true);
	assert.equal(running.lastFrame, RATE / 2);
	assert.equal(running.host.stats().mode, 'inline');
	running.stop();
	assert.equal(channel.isPlaying, false);
});

test('underruns reach the sink as a few summed events, never one per dropout', async () => {
	const sent: { name: string; properties?: Record<string, unknown> }[] = [];
	let clock = 0;
	const reporter = reportUnderruns(
		{
			send: (event) => {
				sent.push(event);
				return Promise.resolve();
			},
		},
		{ minIntervalMs: 1000, now: () => clock },
	);
	try {
		onAudioUnderrun.dispatch({ source: 'core', lateSeconds: 0.25 });
		assert.equal(sent.length, 1, 'the first dropout goes out at once');
		clock = 500;
		onAudioUnderrun.dispatch({ source: 'core', lateSeconds: 0.1 });
		onAudioUnderrun.dispatch({ source: 'stream', lateSeconds: 0.2 });
		assert.equal(sent.length, 1, 'later ones wait for the interval');
		clock = 1500;
		onAudioUnderrun.dispatch({ source: 'stream', lateSeconds: 0.05 });
		assert.deepEqual(sent[1], {
			name: 'audio_underrun',
			properties: { count: 3, lateSeconds: 0.35, source: 'mixed' },
		});
		onAudioUnderrun.dispatch({ source: 'stream', lateSeconds: 0.5 });
	} finally {
		reporter.stop();
	}
	assert.equal(sent.length, 3, 'stop flushes what was waiting');
	assert.deepEqual(sent[2].properties, { count: 1, lateSeconds: 0.5, source: 'stream' });
	onAudioUnderrun.dispatch({ source: 'core', lateSeconds: 1 });
	assert.equal(sent.length, 3, 'after stop nothing is forwarded');
});

test('a sink that fails does not break the audio path', () => {
	const reporter = reportUnderruns({ send: () => Promise.reject(new Error('offline')) }, { minIntervalMs: 0 });
	try {
		assert.doesNotThrow(() => onAudioUnderrun.dispatch({ source: 'core', lateSeconds: 0.1 }));
	} finally {
		reporter.stop();
	}
});
