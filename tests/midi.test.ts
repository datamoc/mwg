import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMidi, scheduleMidi, noteToFrequency, MidiPlayer } from '../src/audio/Midi.ts';
import type { ToneOptions } from '../src/audio/Synth.ts';
import type { Playable } from '../src/audio/Playable.ts';

/** builds a minimal, valid Standard MIDI File (format 0, one track) from a list of track bytes */
function buildMidi(ticksPerQuarter: number, trackBytes: readonly number[]): Uint8Array {
	const header = [
		...ascii('MThd'), 0, 0, 0, 6, //length
		0, 0, //format 0
		0, 1, //one track
		(ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff,
	];
	const track = [
		...ascii('MTrk'),
		...uint32(trackBytes.length),
		...trackBytes,
	];
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

function tempoMeta(microsecondsPerQuarter: number): number[] {
	return [0xff, 0x51, 0x03, (microsecondsPerQuarter >> 16) & 0xff, (microsecondsPerQuarter >> 8) & 0xff, microsecondsPerQuarter & 0xff];
}

function noteOn(channel: number, note: number, velocity: number): number[] {
	return [0x90 | channel, note, velocity];
}

function noteOff(channel: number, note: number): number[] {
	return [0x80 | channel, note, 0];
}

function endOfTrack(): number[] {
	return [0xff, 0x2f, 0x00];
}

// ------------------------------------------------------------------- parseMidi

test('parseMidi reads the header fields and a simple note on/off pair', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...tempoMeta(500000),
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(96), ...noteOff(0, 60),
		...vlq(0), ...endOfTrack(),
	]);

	const file = parseMidi(bytes);
	assert.equal(file.ticksPerQuarter, 96);
	assert.deepEqual(
		file.events.filter((e) => e.type !== 'tempo'),
		[
			{ tick: 0, type: 'noteOn', note: 60, velocity: 100, channel: 0 },
			{ tick: 96, type: 'noteOff', note: 60, velocity: 0, channel: 0 },
		]
	);
});

test('a note-on with velocity 0 is read as a note-off, per the MIDI spec', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(10), 0x90, 60, 0, // note-on, velocity 0 == note-off
		...vlq(0), ...endOfTrack(),
	]);

	const events = parseMidi(bytes).events;
	assert.equal(events[1].type, 'noteOff');
});

test('running status reuses the previous status byte for consecutive same-type events', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(10), 62, 100, // running status: another note-on, no status byte repeated
		...vlq(10), ...noteOff(0, 60),
		...vlq(0), 62, 0, // running status note-off
		...vlq(0), ...endOfTrack(),
	]);

	const events = parseMidi(bytes).events;
	assert.deepEqual(
		events.map((e) => [e.type, (e as { note: number }).note]),
		[
			['noteOn', 60],
			['noteOn', 62],
			['noteOff', 60],
			['noteOff', 62],
		]
	);
});

test('non-note channel messages (control change, program change) are skipped, not misread', () => {
	const bytes = buildMidi(96, [
		...vlq(0), 0xb0, 7, 100, // control change, 2 data bytes
		...vlq(0), 0xc0, 5, // program change, 1 data byte
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(10), ...noteOff(0, 60),
		...vlq(0), ...endOfTrack(),
	]);

	const events = parseMidi(bytes).events;
	assert.equal(events.length, 2);
	assert.equal(events[0].type, 'noteOn');
});

test('rejects a file with the wrong header magic', () => {
	const bad = new Uint8Array([1, 2, 3, 4, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96]);
	assert.throws(() => parseMidi(bad), /invalid MIDI header/);
});

test('rejects SMPTE-based timing', () => {
	const bytes = buildMidi(0, []); // division 0 has high bit clear; force it set instead
	bytes[12] = 0x80; // set the SMPTE flag bit in the division's high byte
	assert.throws(() => parseMidi(bytes), /SMPTE/);
});

test('rejects an unsupported format', () => {
	const bytes = buildMidi(96, []);
	bytes[9] = 2; // format 2
	assert.throws(() => parseMidi(bytes), /unsupported MIDI format 2/);
});

// ------------------------------------------------------------------- scheduleMidi

