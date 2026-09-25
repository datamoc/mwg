import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMidi } from '../src/audio/Midi.ts';
import { renderMidiToBuffer } from '../src/audio/MidiRender.ts';
import { parseSoundFont } from '../src/audio/SoundFont.ts';

function ascii(text: string): number[] {
	return [...text].map((c) => c.charCodeAt(0));
}

function str20(name: string): number[] {
	const codes = [...name].map((c) => c.charCodeAt(0));
	assert.ok(codes.length <= 20, 'test sample names fit in 20 bytes');
	return [...codes, ...new Array(20 - codes.length).fill(0)];
}

function u16le(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff];
}

function u32le(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function i16le(value: number): number[] {
	const unsigned = value < 0 ? 65536 + value : value;
	return [unsigned & 0xff, (unsigned >> 8) & 0xff];
}

function chunk(id: string, payload: number[]): number[] {
	const out = [...ascii(id), ...u32le(payload.length), ...payload];
	if (payload.length & 1) out.push(0);
	return out;
}

function listChunk(type: string, subs: number[][]): number[] {
	const body = [...ascii(type), ...subs.flat()];
	return [...ascii('LIST'), ...u32le(body.length), ...body];
}

function gen(oper: number, amount: number): number[] {
	return [...u16le(oper), ...i16le(amount)];
}

/** one 800-frame sine sample at 8000 Hz, root key 69 */
function sampleData(): number[] {
	const out: number[] = [];
	for (let i = 0; i < 800; i++) out.push(...i16le(Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 16000)));
	return out;
}

/**
 * A minimal valid SoundFont 2 file: one preset (bank 0, program 5) with a global
 * 60-centibel attenuation zone, one instrument, one sample. Every chunk the reader
 * requires is present; modulators are omitted, like the reader omits them.
 */
function buildFont(omit: string | null = null): Uint8Array {
	const preset = (name: string, program: number, bank: number, bag: number): number[] => [
		...str20(name),
		...u16le(program),
		...u16le(bank),
		...u16le(bag),
		...u32le(0),
		...u32le(0),
		...u32le(0),
	];
	const instrument = (name: string, bag: number): number[] => [...str20(name), ...u16le(bag)];
	const sampleHeader = (): number[] => [
		...str20('sine'),
		...u32le(0), //start
		...u32le(800), //end
		...u32le(0), //loopStart
		...u32le(800), //loopEnd
		...u32le(8000), //rate
		69, //rootKey
		0, //correction
		...u16le(0), //link
		...u16le(1), //mono
	];
	const chunks: [string, number[]][] = [
		['phdr', [...preset('Test', 5, 0, 0), ...preset('EOS', 0, 0, 2)]],
		['pbag', [...u16le(0), ...u16le(0), ...u16le(1), ...u16le(0), ...u16le(2), ...u16le(0)]],
		['pgen', [...gen(48, 60), ...gen(41, 0)]],
		['inst', [...instrument('TestInst', 0), ...instrument('EOS', 1)]],
		['ibag', [...u16le(0), ...u16le(0), ...u16le(1), ...u16le(0)]],
		['igen', gen(53, 0)],
		['shdr', sampleHeader()],
	];
	const pdta = listChunk(
		'pdta',
		chunks.filter(([id]) => id !== omit).map(([id, payload]) => chunk(id, payload)),
	);
	const info = listChunk('INFO', [chunk('ifil', [1, 0, 0, 0])]);
	const sdta = listChunk('sdta', [chunk('smpl', sampleData())]);
	const body = [...ascii('sfbk'), ...info, ...sdta, ...pdta];
	return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]);
}

// ------------------------------------------------------------------- parseSoundFont

test('reads one preset: layers the global attenuation over the sample', () => {
	const font = parseSoundFont(buildFont());
	assert.equal(font.presetCount, 1);
	assert.equal(font.hasPreset(0, 5), true);
	assert.equal(font.hasPreset(3, 5), true); // bank falls back to 0 for the same program
	assert.equal(font.hasPreset(0, 6), false);

	const [voice] = font.voices(0, 5, 69, 100);
	assert.equal(voice.rootKey, 69);
	assert.equal(voice.cents, 0);
	assert.equal(voice.loop, false);
	assert.ok(Math.abs(voice.gain - 10 ** -0.3) < 1e-9); // 60 centibels of attenuation
	assert.equal(voice.pan, 0);
	assert.equal(voice.sample.data.length, 800);
	assert.equal(voice.sample.rate, 8000);
});

test('an unknown program voices nothing, so the synth fallback plays instead', () => {
	const font = parseSoundFont(buildFont());
	assert.deepEqual(font.voices(0, 6, 60, 100), []);
});

test('rejects bytes that are not a SoundFont 2 file', () => {
	assert.throws(() => parseSoundFont(new Uint8Array([1, 2, 3, 4]).buffer), /not a SoundFont 2 file/);
});

test('names the required chunk a truncated file is missing', () => {
	assert.throws(() => parseSoundFont(buildFont('shdr')), /missing "shdr"/);
});

test('a parsed font voices a rendered note with its own samples', () => {
	const font = parseSoundFont(buildFont());
	const track = [0x00, 0xc0, 0x05, 0x00, 0x90, 0x3c, 0x64, 0x60, 0x80, 0x3c, 0x00, 0x00, 0xff, 0x2f, 0x00];
	const header = [...ascii('MThd'), 0, 0, 0, 6, 0, 0, 0, 1, 0, 96];
	const bytes = new Uint8Array([
		...header,
		...ascii('MTrk'),
		(track.length >> 24) & 0xff,
		(track.length >> 16) & 0xff,
		(track.length >> 8) & 0xff,
		track.length & 0xff,
		...track,
	]);
	const rendered = renderMidiToBuffer(parseMidi(bytes), { soundfont: font });
	let peak = 0;
	for (const value of rendered.left) peak = Math.max(peak, Math.abs(value));
	assert.ok(peak > 0.02);
});
