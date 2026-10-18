import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { decodeFlac, encodeFlac, flacSampleDecoder, flacSampleEncoder } from '../src/audio/Flac.ts';
import { detectSampleCodec } from '../src/audio/SampleCodec.ts';
import { decodeSoundFont, encodeSoundFont, parseSoundFont } from '../src/audio/SoundFont.ts';
import { buildSf3, fakeDecode } from './helpers/soundfont3.ts';

/**
 * The codecs a SoundFont 3 sample may use: detected from the bytes, FLAC read and written with
 * nothing installed, and a SoundFont 2 compressed into a SoundFont 3 and back. Vorbis and Opus
 * need an encoder from outside, so those paths run through a stand-in here and through ffmpeg
 * in tests/soundfonts-tool.test.ts.
 */

const ascii = (text: string): number[] => [...Buffer.from(text, 'latin1')];

/** a minimal Ogg first page: 27 header bytes, one segment, then the identification packet */
function oggPage(packet: number[]): Uint8Array {
	return Uint8Array.from([...ascii('OggS'), 0, 2, ...new Array(20).fill(0), 1, packet.length, ...packet]);
}

function sine(length: number, amplitude: number, period: number): Int16Array {
	return Int16Array.from({ length }, (_, index) => Math.round(amplitude * Math.sin((2 * Math.PI * index) / period)));
}

function noise(length: number, amplitude: number): Int16Array {
	let state = 12345;
	return Int16Array.from({ length }, () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return (state % (2 * amplitude + 1)) - amplitude;
	});
}

const ffmpegMissing = spawnSync('ffmpeg', ['-version']).error !== undefined;

test('the codec is read from the first bytes, and an unknown one is named as such', () => {
	assert.equal(detectSampleCodec(oggPage([1, ...ascii('vorbis'), 0, 0])), 'vorbis');
	assert.equal(detectSampleCodec(oggPage([...ascii('OpusHead'), 1, 1])), 'opus');
	assert.equal(detectSampleCodec(Uint8Array.from(ascii('fLaC'))), 'flac');
	assert.throws(() => detectSampleCodec(oggPage(ascii('Speex   '))), /neither Vorbis nor Opus/);
	assert.throws(() => detectSampleCodec(Uint8Array.from([1, 2, 3, 4])), /not Vorbis, Opus or FLAC/);
	assert.throws(() => detectSampleCodec(new Uint8Array(0)), /not Vorbis, Opus or FLAC/);
});

test('FLAC round-trips exactly: silence, a constant, a sine, noise, the extremes, odd lengths, many blocks', () => {
	const cases: [string, Int16Array][] = [
		['one frame', Int16Array.from([-5])],
		['silence', new Int16Array(5000)],
		['a constant', new Int16Array(9000).fill(-1234)],
		['a sine', sine(20000, 20000, 97)],
		['quiet noise', noise(10001, 40)],
		['loud noise', noise(8193, 32767)],
		['the extremes', Int16Array.from({ length: 4097 }, (_, index) => (index % 2 ? 32767 : -32768))],
		['a ramp', Int16Array.from({ length: 4096 }, (_, index) => index * 8 - 16000)],
	];
	for (const [name, frames] of cases) {
		const decoded = decodeFlac(encodeFlac(frames, 22050));
		assert.equal(decoded.rate, 22050, name);
		assert.deepEqual(decoded.frames, frames, name);
	}
});

test('FLAC of a tonal sample is smaller than the frames it holds', () => {
	const frames = sine(44100, 12000, 220);
	assert.ok(encodeFlac(frames, 44100).length < frames.byteLength / 2);
});

test('the FLAC decoder refuses damage and anything a SoundFont could not state', () => {
	const flac = encodeFlac(sine(5000, 1000, 50), 22050);
	assert.throws(() => decodeFlac(Uint8Array.from([1, 2, 3])), /not a FLAC stream/);
	assert.throws(() => decodeFlac(flac.subarray(0, flac.length - 40)), /ends in the middle|sync/);
	assert.throws(() => decodeFlac(encodeFlac(sine(100, 10, 10), 100)), /not a sample rate a SoundFont can state/);
	assert.throws(() => decodeFlac(flac, 1000), /longer than a SoundFont sample may be/);
	assert.throws(() => encodeFlac(new Int16Array(1), 0), /cannot state/);
	assert.throws(() => flacSampleEncoder(new Int16Array(4), 8000, 'opus'), /writes FLAC, not opus/);
	assert.throws(() => flacSampleDecoder(flac, 22050, 'vorbis'), /reads FLAC, not vorbis/);
	assert.throws(() => flacSampleDecoder(flac, 11025, 'flac'), /states 22050 Hz/);
});

