import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMidi } from '../src/audio/Midi.ts';
import { renderMidiToBuffer } from '../src/audio/MidiRender.ts';
import { collectSoundFontUsage, parseSoundFont, subsetSoundFont } from '../src/audio/SoundFont.ts';
import type { SoundFont, SoundFontVoice } from '../src/audio/SoundFont.ts';

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
// ------------------------------------------------------- collectSoundFontUsage

function buildMidiFile(ticksPerQuarter: number, trackBytes: readonly number[]): Uint8Array {
	const header = [...ascii('MThd'), 0, 0, 0, 6, 0, 0, 0, 1, (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff];
	const track = [...ascii('MTrk'), ...uint32(trackBytes.length), ...trackBytes];
	return new Uint8Array([...header, ...track]);
}

function uint32(value: number): number[] {
	return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function vlq(value: number): number[] {
	assert.ok(value < 128, 'test helper only encodes single-byte VLQs');
	return [value];
}

function noteOn(channel: number, note: number, velocity: number): number[] {
	return [0x90 | channel, note, velocity];
}

function noteOff(channel: number, note: number): number[] {
	return [0x80 | channel, note, 0];
}

function programChange(channel: number, program: number): number[] {
	return [0xc0 | channel, program];
}

function controlChange(channel: number, controller: number, value: number): number[] {
	return [0xb0 | channel, controller, value];
}

function endOfTrack(): number[] {
	return [0xff, 0x2f, 0x00];
}

test('collectSoundFontUsage lists every voiced program, drums as bank 128', () => {
	const first = buildMidiFile(96, [
		...vlq(0),
		...programChange(0, 5),
		...vlq(12),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(12),
		...noteOn(1, 62, 90), // default program 0
		...vlq(96),
		...noteOff(1, 62),
		...vlq(12),
		...noteOn(9, 36, 110), // drums
		...vlq(96),
		...noteOff(9, 36),
		...vlq(0),
		...endOfTrack(),
	]);
	const second = buildMidiFile(96, [
		...vlq(0),
		...controlChange(2, 0, 2), // bank select
		...vlq(12),
		...programChange(2, 3),
		...vlq(12),
		...noteOn(2, 67, 80),
		...vlq(96),
		...noteOff(2, 67),
		...vlq(0),
		...programChange(0, 5), // already seen in the first file
		...vlq(12),
		...noteOn(0, 65, 100),
		...vlq(96),
		...noteOff(0, 65),
		...vlq(0),
		...endOfTrack(),
	]);
	assert.deepEqual(collectSoundFontUsage([parseMidi(first), parseMidi(second)]), [
		{ bank: 0, program: 5 },
		{ bank: 0, program: 0 },
		{ bank: 128, program: 0 },
		{ bank: 2, program: 3 },
	]);
});

test('collectSoundFontUsage of no files is empty', () => {
	assert.deepEqual(collectSoundFontUsage([]), []);
});

// ------------------------------------------------------- subsetSoundFont

function genRange(oper: number, lo: number, hi: number): number[] {
	return [...u16le(oper), lo & 0xff, hi & 0xff];
}

function sineFrames(frames: number): number[] {
	const out: number[] = [];
	for (let i = 0; i < frames; i++) out.push(...i16le(Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 16000)));
	return out;
}

/**
 * Two presets sharing one instrument: "Keep" (bank 0, program 5) layers a global
 * attenuation zone over "Shared", whose low keys play a sine sample and whose high
 * keys point at a ROM sample that must vanish; "Drop" (bank 0, program 7) owns the
 * "Unused" instrument and a second sine sample, all of which must vanish too.
 */
function buildTwoPresetFont(): Uint8Array {
	const bag = (genIndex: number): number[] => [...u16le(genIndex), ...u16le(0)];
	const preset = (name: string, program: number, bank: number, bagIndex: number): number[] => [
		...str20(name),
		...u16le(program),
		...u16le(bank),
		...u16le(bagIndex),
		...u32le(0),
		...u32le(0),
		...u32le(0),
	];
	const sampleHeader = (
		name: string,
		start: number,
		end: number,
		rootKey: number,
		link: number,
		type: number,
	): number[] => [
		...str20(name),
		...u32le(start),
		...u32le(end),
		...u32le(start),
		...u32le(end),
		...u32le(8000),
		rootKey,
		0,
		...u16le(link),
		...u16le(type),
	];
	const chunks: [string, number[]][] = [
		['phdr', [...preset('Keep', 5, 0, 0), ...preset('Drop', 7, 0, 2), ...preset('EOS', 0, 0, 3)]],
		['pbag', [...bag(0), ...bag(1), ...bag(2), ...bag(3)]],
		['pgen', [...gen(48, 60), ...gen(41, 0), ...gen(41, 1)]],
		['inst', [...str20('Shared'), ...u16le(0), ...str20('Unused'), ...u16le(3), ...str20('EOS'), ...u16le(4)]],
		['ibag', [...bag(0), ...bag(1), ...bag(3), ...bag(5), ...bag(6)]],
		[
			'igen',
			[
				...gen(48, 100), // Shared global attenuation
				...genRange(43, 0, 60),
				...gen(53, 0), // low keys: the sine sample
				...genRange(43, 61, 127),
				...gen(53, 2), // high keys: a ROM sample, dropped by the subset
				...gen(53, 1), // Unused: the second sine sample
			],
		],
		[
			'shdr',
			[
				...sampleHeader('sine0', 0, 800, 69, 0, 1),
				...sampleHeader('sine1', 800, 1200, 60, 1, 1),
				...sampleHeader('rom', 0, 800, 60, 2, 0x8000),
			],
		],
	];
	const pdta = listChunk(
		'pdta',
		chunks.map(([id, payload]) => chunk(id, payload)),
	);
	const info = listChunk('INFO', [chunk('ifil', [1, 0, 0, 0])]);
	const sdta = listChunk('sdta', [chunk('smpl', [...sineFrames(800), ...sineFrames(400)])]);
	const body = [...ascii('sfbk'), ...info, ...sdta, ...pdta];
	return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]);
}

