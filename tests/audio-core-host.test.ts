import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioCoreHost, type AudioCore } from '../src/audio/CoreHost.ts';
import { onAudioUnderrun } from '../src/audio/Underrun.ts';
import { StreamChannel } from '../src/audio/StreamChannel.ts';
import { FakeAudioContext } from '../src/testing/FakeAudio.ts';

/**
 * Self-contained by necessity (it is shipped to a worker as text): a square wave that sounds at
 * the pitch of the last note-on and goes quiet on note-off, with a tone fully determined by the
 * frames rendered so far, so a worker and the main thread must agree to the bit.
 */
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

const RATE = 8000;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** reads `frames` frames in steps of 500, polling until the queue could keep up */
async function readAll(host: AudioCoreHost, frames: number): Promise<Float32Array> {
	const out = new Float32Array(frames);
	const unused = new Float32Array(frames);
	for (let at = 0; at < frames; at += 500) {
		host.read(out, unused, at, Math.min(500, frames - at));
		await sleep(5);
	}
	return out;
}

test('an inline host renders what the core makes, with events applied at their frame', async () => {
	const host = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'inline', blockFrames: 256 });
	assert.equal(host.mode, 'inline');
	host.event(0x90, 69, 100, 1000);
	host.event(0x80, 69, 0, 3000);
	const out = await readAll(host, 4000);
	assert.ok(
		out.slice(0, 1000).every((v) => v === 0),
		'silent before the note',
	);
	assert.ok(
		out.slice(1000, 3000).some((v) => v !== 0),
		'sounding while held',
	);
	assert.ok(
		out.slice(3000).every((v) => v === 0),
		'silent after the note-off',
	);
	assert.equal(host.stats().underruns, 0);
	host.dispose();
});

test('a worker host produces exactly the audio the inline host does', async () => {
	const inline = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'inline', blockFrames: 256 });
	const worker = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'worker', blockFrames: 256 });
	try {
		assert.equal(worker.mode, 'worker');
		for (const host of [inline, worker]) {
			//beyond the worker's start-up queue, so both hosts apply them on exactly these frames
			host.event(0x90, 60, 100, 3000);
			host.event(0x90, 72, 100, 4500);
			host.event(0x80, 72, 0, 5300);
		}
		//give the worker time to start and fill its queue before the first read
		await sleep(300);
		const a = await readAll(inline, 7000);
		const b = await readAll(worker, 7000);
		assert.deepEqual(b, a);
		assert.ok(b.some((v) => v !== 0));
	} finally {
		inline.dispose();
		worker.dispose();
	}
});

test('a late block leaves silence, counts one underrun and keeps later events on their frames', async () => {
	const host = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'worker', blockFrames: 256 });
	const reported: number[] = [];
	const shared: string[] = [];
	host.onUnderrun.add((seconds) => {
		reported.push(seconds);
	});
	const listener = (event: { source: string }): void => {
		shared.push(event.source);
	};
	onAudioUnderrun.add(listener);
	try {
		await sleep(300); //warm: the first blocks have arrived
		const left = new Float32Array(100_000);
		const right = new Float32Array(100_000);
		//asking for far more than the queue holds forces a shortfall
		host.read(left, right, 0, 100_000);
		assert.ok(host.stats().underruns >= 1);
		assert.ok(reported[0] > 0.5);
		assert.ok(shared.includes('core'));
	} finally {
		onAudioUnderrun.remove(listener);
		host.dispose();
	}
});

test('no underrun is counted before the first block has arrived', () => {
	const host = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'worker' });
	try {
		const out = new Float32Array(256);
		host.read(out, new Float32Array(256), 0, 256);
		assert.equal(host.stats().underruns, 0);
		assert.ok(out.every((v) => v === 0));
	} finally {
		host.dispose();
	}
});

test('seeking to another frame resets the core, seeking to the same frame does not', async () => {
	const host = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'inline', blockFrames: 256 });
	host.event(0x90, 69, 100, 0);
	const first = await readAll(host, 600);
	assert.ok(first.some((v) => v !== 0));
	host.seek(600);
	const same = await readAll(host, 600);
	assert.ok(
		same.some((v) => v !== 0),
		'the note kept sounding',
	);
	host.seek(5000);
	const after = new Float32Array(500);
	host.read(after, new Float32Array(500), 0, 500);
	assert.ok(
		after.every((v) => v === 0),
		'a reset silences the held note',
	);
	host.dispose();
});

test('the load figure is render time over audio time', async () => {
	const host = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'inline', blockFrames: 256 });
	await readAll(host, 2000);
	const { load } = host.stats();
	assert.ok(load > 0 && load < 1, `load ${load} for a trivial core`);
	host.dispose();
});

test('a core that cannot be built is the constructor error inline and silence from a worker', async () => {
	const broken = (): AudioCore => {
		throw new Error('no ROM');
	};
	assert.throws(() => new AudioCoreHost({ factory: broken, sampleRate: RATE, mode: 'inline' }), /no ROM/);
	const host = new AudioCoreHost({ factory: broken, sampleRate: RATE, mode: 'worker' });
	await sleep(300);
	const out = new Float32Array(100);
	assert.doesNotThrow(() => host.read(out, new Float32Array(100), 0, 100));
	assert.match(host.stats().fallbackReason ?? '', /no ROM/);
	assert.equal(host.mode, 'inline');
	host.dispose();
});

test('the host is a BlockSource a StreamChannel plays', () => {
	const context = new FakeAudioContext(RATE);
	const host = new AudioCoreHost({ factory: squareCore, sampleRate: RATE, mode: 'inline', blockFrames: 256 });
	host.event(0x90, 69, 100, 0);
	const channel = new StreamChannel(context.asContext(), undefined, { pumpMs: 0 });
	channel.play(host);
	const first = context.sources[0].buffer!.getChannelData(0);
	assert.ok(first.some((v) => v !== 0));
	assert.equal(channel.isPlaying, true);
	channel.stop();
	host.dispose();
});

test('invalid options are refused', () => {
	assert.throws(() => new AudioCoreHost({ factory: squareCore, sampleRate: 0 }), /positive/);
});