test('our FLAC streams decode in ffmpeg, and ffmpeg-made FLAC (LPC subframes) decodes here', (t) => {
	if (ffmpegMissing) return t.skip('ffmpeg is not installed');
	const frames = sine(12000, 9000, 61);
	const ours = encodeFlac(frames, 22050);
	const decoded = spawnSync(
		'ffmpeg',
		['-v', 'error', '-f', 'flac', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', 'pipe:1'],
		{ input: ours, maxBuffer: 1 << 26 },
	);
	assert.equal(decoded.status, 0, String(decoded.stderr));
	const out = decoded.stdout;
	assert.deepEqual(new Int16Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length)), frames);

	const raw = Buffer.from(frames.buffer, frames.byteOffset, frames.byteLength);
	const theirs = spawnSync(
		'ffmpeg',
		['-v', 'error', '-f', 's16le', '-ar', '22050', '-ac', '1', '-i', 'pipe:0'].concat([
			'-c:a',
			'flac',
			'-compression_level',
			'8',
			'-f',
			'flac',
			'pipe:1',
		]),
		{ input: raw, maxBuffer: 1 << 26 },
	);
	assert.equal(theirs.status, 0, String(theirs.stderr));
	assert.deepEqual(decodeFlac(new Uint8Array(theirs.stdout)).frames, frames);
});

/** a one-preset SoundFont 2 built by decoding the SoundFont 3 fixture, so its frames are known */
async function plainFont(): Promise<ArrayBuffer> {
	return decodeSoundFont(buildSf3(0, 5, Buffer.from([3, 0])), fakeDecode);
}

const majorVersion = (font: ArrayBuffer): number => {
	const bytes = Buffer.from(font);
	return bytes.readUInt16LE(bytes.indexOf('ifil') + 8);
};

test('encodeSoundFont compresses a SoundFont 2 into a SoundFont 3 that decodes back to the same samples', async () => {
	const sf2 = await plainFont();
	const calls: { frames: number; rate: number; codec: string }[] = [];
	const sf3 = await encodeSoundFont(
		sf2,
		(frames, rate, codec) => {
			calls.push({ frames: frames.length, rate, codec });
			return encodeFlac(frames, rate);
		},
		'flac',
	);
	assert.deepEqual(calls, [{ frames: 100, rate: 8000, codec: 'flac' }]);
	assert.equal(majorVersion(sf3), 3, 'the INFO states the SoundFont 3 version');
	const back = await decodeSoundFont(sf3, flacSampleDecoder);
	const [before] = parseSoundFont(sf2).voices(0, 5, 69, 100);
	const [after] = parseSoundFont(back).voices(0, 5, 69, 100);
	assert.deepEqual(after.sample.data, before.sample.data);
	assert.equal(after.sample.loopStart, 10, 'loop points became relative and came back absolute');
	assert.equal(after.sample.loopEnd, 90);
	assert.equal(majorVersion(back), 2);
});

test('encodeSoundFont leaves a SoundFont 3 alone and refuses an encoder that returns nothing', async () => {
	const sf3 = buildSf3(0, 5, Buffer.from([1, 0]));
	const same = await encodeSoundFont(sf3, () => assert.fail('nothing to compress'), 'flac');
	assert.deepEqual(new Uint8Array(same), new Uint8Array(sf3));
	const sf2 = await plainFont();
	await assert.rejects(() => encodeSoundFont(sf2, () => new Uint8Array(0), 'opus'), /no bytes/);
});

test("decodeSoundFont hands the decoder each sample's detected codec and refuses one it cannot name", async () => {
	const seen: string[] = [];
	await decodeSoundFont(buildSf3(0, 5, Buffer.from([1, 0])), (bytes, _rate, codec) => {
		seen.push(codec);
		return fakeDecode(bytes);
	});
	assert.deepEqual(seen, ['flac']);
	const damaged = Buffer.from(buildSf3(0, 5, Buffer.from([1, 0])));
	damaged.write('xxxx', damaged.indexOf('fLaC'), 'latin1');
	await assert.rejects(() => decodeSoundFont(damaged, fakeDecode), /not Vorbis, Opus or FLAC/);
});

test('encodeSoundFont passes its options to the encoder with every sample', async () => {
	const seen: unknown[] = [];
	await encodeSoundFont(
		await plainFont(),
		(frames, rate, _codec, options) => {
			seen.push(options);
			return encodeFlac(frames, rate);
		},
		'opus',
		{ bitrate: 40 },
	);
	assert.deepEqual(seen, [{ bitrate: 40 }]);
});
