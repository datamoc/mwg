import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SAMPLE_FRAMES, webAudioSampleDecoder } from '../src/audio/SampleDecoder.ts';
import {
	decodeSoundFont,
	loadSoundFont,
	mergeSoundFonts,
	parseSoundFont,
	subsetSoundFont,
} from '../src/audio/SoundFont.ts';
import { buildSf3, fakeDecode, FRAMES } from './helpers/soundfont3.ts';

/**
 * SoundFont 3 at runtime: the Ogg bytes survive merge and subset untouched, and decoding happens
 * once, late, through whatever decoder the platform has. Every test here stands a fake in for
 * the decoder, so none needs a browser or ffmpeg.
 */

/** a decoder that records what it was asked to decode */
function recordingDecoder() {
	const calls: { first: number; length: number; rate: number }[] = [];
	return {
		calls,
		decode: (ogg: Uint8Array, rate: number): Int16Array => {
			calls.push({ first: ogg[0], length: ogg.length, rate });
			return fakeDecode(ogg);
		},
	};
}

test('decodeSoundFont turns a SoundFont 3 into a SoundFont 2 the reader plays, loops placed', async () => {
	const { calls, decode } = recordingDecoder();
	const sf2 = await decodeSoundFont(buildSf3(0, 5, Buffer.from([3, 9, 9, 9, 9])), decode);
	assert.deepEqual(calls, [{ first: 3, length: 5, rate: 8000 }]);
	const [voice] = parseSoundFont(sf2).voices(0, 5, 69, 100);
	assert.equal(voice.sample.data.length, FRAMES);
	assert.ok(Math.abs(voice.sample.data[10] - (10 * 3) / 32768) < 1e-9);
	assert.equal(voice.sample.loopStart, 10, 'loop points were relative to the compressed sample');
	assert.equal(voice.sample.loopEnd, 90);
});

test('a SoundFont 2 comes back from decodeSoundFont unchanged, and the decoder is never called', async () => {
	const sf2 = await decodeSoundFont(buildSf3(0, 5, Buffer.from([1, 0])), fakeDecode);
	const again = await decodeSoundFont(sf2, () => assert.fail('nothing is compressed any more'));
	assert.deepEqual(new Uint8Array(again), new Uint8Array(sf2));
});

test('loadSoundFont reads either kind: a SoundFont 3 through the decoder, a SoundFont 2 without one', async () => {
	const { calls, decode } = recordingDecoder();
	const font = await loadSoundFont(buildSf3(0, 5, Buffer.from([2, 0])), { decode });
	assert.equal(font.hasPreset(0, 5), true);
	assert.equal(calls.length, 1);
	const plain = await decodeSoundFont(buildSf3(0, 5, Buffer.from([2, 0])), fakeDecode);
	const same = await loadSoundFont(plain, { decode: () => assert.fail('a SoundFont 2 needs no decoder') });
	assert.equal(same.presetCount, 1);
});

test('merging SoundFont 3 files keeps every Ogg range as it was and decodes each at its own offset', async () => {
	const merged = mergeSoundFonts([
		buildSf3(0, 5, Buffer.from([1, 1, 1])),
		buildSf3(128, 0, Buffer.from([2, 2, 2, 2, 2])),
	]);
	assert.throws(() => parseSoundFont(merged), /needs decoding first/);
	const { calls, decode } = recordingDecoder();
	const font = parseSoundFont(await decodeSoundFont(merged, decode));
	assert.deepEqual(calls, [
		{ first: 1, length: 3, rate: 8000 },
		{ first: 2, length: 5, rate: 8000 },
	]);
	assert.equal(font.presetCount, 2);
	//the loop of the second sample is still relative to it, whatever its offset in the merged chunk
	const [drum] = font.voices(128, 0, 69, 100);
	assert.equal(drum.sample.loopStart, 10);
	assert.equal(drum.sample.data[10], (10 * 2) / 32768);
});

test('a shared program keeps the first font and the losing sample is never decoded', async () => {
	const merged = mergeSoundFonts([buildSf3(0, 5, Buffer.from([1, 0])), buildSf3(0, 5, Buffer.from([9, 9, 9]))]);
	const { calls, decode } = recordingDecoder();
	await decodeSoundFont(merged, decode);
	assert.deepEqual(calls, [{ first: 1, length: 2, rate: 8000 }]);
});

test('a subset of a SoundFont 3 keeps only the used presets, still compressed', async () => {
	const merged = mergeSoundFonts([
		buildSf3(0, 5, Buffer.from([1, 1, 1])),
		buildSf3(0, 7, Buffer.from([2, 2, 2, 2, 2])),
	]);
	const subset = subsetSoundFont(merged, [{ bank: 0, program: 7 }]);
	assert.ok(subset.byteLength < merged.byteLength);
	const { calls, decode } = recordingDecoder();
	const font = parseSoundFont(await decodeSoundFont(subset, decode));
	assert.deepEqual(calls, [{ first: 2, length: 5, rate: 8000 }]);
	assert.equal(font.hasPreset(0, 7), true);
	assert.equal(font.presetCount, 1);
});

test('a SoundFont 3 and a SoundFont 2 cannot be merged until the first is decoded', async () => {
	const sf3 = buildSf3(0, 5, Buffer.from([1, 0]));
	const sf2 = await decodeSoundFont(sf3, fakeDecode);
	assert.throws(() => mergeSoundFonts([sf3, sf2]), /decode it first/);
});