function voiceKey(voice: SoundFontVoice): unknown[] {
	let sum = 0;
	for (const frame of voice.sample.data) sum += frame;
	return [
		voice.rootKey,
		voice.cents,
		voice.loop,
		voice.gain,
		voice.pan,
		voice.attack,
		voice.hold,
		voice.decay,
		voice.sustain,
		voice.release,
		voice.sample.rate,
		voice.sample.loopStart,
		voice.sample.loopEnd,
		voice.sample.data.length,
		sum,
	];
}

/** every voice the kept program can sound, across keys and velocities */
function allVoices(font: SoundFont, bank: number, program: number): unknown[] {
	const out: unknown[] = [];
	for (let key = 0; key < 128; key++) {
		for (const velocity of [1, 64, 100, 127]) {
			for (const voice of font.voices(bank, program, key, velocity))
				out.push([key, velocity, ...voiceKey(voice)]);
		}
	}
	return out;
}

test('a subset keeps the used preset with identical voices and drops the rest', () => {
	const fullBytes = buildTwoPresetFont();
	const full = parseSoundFont(fullBytes);
	assert.equal(full.presetCount, 2);
	const subBytes = subsetSoundFont(fullBytes, [{ bank: 0, program: 5 }]);
	const sub = parseSoundFont(subBytes);
	assert.equal(sub.presetCount, 1);
	assert.equal(sub.hasPreset(0, 5), true);
	assert.equal(sub.hasPreset(0, 7), false);
	assert.ok(subBytes.byteLength < fullBytes.byteLength);
	assert.deepEqual(allVoices(sub, 0, 5), allVoices(full, 0, 5));
});

test('a subset carries the bank fallback the reader voices for a missing bank', () => {
	const fullBytes = buildTwoPresetFont();
	const full = parseSoundFont(fullBytes);
	const sub = parseSoundFont(subsetSoundFont(fullBytes, [{ bank: 3, program: 5 }]));
	assert.equal(sub.hasPreset(0, 5), true);
	assert.deepEqual(allVoices(sub, 3, 5), allVoices(full, 3, 5));
});

test('empty or unmatched usage writes a valid font with no presets', () => {
	const fullBytes = buildTwoPresetFont();
	for (const usage of [[], [{ bank: 0, program: 99 }]] as { bank: number; program: number }[][]) {
		const sub = parseSoundFont(subsetSoundFont(fullBytes, usage));
		assert.equal(sub.presetCount, 0);
		assert.equal(sub.hasPreset(0, 5), false);
		assert.deepEqual(sub.voices(0, 5, 60, 100), []);
	}
});

test('a subset of a subset voices the same notes', () => {
	const fullBytes = buildTwoPresetFont();
	const usage = [{ bank: 0, program: 5 }];
	const once = parseSoundFont(subsetSoundFont(fullBytes, usage));
	const twice = parseSoundFont(subsetSoundFont(subsetSoundFont(fullBytes, usage), usage));
	assert.deepEqual(allVoices(twice, 0, 5), allVoices(once, 0, 5));
});
