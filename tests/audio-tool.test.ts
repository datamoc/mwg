import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodeWav, encodeWav, wavInfo } from '../src/audio/Wav.ts';
import { spectralDistance } from '../src/audio/SpectralDistance.ts';
import {
	audioBudget,
	compareWavs,
	detectAudioFormat,
	inspectAudio,
	parseChannelList,
	renderToWav,
	resampleWav,
} from '../tools/audio.mjs';

const TOOL = new URL('../tools/audio.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** channel 0 plays A4 for half a second, channel 9 a kick after it: format 0, 96 ticks per quarter */
function midi(): Uint8Array {
	const track = [0, 0xc0, 5, 0, 0x90, 69, 100, 96, 0x80, 69, 0, 0, 0x99, 36, 100, 96, 0x89, 36, 0, 0, 0xff, 0x2f, 0];
	return new Uint8Array([
		...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
		...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
		...track,
	]);
}

function sine(
	hz: number,
	seconds: number,
	rate = 8000,
): { sampleRate: number; left: Float32Array; right: Float32Array } {
	const left = Float32Array.from(
		{ length: Math.floor(seconds * rate) },
		(_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate),
	);
	return { sampleRate: rate, left, right: left.slice() };
}

function scratch<T>(use: (dir: string) => T | Promise<T>): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), 'mwg-audio-'));
	return Promise.resolve(use(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test('WAV round trip: 16-bit within one step, float exactly, the header read without the samples', () => {
	const frames = sine(440, 0.25);
	const pcm = encodeWav(frames);
	const decoded = decodeWav(pcm);
	assert.equal(decoded.sampleRate, 8000);
	assert.equal(decoded.left.length, frames.left.length);
	assert.ok(frames.left.every((v, i) => Math.abs(v - decoded.left[i]) < 1 / 32767));
	assert.deepEqual(decodeWav(encodeWav(frames, 'float32')).left, frames.left);
	assert.deepEqual(wavInfo(pcm), {
		channels: 2,
		sampleRate: 8000,
		bitsPerSample: 16,
		encoding: 'pcm',
		frames: 2000,
		seconds: 0.25,
	});
	assert.throws(() => wavInfo(new Uint8Array(20)), /not a RIFF/);
	assert.throws(
		() => encodeWav({ sampleRate: 8000, left: new Float32Array(2), right: new Float32Array(3) }),
		/same length/,
	);
});

test('spectral distance is zero for identical audio, small for the same tone, large for another pitch', () => {
	const a = sine(440, 0.5);
	assert.equal(spectralDistance(a, a).decibels, 0);
	const quieter = { ...a, left: a.left.map((v) => v * 0.5), right: a.right.map((v) => v * 0.5) };
	const sameTone = spectralDistance(a, quieter).decibels;
	const otherTone = spectralDistance(a, sine(660, 0.5)).decibels;
	assert.ok(Math.abs(sameTone - 6.02) < 0.5, `halving the level is 6 dB, got ${sameTone}`);
	assert.ok(otherTone > sameTone * 2);
	//the rate is matched first: the same tone at another rate is close
	assert.ok(spectralDistance(a, sine(440, 0.5, 16000)).decibels < 3);
	assert.throws(() => spectralDistance(a, a, { windowSize: 100 }), /power of two/);
});

test('formats are recognised by their signature, with the extension as a fallback', () => {
	assert.deepEqual(detectAudioFormat(midi()), { format: 'MIDI', kind: 'midi' });
	assert.equal(detectAudioFormat(encodeWav(sine(440, 0.1))).kind, 'wav');
	assert.equal(detectAudioFormat(new TextEncoder().encode('MWA1....')).format, 'MWA');
	assert.equal(detectAudioFormat(new TextEncoder().encode('NESM\x1a....')).format, 'NSF');
	assert.equal(detectAudioFormat(new TextEncoder().encode('PSID....')).format, 'SID');
	assert.equal(detectAudioFormat(new TextEncoder().encode('Vgm ....')).format, 'VGM');
	assert.equal(detectAudioFormat(new TextEncoder().encode('OggS\0\x02' + '\0'.repeat(30))).kind, 'compressed');
	assert.equal(detectAudioFormat(Uint8Array.from([0xf0, 0x41, 0x10, 0x14, 0x12, 0xf7])).kind, 'sysex');
	assert.equal(detectAudioFormat(new Uint8Array(4), 'x.bin').kind, 'unknown');
});

test('inspecting a MIDI file lists its notes per channel; a SysEx dump its messages and makers', async () => {
	const report = await inspectAudio(midi(), 'tune.mid');
	assert.equal(report.format, 'MIDI');
	assert.equal(report.notes, 2);
	assert.equal(report.seconds, 1);
	assert.deepEqual(report.channels, { 0: { notes: 1, programs: [5] }, 9: { notes: 1, programs: ['drums'] } });
	const syx = Uint8Array.from([0xf0, 0x41, 1, 0xf7, 0xf0, 0x43, 2, 3, 0xf7]);
	const dump = await inspectAudio(syx, 'bank.syx');
	assert.equal(dump.messages, 2);
	assert.deepEqual(dump.makers, ['Roland', 'Yamaha']);
	assert.equal(dump.largestMessage, 5);
});

test('rendering produces a WAV whose length and channels follow the file and the options', async () => {
	const full = decodeWav(await renderToWav(midi(), { rate: 8000 }));
	const melody = decodeWav(await renderToWav(midi(), { rate: 8000, channels: [0] }));
	assert.equal(full.sampleRate, 8000);
	assert.ok(full.left.length > 8000, 'a second of notes plus a tail');
	assert.ok(melody.left.some((v) => v !== 0));
	const drumOnset = 4000 + 400;
	assert.ok(melody.left.slice(drumOnset, drumOnset + 800).every((v) => Math.abs(v) < 0.2));
	assert.equal(wavInfo(await renderToWav(midi(), { rate: 8000, float: true })).encoding, 'float');
	assert.deepEqual(parseChannelList('0, 9'), [0, 9]);
	assert.throws(() => parseChannelList('16'), /0 to 15/);
});

test('rendering through an engine module registers it first, and an unknown engine still renders', async () => {
	await scratch(async (dir) => {
		const module = join(dir, 'engine.mjs');
		writeFileSync(
			module,
			`import { registerMidiSynth } from ${JSON.stringify(new URL('../src/audio/MidiSynth.ts', import.meta.url).href)};
registerMidiSynth('test:silent', (sampleRate) => ({ sampleRate, event() {}, sysex() {}, render() {}, reset() {} }));`,
		);
		const silent = decodeWav(await renderToWav(midi(), { synth: 'test:silent', modules: [module], rate: 8000 }));
		assert.ok(
			silent.left.every((v) => v === 0),
			'the registered engine voiced the file',
		);
		const fallback = decodeWav(await renderToWav(midi(), { synth: 'test:never-registered', rate: 8000 }));
		assert.ok(
			fallback.left.some((v) => v !== 0),
			'an unknown engine falls back to the built-in synth',
		);
	});
});

test('resampling a WAV changes its rate and keeps its length in seconds', async () => {
	const half = await resampleWav(encodeWav(sine(440, 1)), 4000);
	assert.deepEqual([wavInfo(half).sampleRate, wavInfo(half).seconds], [4000, 1]);
});

test('compare reports a distance and the budget counts page and decoded bytes, flagging an overrun', async () => {
	assert.equal((await compareWavs(encodeWav(sine(440, 0.3)), encodeWav(sine(440, 0.3)))).decibels, 0);
	await scratch(async (dir) => {
		writeFileSync(join(dir, 'a.mid'), midi());
		writeFileSync(join(dir, 'b.wav'), encodeWav(sine(440, 2)));
		writeFileSync(join(dir, 'c.ogg'), Buffer.from('OggS\0\x02' + '\0'.repeat(30)));
		writeFileSync(join(dir, 'notes.txt'), 'ignored');
		const report = await audioBudget([dir], { rate: 8000 });
		assert.deepEqual(
			report.files.map((f) => [f.path.split(/[\\/]/).pop(), f.format]),
			[
				['a.mid', 'MIDI'],
				['b.wav', 'WAV'],
				['c.ogg', 'Ogg'],
			],
		);
		const [mid, wav, ogg] = report.files;
		assert.equal(
			mid.decodedBytes,
			Math.ceil(2.5 * 8000) * 8,
			'a MIDI render: seconds plus the 1.5 s tail, stereo float',
		);
		assert.equal(wav.decodedBytes, 2 * 8000 * 8);
		assert.equal(ogg.decodedBytes, null, 'a compressed file cannot be sized without decoding it');
		assert.equal(wav.pageBytes, Math.ceil((wav.diskBytes * 4) / 3));
		assert.deepEqual(report.problems, []);
		const tight = await audioBudget([dir], { rate: 8000, maxMegabytes: 0.1, maxTrackSeconds: 1 });
		assert.equal(tight.problems.length, 2);
	});
});

test('the command line inspects, renders, converts, compares and refuses what it cannot do', async () => {
	await scratch((dir) => {
		const run = (...args: string[]): string =>
			execFileSync(process.execPath, [TOOL, ...args], {
				cwd: dir,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		writeFileSync(join(dir, 'tune.mid'), midi());
		assert.match(run('--help'), /mwg-audio <command>/);
		assert.match(run('inspect', 'tune.mid'), /"notes": 2/);
		assert.match(run('render', 'tune.mid', '-o', 'out/tune.wav', '--rate', '8000'), /wrote out/);
		assert.equal(wavInfo(readFileSync(join(dir, 'out', 'tune.wav'))).sampleRate, 8000);
		run('convert', 'tune.mid', 'direct.wav', '--rate', '8000');
		run('convert', 'direct.wav', 'low.wav', '--rate', '4000');
		assert.equal(wavInfo(readFileSync(join(dir, 'low.wav'))).sampleRate, 4000);
		assert.match(run('compare', 'direct.wav', 'out/tune.wav'), /^0\.00 dB/);
		assert.match(run('budget', '.', '--rate', '8000'), /total:/);
		assert.throws(() => run('convert', 'tune.mid', 'x.mwa'), /retro-audio package/);
		assert.throws(() => run('budget', '.', '--rate', '8000', '--max-mb', '0.001'), /budget/);
		assert.throws(() => run('frobnicate'), /unknown command/);
	});
});