test('a decoded loop that ends past the decoded frames is cut to them', async () => {
	const font = parseSoundFont(await decodeSoundFont(buildSf3(0, 5, Buffer.from([1, 0])), () => new Int16Array(50)));
	const [voice] = font.voices(0, 5, 69, 100);
	assert.equal(voice.sample.data.length, 50);
	assert.equal(voice.sample.loopEnd, 50);
});

// -------------------------------------------------------------- webAudioSampleDecoder

/** a stand-in OfflineAudioContext decoding to `frames` at `sampleRate` */
function fakeContext(frames: number[], sampleRate: number | null, seen: { rate?: number; bytes?: number } = {}) {
	return (rate: number) => {
		seen.rate = rate;
		return {
			decodeAudioData: async (data: ArrayBuffer) => {
				seen.bytes = data.byteLength;
				return {
					sampleRate: sampleRate ?? rate,
					length: frames.length,
					getChannelData: () => Float32Array.from(frames),
				};
			},
		};
	};
}

test('the WebAudio decoder decodes at the sample rate and converts to 16-bit, clamping', async () => {
	const seen: { rate?: number; bytes?: number } = {};
	const decode = webAudioSampleDecoder(fakeContext([-1, 0, 0.5, 2], null, seen));
	const frames = await decode(new Uint8Array([1, 2, 3]), 22050);
	assert.deepEqual([...frames], [-32767, 0, 16384, 32767]);
	assert.equal(seen.rate, 22050, 'a context at the sample rate means the browser does not resample');
});

test('the WebAudio decoder is handed a copy of just the sample, not the font it lives in', async () => {
	const seen: { rate?: number; bytes?: number } = {};
	const font = new Uint8Array([9, 9, 1, 2, 3, 9, 9]);
	await webAudioSampleDecoder(fakeContext([0], null, seen))(font.subarray(2, 5), 22050);
	assert.equal(seen.bytes, 3);
	assert.deepEqual([...font], [9, 9, 1, 2, 3, 9, 9], 'the font still has its bytes: nothing was detached');
});

test('a rate no context accepts decodes at the nearest accepted rate and is resampled back', async () => {
	const seen: { rate?: number; bytes?: number } = {};
	//8000 frames at the clamped 8000 Hz stand for 5512 Hz material, so 5512 frames come back
	const ramp = Array.from({ length: 8000 }, (_, index) => index / 8000);
	const frames = await webAudioSampleDecoder(fakeContext(ramp, 8000, seen))(new Uint8Array([1]), 5512);
	assert.equal(seen.rate, 8000);
	assert.equal(frames.length, 5512);
	assert.ok(frames[frames.length - 1] > frames[0], 'the ramp survives the resample');
});

test('without WebAudio the default decoder says so instead of failing on a missing global', async () => {
	await assert.rejects(
		async () => webAudioSampleDecoder()(new Uint8Array([1]), 22050),
		/no OfflineAudioContext here/,
	);
});

test('a sample header cannot make the decoder allocate without bound', async () => {
	const font = buildSf3(0, 5, Buffer.from([1, 0]));
	const header = font.indexOf('shdr') + 8;
	const withRate = (rate: number): Buffer => {
		const copy = Buffer.from(font);
		copy.writeUInt32LE(rate, header + 36);
		return copy;
	};
	for (const rate of [0, 100, 4_000_000_000]) {
		await assert.rejects(() => decodeSoundFont(withRate(rate), () => assert.fail('never reached')), /Hz/);
	}
	//a few Ogg bytes that decode to a very long sound
	await assert.rejects(
		() => decodeSoundFont(font, () => new Int16Array(MAX_SAMPLE_FRAMES + 1)),
		/larger than the limits allow/,
	);
	assert.equal((await decodeSoundFont(font, () => new Int16Array(MAX_SAMPLE_FRAMES))).byteLength > 0, true);
});

test('limits raise or lower what a font may decode to', async () => {
	const font = buildSf3(0, 5, Buffer.from([1, 0]));
	const pcm = () => new Int16Array(MAX_SAMPLE_FRAMES + 1);
	const decoded = await decodeSoundFont(font, pcm, { sampleFrames: MAX_SAMPLE_FRAMES + 1 });
	assert.ok(decoded.byteLength > MAX_SAMPLE_FRAMES * 2, 'a sample over the default now decodes');
	await assert.rejects(() => decodeSoundFont(font, () => new Int16Array(100), { sampleFrames: 10 }), /limits/);
	await assert.rejects(() => decodeSoundFont(font, () => new Int16Array(100), { totalFrames: 50 }), /limits/);
});

test('the WebAudio decoder refuses a rate no SoundFont states and a decoded sound with no bound', async () => {
	const seen: { rate?: number; bytes?: number } = {};
	const decode = webAudioSampleDecoder(fakeContext([0], null, seen));
	await assert.rejects(
		() => Promise.resolve(decode(new Uint8Array([1]), 4_000_000_000)),
		/not one a SoundFont can state/,
	);
	assert.equal(seen.rate, undefined, 'no context was even created for it');
	const huge = (rate: number) => ({
		decodeAudioData: async () => ({
			sampleRate: rate,
			length: MAX_SAMPLE_FRAMES + 1,
			getChannelData: () => assert.fail('never read'),
		}),
	});
	await assert.rejects(
		() => Promise.resolve(webAudioSampleDecoder(huge)(new Uint8Array([1]), 22050)),
		/longer than a SoundFont sample may be/,
	);
});
