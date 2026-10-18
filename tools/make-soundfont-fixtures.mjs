#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertSoundFont } from './soundfonts.mjs';

/**
 * Writes the small SoundFont fixtures the tests commit: a few instruments cut out of a large
 * SoundFont 2 (`tests/soundfonts/FluidR3 GM.sf2`, kept out of the repository because of its size)
 * as one SoundFont 2 and the same font compressed three ways, a SoundFont 3 in Vorbis, in Opus and
 * in FLAC, so a test can read each kind without a download and without compressing anything.
 * Vorbis and Opus are encoded by `ffmpeg`, FLAC by the library.
 *
 * usage: node tools/make-soundfont-fixtures.mjs [source.sf2] [out folder]
 */

/** a synth bass, a square lead (both loop short), a woodblock and a reed organ (both loop long) */
export const FIXTURE_PROGRAMS = [
	{ bank: 0, program: 20 },
	{ bank: 0, program: 38 },
	{ bank: 0, program: 80 },
	{ bank: 0, program: 115 },
];

export const FIXTURE_NAME = 'fluidr3-mini';

/** the four fixture files as `{ file: bytes }` from the bytes of the large SoundFont 2 */
export async function makeFixtures(source) {
	const { subsetSoundFont } = await import('../src/audio/SoundFont.ts');
	const sf2 = new Uint8Array(subsetSoundFont(source, FIXTURE_PROGRAMS));
	const files = { [`${FIXTURE_NAME}.sf2`]: sf2 };
	for (const codec of ['vorbis', 'opus', 'flac']) {
		files[`${FIXTURE_NAME}.${codec}.sf3`] = await convertSoundFont(sf2, { to: 'sf3', codec });
	}
	return files;
}

const HERE = dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = join(HERE, '..');
	const source = resolve(process.argv[2] ?? join(root, 'tests', 'soundfonts', 'FluidR3 GM.sf2'));
	const out = resolve(process.argv[3] ?? join(root, 'tests', 'fixtures', 'soundfonts'));
	mkdirSync(out, { recursive: true });
	for (const [file, bytes] of Object.entries(await makeFixtures(readFileSync(source)))) {
		writeFileSync(join(out, file), bytes);
		console.log(`wrote ${join(out, file)} (${bytes.length} bytes)`);
	}
}
