import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subsetSoundFont } from '../src/audio/SoundFont.ts';

test('the optional essentials bank is under 500 KB and exactly reproducible from the supplied GM bank', () => {
	const programs = [0, 24, 40, 56, 73].map((program) => ({ bank: 0, program }));
	programs.push({ bank: 128, program: 0 });
	const full = readFileSync(new URL('../data/microgm-opt.sf2', import.meta.url));
	const essential = readFileSync(new URL('../data/microgm-essential.sf2', import.meta.url));
	assert.ok(essential.byteLength < 500_000);
	assert.deepEqual(essential, Buffer.from(subsetSoundFont(full, programs)));
});
