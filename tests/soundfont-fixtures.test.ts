import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { flacSampleDecoder } from '../src/audio/Flac.ts';
import type { SampleCodec } from '../src/audio/SampleCodec.ts';
import { decodeSoundFont, loadSoundFont, parseSoundFont } from '../src/audio/SoundFont.ts';
import { ffmpegDecode } from '../tools/soundfonts.mjs';

/**
 * The committed SoundFont fixtures (tests/fixtures/soundfonts, written by `npm run soundfonts:fixtures`):
 * one SoundFont 2 and the same font as a SoundFont 3 in Vorbis, Opus and FLAC. Each reads back to the
 * instruments of the SoundFont 2 with the same loops, FLAC to the very same frames.
 */

const DIR = join(import.meta.dirname, 'fixtures', 'soundfonts');
const read = (name: string): Uint8Array => new Uint8Array(readFileSync(join(DIR, name)));
const PROGRAMS = [20, 38, 80, 115];
const ffmpegMissing = spawnSync('ffmpeg', ['-version']).error !== undefined;

const sf2 = read('fluidr3-mini.sf2');

test('the SoundFont 2 fixture holds its four instruments, looped, and is small enough to commit', () => {
	const font = parseSoundFont(sf2);
	assert.equal(font.presetCount, PROGRAMS.length);
	for (const program of PROGRAMS) {
		const [voice] = font.voices(0, program, 60, 100);
		assert.ok(voice.sample.data.length > 0, `program ${program}`);
		assert.ok(voice.sample.loopEnd > voice.sample.loopStart, `program ${program} loops`);
	}
	for (const name of ['sf2', 'vorbis.sf3', 'opus.sf3', 'flac.sf3']) {
		assert.ok(read(`fluidr3-mini.${name}`).length < 300_000, name);
	}
});

for (const codec of ['vorbis', 'opus', 'flac'] as const satisfies readonly SampleCodec[]) {
	test(`the ${codec} SoundFont 3 fixture names its codec and decodes to the SoundFont 2's instruments and loops`, async (t) => {
		if (codec !== 'flac' && ffmpegMissing) return t.skip('ffmpeg is not installed');
		const bytes = read(`fluidr3-mini.${codec}.sf3`);
		assert.throws(() => parseSoundFont(bytes), /needs decoding/);
		const seen = new Set<string>();
		const decode = async (sample: Uint8Array, rate: number, found: SampleCodec): Promise<Int16Array> => {
			seen.add(found);
			return codec === 'flac' ? flacSampleDecoder(sample, rate, found) : ffmpegDecode(sample, rate, found);
		};
		const plain = await decodeSoundFont(bytes, decode);
		assert.deepEqual([...seen], [codec], 'every sample uses the one codec');

		const original = parseSoundFont(sf2);
		const decoded = parseSoundFont(plain);
		assert.equal(decoded.presetCount, original.presetCount);
		for (const program of PROGRAMS) {
			const [before] = original.voices(0, program, 60, 100);
			const [after] = decoded.voices(0, program, 60, 100);
			assert.equal(after.sample.loopStart, before.sample.loopStart, `${codec} ${program} loop start`);
			assert.equal(after.sample.rate, before.sample.rate);
			if (codec === 'flac') {
				assert.deepEqual(after.sample.data, before.sample.data, `${program} is lossless`);
			} else {
				//a lossy codec may add or drop a handful of frames at the ends
				assert.ok(
					Math.abs(after.sample.data.length - before.sample.data.length) < 1200,
					`${codec} ${program} length`,
				);
			}
		}
	});
}

test('loadSoundFont reads the FLAC fixture with the in-process decoder and plays its instruments', async () => {
	const font = await loadSoundFont(read('fluidr3-mini.flac.sf3'), { decode: flacSampleDecoder });
	assert.equal(font.presetCount, PROGRAMS.length);
	assert.ok(font.voices(0, 80, 60, 100).length > 0);
});
