import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMidi, scheduleMidi, noteToFrequency, midiLoopStart, MidiPlayer } from '../src/audio/Midi.ts';
import type { ToneOptions } from '../src/audio/Synth.ts';
import type { Playable } from '../src/audio/Playable.ts';

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

function pitchBend(channel: number, value: number): number[] {
	const centered = value + 8192;
	return [0xe0 | channel, centered & 0x7f, (centered >> 7) & 0x7f];
}

function endOfTrack(): number[] {
	return [0xff, 0x2f, 0x00];
}

// ------------------------------------------------------------------- parseMidi

test('parseMidi reads the header fields and a simple note on/off pair', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...tempoMeta(500000),
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	const file = parseMidi(bytes);
	assert.equal(file.ticksPerQuarter, 96);
	assert.equal(file.loopStartTick, null);
	assert.deepEqual(
		file.events.filter((e) => e.type !== 'tempo'),
		[
			{ tick: 0, type: 'noteOn', note: 60, velocity: 100, channel: 0 },
			{ tick: 96, type: 'noteOff', note: 60, velocity: 0, channel: 0 },
		],
	);
});

test('a note-on with velocity 0 is read as a note-off, per the MIDI spec', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(10),
		0x90,
		60,
		0, // note-on, velocity 0 == note-off
		...vlq(0),
		...endOfTrack(),
	]);

	const events = parseMidi(bytes).events;
	assert.equal(events[1].type, 'noteOff');
});

test('running status reuses the previous status byte for consecutive same-type events', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(10),
		62,
		100, // running status: another note-on, no status byte repeated
		...vlq(10),
		...noteOff(0, 60),
		...vlq(0),
		62,
		0, // running status note-off
		...vlq(0),
		...endOfTrack(),
	]);

	const events = parseMidi(bytes).events;
	assert.deepEqual(
		events.map((e) => [e.type, (e as { note: number }).note]),
		[
			['noteOn', 60],
			['noteOn', 62],
			['noteOff', 60],
			['noteOff', 62],
		],
	);
});

test('program changes, control changes and pitch bends are kept as events', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...controlChange(0, 0, 3), // bank select
		...vlq(0),
		...controlChange(0, 7, 100), // channel volume
		...vlq(0),
		...programChange(0, 5),
		...vlq(0),
		...pitchBend(0, 0), // centered
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(10),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	const file = parseMidi(bytes);
	assert.equal(file.loopStartTick, null);
	assert.deepEqual(file.events, [
		{ tick: 0, type: 'control', channel: 0, controller: 0, value: 3 },
		{ tick: 0, type: 'control', channel: 0, controller: 7, value: 100 },
		{ tick: 0, type: 'program', channel: 0, program: 5 },
		{ tick: 0, type: 'pitchBend', channel: 0, value: 0 },
		{ tick: 0, type: 'noteOn', note: 60, velocity: 100, channel: 0 },
		{ tick: 10, type: 'noteOff', note: 60, velocity: 0, channel: 0 },
	]);
});

test('pitch bend reports its signed amount, 0 when centered', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...pitchBend(1, -8192),
		...vlq(5),
		...pitchBend(1, 8191),
		...vlq(0),
		...endOfTrack(),
	]);

	assert.deepEqual(
		parseMidi(bytes).events.map((e) => (e as { value: number }).value),
		[-8192, 8191],
	);
});

test('controller 111 records the loop start tick, first marker wins', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...controlChange(2, 111, 0), // loop marker at tick 0 on channel 2
		...vlq(10),
		...controlChange(2, 111, 0), // a second marker must not move it
		...vlq(0),
		...noteOn(2, 60, 100),
		...vlq(48),
		...noteOff(2, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	const file = parseMidi(bytes);
	assert.equal(file.loopStartTick, 0);
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

// ------------------------------------------------------------------- midiLoopStart

test('midiLoopStart is null when the file carries no loop marker', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	assert.equal(midiLoopStart(parseMidi(bytes)), null);
});

test('midiLoopStart resolves the marker tick through a tempo change', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...tempoMeta(500000),
		...vlq(24),
		...tempoMeta(250000), // double speed from tick 24
		...vlq(24),
		...controlChange(0, 111, 0), // tick 48: 0.125 s + 0.0625 s
		...vlq(0),
		...endOfTrack(),
	]);

	const file = parseMidi(bytes);
	assert.equal(file.loopStartTick, 48);
	assert.ok(Math.abs(midiLoopStart(file)! - 0.1875) < 1e-9);
});

