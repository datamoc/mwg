import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMidi } from '../src/audio/Midi.ts';
import { renderMidiToBuffer } from '../src/audio/MidiRender.ts';
import type { SoundFont } from '../src/audio/SoundFont.ts';

/** builds a minimal, valid Standard MIDI File (format 0, one track) from a list of track bytes */
function buildMidi(ticksPerQuarter: number, trackBytes: readonly number[]): Uint8Array {
	const header = [
		...ascii('MThd'),
		0,
		0,
		0,
		6, //length
		0,
		0, //format 0
		0,
		1, //one track
		(ticksPerQuarter >> 8) & 0xff,
		ticksPerQuarter & 0xff,
	];
	const track = [...ascii('MTrk'), ...uint32(trackBytes.length), ...trackBytes];
	return new Uint8Array([...header, ...track]);
}

function ascii(text: string): number[] {
	return [...text].map((c) => c.charCodeAt(0));
}

function uint32(value: number): number[] {
	return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** variable-length quantity encoding, values < 128 only (enough for these tests) */
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

function controlChange(channel: number, controller: number, value: number): number[] {
	return [0xb0 | channel, controller, value];
}

function programChange(channel: number, program: number): number[] {
	return [0xc0 | channel, program];
}

function tempoMeta(microsecondsPerQuarter: number): number[] {
	return [
		0xff,
		0x51,
		0x03,
		(microsecondsPerQuarter >> 16) & 0xff,
		(microsecondsPerQuarter >> 8) & 0xff,
		microsecondsPerQuarter & 0xff,
	];
}

function endOfTrack(): number[] {
	return [0xff, 0x2f, 0x00];
}

/** a one-note file on channel 0, 96 ticks per quarter, 0.5 s long at 120 BPM */
function oneNote(
	channel = 0,
	note = 60,
	velocity = 100,
	prefix: readonly number[] = [],
	ticksPerQuarter = 96,
): Uint8Array {
	return buildMidi(ticksPerQuarter, [
		...prefix,
		...vlq(0),
		...noteOn(channel, note, velocity),
		...vlq(96),
		...noteOff(channel, note),
		...vlq(0),
		...endOfTrack(),
	]);
}

/** peak absolute level of a channel */
function peak(frames: Float32Array): number {
	let max = 0;
	for (const value of frames) max = Math.max(max, Math.abs(value));
	return max;
}

/** summed absolute energy over a frame range */
function energy(frames: Float32Array, from: number, to: number): number {
	let sum = 0;
	for (let i = Math.max(0, from); i < Math.min(frames.length, to); i++) sum += Math.abs(frames[i]);
	return sum;
}

// ------------------------------------------------------------------- renderMidiToBuffer

test('a file with no notes is refused instead of rendering silence', () => {
	const bytes = buildMidi(96, [...vlq(0), ...endOfTrack()]);
	assert.throws(() => renderMidiToBuffer(parseMidi(bytes)), /no notes/);
});

test('a note renders non-silent stereo, centered when no pan is set', () => {
	const rendered = renderMidiToBuffer(parseMidi(oneNote()));
	assert.equal(rendered.sampleRate, 22050);
	assert.equal(rendered.left.length, rendered.right.length);
	assert.ok(peak(rendered.left) > 0.01);
	assert.ok(peak(rendered.right) > 0.01);
	assert.ok(Math.abs(peak(rendered.left) - peak(rendered.right)) < 1e-6);
});

test('channel pan steers energy: full right is louder on the right', () => {
	const bytes = oneNote(0, 60, 100, [...vlq(0), ...controlChange(0, 10, 127)]);
	const rendered = renderMidiToBuffer(parseMidi(bytes));
	assert.ok(energy(rendered.right, 0, rendered.right.length) > energy(rendered.left, 0, rendered.left.length) * 4);
});

test('channel volume scales the peak down, not up', () => {
	const loud = renderMidiToBuffer(parseMidi(oneNote()));
	const quiet = renderMidiToBuffer(parseMidi(oneNote(0, 60, 100, [...vlq(0), ...controlChange(0, 7, 32)])));
	assert.ok(peak(quiet.left) < peak(loud.left) * 0.5);
});

test('velocity scales the peak down, not up', () => {
	const loud = renderMidiToBuffer(parseMidi(oneNote(0, 60, 127)));
	const soft = renderMidiToBuffer(parseMidi(oneNote(0, 60, 32)));
	assert.ok(peak(soft.left) < peak(loud.left) * 0.5);
});

test('the program selects the timbre: two programs render audibly different frames', () => {
	const piano = renderMidiToBuffer(parseMidi(oneNote(0, 60, 100, [...vlq(0), ...programChange(0, 0)])));
	const strings = renderMidiToBuffer(parseMidi(oneNote(0, 60, 100, [...vlq(0), ...programChange(0, 48)])));
	assert.ok(peak(piano.left) > 0.01);
	assert.ok(peak(strings.left) > 0.01);
	const different = piano.left.some((value, i) => Math.abs(value - strings.left[i]) > 1e-6);
	assert.ok(different);
});

test('channel 10 plays drums: a kick renders without any melodic program', () => {
	const rendered = renderMidiToBuffer(parseMidi(oneNote(9, 36, 100)));
	assert.ok(peak(rendered.left) > 0.01);
});

test('the same file and options always render the same frames', () => {
	const file = parseMidi(oneNote(0, 64, 100, [...vlq(0), ...programChange(0, 56)]));
	const first = renderMidiToBuffer(file);
	const second = renderMidiToBuffer(file);
	assert.deepEqual(first.left, second.left);
	assert.deepEqual(first.right, second.right);
});

test('the loop region runs from the CC111 marker to the end of the render', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(48),
		...controlChange(0, 111, 0), // tick 48: 0.25 s at 120 BPM
		...vlq(48),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);
	const rendered = renderMidiToBuffer(parseMidi(bytes));
	assert.ok(Math.abs(rendered.loopStart - 0.25) < 1e-9);
	assert.equal(rendered.loopEnd, rendered.duration);
});

