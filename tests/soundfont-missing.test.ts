import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMidi } from '../src/audio/Midi.ts';
import { renderMidiToBuffer, renderMidiToBufferAsync } from '../src/audio/MidiRender.ts';
import {
	decodeSoundFont,
	loadSoundFont,
	mergeSoundFonts,
	missingSoundFontPrograms,
	parseSoundFont,
} from '../src/audio/SoundFont.ts';
import { buildSf3, fakeDecode } from './helpers/soundfont3.ts';

/**
 * What plays for a program the font lacks. A trimmed bank carries a piano (preset 0:0) and a few
 * instruments; the default is the font's own piano for the rest, and `missingProgram: 'synth'`
 * hands those instruments to the built-in synthesizer instead.
 */

/** a SoundFont 3 with piano (0:0) and program 5, and the same decoded to the SoundFont 2 the reader plays */
const sf3 = mergeSoundFonts([buildSf3(0, 0, Buffer.from([1, 0])), buildSf3(0, 5, Buffer.from([2, 0]))]);

test('a program the font lacks plays its piano by default, and nothing (the synthesizer) when asked', async () => {
	const sf2 = await decodeSoundFont(sf3, fakeDecode);
	const piano = parseSoundFont(sf2);
	const synth = parseSoundFont(sf2, { missingProgram: 'synth' });

	const pianoVoices = piano.voices(0, 0, 60, 100);
	assert.ok(pianoVoices.length > 0);
	assert.deepEqual(piano.voices(0, 40, 60, 100), pianoVoices, 'program 40 is not carried: the piano plays');
	assert.deepEqual(
		synth.voices(0, 40, 60, 100),
		[],
		'with the synth policy nothing is voiced, so the synthesizer plays',
	);

	//what the font does carry is untouched by the policy
	assert.deepEqual(synth.voices(0, 5, 60, 100), piano.voices(0, 5, 60, 100));
	assert.deepEqual(synth.voices(0, 0, 60, 100), pianoVoices);
	//a bank missing the program still falls back to bank 0 whatever the policy, and so does a missing drum kit to the standard kit
	assert.deepEqual(synth.voices(3, 5, 60, 100), piano.voices(0, 5, 60, 100));
});

test('with no drum kit in the font the piano plays the drums by default, and the synthesizer plays them when asked', async () => {
	const sf2 = await decodeSoundFont(sf3, fakeDecode);
	assert.ok(
		parseSoundFont(sf2).voices(128, 0, 36, 100).length > 0,
		'the default: a piano line where the kick should be',
	);
	assert.deepEqual(parseSoundFont(sf2, { missingProgram: 'synth' }).voices(128, 0, 36, 100), []);
});

test('loadSoundFont takes the policy along with the decoder', async () => {
	const font = await loadSoundFont(sf3, { decode: fakeDecode, missingProgram: 'synth' });
	assert.deepEqual(font.voices(0, 40, 60, 100), []);
	assert.ok(font.voices(0, 5, 60, 100).length > 0);
});

/** a one-note format 0 MIDI file on program `program` */
function midiOn(program: number): Uint8Array {
	const track = [0x00, 0xc0, program, 0x00, 0x90, 0x3c, 0x64, 0x60, 0x80, 0x3c, 0x00, 0x00, 0xff, 0x2f, 0x00];
	return new Uint8Array([
		...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
		...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
		...track,
	]);
}

test('the render hears the difference: the synthesizer where the piano would have played', async () => {
	const sf2 = await decodeSoundFont(sf3, fakeDecode);
	const file = parseMidi(midiOn(40));
	const withPiano = renderMidiToBuffer(file, { soundfont: parseSoundFont(sf2) });
	const withSynth = renderMidiToBuffer(file, { soundfont: parseSoundFont(sf2, { missingProgram: 'synth' }) });
	const peak = (rendered: { left: Float32Array }): number =>
		rendered.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
	assert.ok(peak(withPiano) > 0 && peak(withSynth) > 0, 'neither is silent');
	assert.notDeepEqual(withPiano.left, withSynth.left, 'they are different timbres');
});

test('the async render takes the policy and matches the synchronous render', async () => {
	const sf2 = new Uint8Array(await decodeSoundFont(sf3, fakeDecode));
	const bytes = midiOn(40);
	const synchronous = renderMidiToBuffer(parseMidi(bytes), {
		soundfont: parseSoundFont(sf2, { missingProgram: 'synth' }),
	});
	const asynchronous = await renderMidiToBufferAsync(bytes, { soundFontBytes: sf2, missingProgram: 'synth' });
	assert.deepEqual(asynchronous, synchronous);
});

test('missingSoundFontPrograms lists what the font does not carry, counting the bank 0 fallback, on either kind', async () => {
	const usage = [
		{ bank: 0, program: 5 },
		{ bank: 0, program: 40 },
		{ bank: 3, program: 5 }, //carried through bank 0, the fallback every player makes
		{ bank: 128, program: 0 }, //no drum kit in the font
		{ bank: 0, program: 40 }, //asked twice, listed once
		{ bank: 0, program: 0 },
	];
	const expected = [
		{ bank: 0, program: 40 },
		{ bank: 128, program: 0 },
	];
	assert.deepEqual(missingSoundFontPrograms(sf3, usage), expected, 'a SoundFont 3 needs no decoding for this');
	assert.deepEqual(missingSoundFontPrograms(await decodeSoundFont(sf3, fakeDecode), usage), expected);
	assert.deepEqual(missingSoundFontPrograms(sf3, []), []);
});