test('scheduleMidi converts ticks to seconds using the default tempo when none is given', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(96), ...noteOff(0, 60), // 96 ticks == 1 quarter note == 0.5s at 120 BPM
		...vlq(0), ...endOfTrack(),
	]);

	const notes = scheduleMidi(parseMidi(bytes));
	assert.equal(notes.length, 1);
	assert.equal(notes[0].time, 0);
	assert.ok(Math.abs(notes[0].duration - 0.5) < 1e-9);
});

test('scheduleMidi honours a tempo change for events after it', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...tempoMeta(250000), // double speed: 0.25s per quarter
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(96), ...noteOff(0, 60),
		...vlq(0), ...endOfTrack(),
	]);

	const notes = scheduleMidi(parseMidi(bytes));
	assert.ok(Math.abs(notes[0].duration - 0.25) < 1e-9);
});

test('an unmatched note-on still produces a note, with a short default duration', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(0), ...endOfTrack(),
	]);

	const notes = scheduleMidi(parseMidi(bytes));
	assert.equal(notes.length, 1);
	assert.equal(notes[0].duration, 0.3);
});

// ------------------------------------------------------------------- noteToFrequency

test('noteToFrequency: A4 (MIDI note 69) is 440 Hz, and octaves double', () => {
	assert.ok(Math.abs(noteToFrequency(69) - 440) < 1e-9);
	assert.ok(Math.abs(noteToFrequency(81) - 880) < 1e-6); // A5, one octave up
});

// ------------------------------------------------------------------- MidiPlayer

function fakePlayable(): Playable {
	return { play() {}, pause() {}, currentTime: 0, volume: 1, loop: false };
}

test('MidiPlayer.update triggers play for each note whose time has arrived, in order', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 127),
		...vlq(96), ...noteOff(0, 60),
		...vlq(0), ...noteOn(0, 64, 127),
		...vlq(96), ...noteOff(0, 64),
		...vlq(0), ...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), { play: (options) => { played.push(options); return fakePlayable(); } });

	player.play();
	assert.equal(player.isPlaying, true);

	player.update(0.3); // before the second note's 0.5s start
	assert.equal(played.length, 1);
	assert.ok(Math.abs(played[0].frequency! - noteToFrequency(60)) < 1e-6);

	player.update(1); // well past the second note too
	assert.equal(played.length, 2);
	assert.equal(player.isPlaying, false);
});

test('MidiPlayer scales volume by each note\'s own velocity', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 64), // half velocity
		...vlq(96), ...noteOff(0, 60),
		...vlq(0), ...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), { volume: 1, play: (options) => { played.push(options); return fakePlayable(); } });
	player.play();
	player.update(1);

	assert.ok(Math.abs(played[0].volume! - 64 / 127) < 1e-6);
});

test('stop rewinds so play() replays from the beginning', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(96), ...noteOff(0, 60),
		...vlq(0), ...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), { play: (options) => { played.push(options); return fakePlayable(); } });
	player.play();
	player.update(1);
	assert.equal(played.length, 1);

	player.stop();
	assert.equal(player.isPlaying, false);
	player.play();
	player.update(1);
	assert.equal(played.length, 2);
});

test('pause stops advancing without resetting position', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(96), ...noteOff(0, 60),
		...vlq(0), ...noteOn(0, 62, 100),
		...vlq(96), ...noteOff(0, 62),
		...vlq(0), ...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), { play: (options) => { played.push(options); return fakePlayable(); } });
	player.play();
	player.update(0.3);
	assert.equal(played.length, 1);

	player.pause();
	player.update(10); // must not advance while paused
	assert.equal(played.length, 1);

	player.play();
	player.update(1);
	assert.equal(played.length, 2);
});

test('duration reflects the last scheduled note\'s own end', () => {
	const bytes = buildMidi(96, [
		...vlq(0), ...noteOn(0, 60, 100),
		...vlq(96), ...noteOff(0, 60),
		...vlq(0), ...endOfTrack(),
	]);
	const player = new MidiPlayer(parseMidi(bytes));
	assert.ok(Math.abs(player.duration - 0.5) < 1e-9);
});
