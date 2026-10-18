import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { flacSampleDecoder, flacSampleEncoder } from '../src/audio/Flac.ts';
import { decodeSoundFont, encodeSoundFont, parseSoundFont, subsetSoundFont } from '../src/audio/SoundFont.ts';

/**
 * The SoundFont 2 files kept in tests/soundfonts (large, so they are not in the repository's
 * history: put them there to run this). A few real instruments are cut out of each, compressed
 * as FLAC and decoded again, which has to give back the very same frames and loops, then the
 * compressed font has to be smaller than the plain subset it came from.
 */

const DIR = join(import.meta.dirname, 'soundfonts');
const fonts = existsSync(DIR) ? readdirSync(DIR).filter((name) => name.toLowerCase().endsWith('.sf2')) : [];

//a piano, a nylon guitar, a string ensemble, a synth lead and the standard drum kit
const USED = [
	{ bank: 0, program: 0 },
	{ bank: 0, program: 24 },
	{ bank: 0, program: 48 },
	{ bank: 0, program: 80 },
	{ bank: 128, program: 0 },
];

if (fonts.length === 0) {
	test('real SoundFont files', { skip: 'put .sf2 files in tests/soundfonts to run this' }, () => {});
}

for (const name of fonts) {
	test(`${name}: a subset compressed as FLAC decodes to the same samples and loops`, async () => {
		const subset = subsetSoundFont(readFileSync(join(DIR, name)), USED);
		const sf3 = await encodeSoundFont(subset, flacSampleEncoder, 'flac');
		assert.ok(sf3.byteLength < subset.byteLength, 'FLAC is smaller than the plain frames');

		const back = await decodeSoundFont(sf3, flacSampleDecoder);
		const before = parseSoundFont(subset);
		const after = parseSoundFont(back);
		assert.equal(after.presetCount, before.presetCount);
		let compared = 0;
		for (const { bank, program } of USED) {
			if (!before.hasPreset(bank, program)) continue;
			for (const key of [36, 60, 84]) {
				const expected = before.voices(bank, program, key, 100);
				const actual = after.voices(bank, program, key, 100);
				assert.equal(actual.length, expected.length, `${bank}:${program} key ${key}`);
				for (let index = 0; index < expected.length; index++) {
					assert.deepEqual(actual[index].sample.data, expected[index].sample.data);
					assert.equal(actual[index].sample.loopStart, expected[index].sample.loopStart);
					assert.equal(actual[index].sample.loopEnd, expected[index].sample.loopEnd);
					compared++;
				}
			}
		}
		assert.ok(compared > 0, 'some of the chosen instruments were in the font');
	});
}