test('without a loop marker the loop starts at 0', () => {
	const rendered = renderMidiToBuffer(parseMidi(oneNote()));
	assert.equal(rendered.loopStart, 0);
	assert.equal(rendered.loopEnd, rendered.duration);
});

test('maxDuration caps the render instead of allocating the whole tail', () => {
	const rendered = renderMidiToBuffer(parseMidi(oneNote()), { maxDuration: 0.2, sampleRate: 8000 });
	assert.equal(rendered.duration, 0.2);
	assert.equal(rendered.left.length, Math.ceil(0.2 * 8000));
});

// ------------------------------------------------------------------- soundfont voicing

/** a stub font recording its calls, voicing a short decaying blip per voice */
function stubFont(calls: { bank: number; program: number; key: number; velocity: number }[]): SoundFont {
	return {
		voices: (bank, program, key, velocity) => {
			calls.push({ bank, program, key, velocity });
			return [
				{
					sample: { data: new Float32Array(2205).fill(0.5), rate: 22050, loopStart: 0, loopEnd: 2205 },
					rootKey: key,
					cents: 0,
					loop: false,
					gain: 1,
					pan: 0,
					attack: 0.001,
					hold: 0,
					decay: 0.001,
					sustain: 1,
					release: 0.001,
				},
			];
		},
		hasPreset: () => true,
		presetCount: 1,
	};
}

test('a soundfont voices the note for its bank, program, key and velocity', () => {
	const calls: { bank: number; program: number; key: number; velocity: number }[] = [];
	const bytes = oneNote(0, 62, 90, [...vlq(0), ...programChange(0, 40), ...vlq(0), ...controlChange(0, 0, 3)]);
	const rendered = renderMidiToBuffer(parseMidi(bytes), { soundfont: stubFont(calls) });
	assert.deepEqual(calls, [{ bank: 3, program: 40, key: 62, velocity: 90 }]);
	assert.ok(peak(rendered.left) > 0.01);
});

test('drums always read bank 128, whatever CC0 says', () => {
	const calls: { bank: number; program: number; key: number; velocity: number }[] = [];
	const bytes = oneNote(9, 36, 100, [...vlq(0), ...controlChange(9, 0, 7)]);
	renderMidiToBuffer(parseMidi(bytes), { soundfont: stubFont(calls) });
	assert.deepEqual(
		calls.map((c) => c.bank),
		[128],
	);
});

test('a looping sample keeps sounding past its own length; a one-shot does not', () => {
	const blip = (loop: boolean): SoundFont => ({
		voices: () => [
			{
				sample: { data: new Float32Array(2205).fill(0.5), rate: 22050, loopStart: 0, loopEnd: 2205 },
				rootKey: 60,
				cents: 0,
				loop,
				gain: 1,
				pan: 0,
				attack: 0.001,
				hold: 10,
				decay: 0.001,
				sustain: 1,
				release: 0.01,
			},
		],
		hasPreset: () => true,
		presetCount: 1,
	});
	//a single two-second note: one quarter at two seconds per quarter
	const long = (font: SoundFont): Float32Array => {
		const bytes = buildMidi(96, [
			...vlq(0),
			...tempoMeta(2000000),
			...vlq(0),
			...noteOn(0, 60, 100),
			...vlq(96),
			...noteOff(0, 60),
			...vlq(0),
			...endOfTrack(),
		]);
		return renderMidiToBuffer(parseMidi(bytes), { soundfont: font }).left;
	};
	const rate = 22050;
	const looping = long(blip(true));
	const oneShot = long(blip(false));
	const late = (frames: Float32Array): number => energy(frames, rate, frames.length);
	assert.ok(late(looping) > 1);
	assert.equal(late(oneShot), 0);
});