// ------------------------------------------------------------------- scheduleMidi

test('scheduleMidi converts ticks to seconds using the default tempo when none is given', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60), // 96 ticks == 1 quarter note == 0.5s at 120 BPM
		...vlq(0),
		...endOfTrack(),
	]);

	const notes = scheduleMidi(parseMidi(bytes));
	assert.equal(notes.length, 1);
	assert.equal(notes[0].time, 0);
	assert.ok(Math.abs(notes[0].duration - 0.5) < 1e-9);
});

test('scheduleMidi honours a tempo change for events after it', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...tempoMeta(250000), // double speed: 0.25s per quarter
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	const notes = scheduleMidi(parseMidi(bytes));
	assert.ok(Math.abs(notes[0].duration - 0.25) < 1e-9);
});

test('scheduleMidi snapshots the channel voice at each note start', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...programChange(0, 40),
		...vlq(0),
		...controlChange(0, 0, 2), // bank
		...vlq(0),
		...controlChange(0, 7, 64), // volume about half
		...vlq(0),
		...controlChange(0, 11, 127), // full expression
		...vlq(0),
		...controlChange(0, 10, 96), // right of center
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...programChange(0, 0), // a later change must not rewrite the first note
		...vlq(0),
		...noteOn(0, 62, 100),
		...vlq(96),
		...noteOff(0, 62),
		...vlq(0),
		...endOfTrack(),
	]);

	const notes = scheduleMidi(parseMidi(bytes));
	assert.equal(notes.length, 2);
	assert.equal(notes[0].program, 40);
	assert.equal(notes[0].bank, 2);
	assert.ok(Math.abs(notes[0].gain - (64 / 127) * (127 / 127)) < 1e-9);
	assert.ok(Math.abs(notes[0].pan - (96 - 64) / 64) < 1e-9);
	assert.equal(notes[1].program, 0);
	assert.equal(notes[1].bank, 2);
});

test('scheduled notes default to program 0, bank 0, full gain and centered pan', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(3, 60, 100),
		...vlq(96),
		...noteOff(3, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	const [note] = scheduleMidi(parseMidi(bytes));
	assert.equal(note.program, 0);
	assert.equal(note.bank, 0);
	assert.ok(Math.abs(note.gain - (100 / 127) * (127 / 127)) < 1e-9);
	assert.equal(note.pan, 0);
});

test('an unmatched note-on still produces a note, with a short default duration', () => {
	const bytes = buildMidi(96, [...vlq(0), ...noteOn(0, 60, 100), ...vlq(0), ...endOfTrack()]);

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
		...vlq(0),
		...noteOn(0, 60, 127),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...noteOn(0, 64, 127),
		...vlq(96),
		...noteOff(0, 64),
		...vlq(0),
		...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), {
		play: (options) => {
			played.push(options);
			return fakePlayable();
		},
	});

	player.play();
	assert.equal(player.isPlaying, true);

	player.update(0.3); // before the second note's 0.5s start
	assert.equal(played.length, 1);
	assert.ok(Math.abs(played[0].frequency! - noteToFrequency(60)) < 1e-6);

	player.update(1); // well past the second note too
	assert.equal(played.length, 2);
	assert.equal(player.isPlaying, false);
});

test("MidiPlayer scales volume by each note's own velocity", () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 64), // half velocity
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), {
		volume: 1,
		play: (options) => {
			played.push(options);
			return fakePlayable();
		},
	});
	player.play();
	player.update(1);

	assert.ok(Math.abs(played[0].volume! - 64 / 127) < 1e-6);
});

test('stop rewinds so play() replays from the beginning', () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), {
		play: (options) => {
			played.push(options);
			return fakePlayable();
		},
	});
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
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...noteOn(0, 62, 100),
		...vlq(96),
		...noteOff(0, 62),
		...vlq(0),
		...endOfTrack(),
	]);

	const played: ToneOptions[] = [];
	const player = new MidiPlayer(parseMidi(bytes), {
		play: (options) => {
			played.push(options);
			return fakePlayable();
		},
	});
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

test("duration reflects the last scheduled note's own end", () => {
	const bytes = buildMidi(96, [
		...vlq(0),
		...noteOn(0, 60, 100),
		...vlq(96),
		...noteOff(0, 60),
		...vlq(0),
		...endOfTrack(),
	]);
	const player = new MidiPlayer(parseMidi(bytes));
	assert.ok(Math.abs(player.duration - 0.5) < 1e-9);
});
