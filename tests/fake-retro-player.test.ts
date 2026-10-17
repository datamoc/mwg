import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FakeRetroPlayer } from '../src/testing/FakeAudio.ts';
import { renderMidiThroughSynth, parseMidi } from '../src/audio/index.ts';

test('FakeRetroPlayer records messages, sounds only while a note is on, and resets', () => {
	const synth = new FakeRetroPlayer(8000);
	const left = new Float32Array(4);
	synth.render(left, new Float32Array(4), 0, 4);
	assert.equal(left[0], 0, 'silence before any note');

	synth.event(0x90, 60, 127);
	assert.equal(synth.notesOn, 1);
	synth.render(left, new Float32Array(4), 0, 4);
	assert.equal(left[0], 0.5, 'full velocity at half level while the note is on');

	synth.event(0x80, 60, 0);
	assert.equal(synth.notesOn, 0);
	assert.deepEqual(synth.events, [
		[0x90, 60, 127],
		[0x80, 60, 0],
	]);

	synth.sysex(new Uint8Array([0xf0, 0x41, 0xf7]));
	assert.equal(synth.sysexMessages.length, 1);
	synth.event(0x91, 64, 90);
	synth.reset();
	assert.equal(synth.notesOn, 0, 'reset silences every voice');
	assert.equal(synth.resets, 1);
});

test('FakeRetroPlayer can voice a renderMidiThroughSynth render and be inspected after it', () => {
	//a one-note SMF built by hand: header, one track, note on, note off, end of track
	const bytes = new Uint8Array([
		0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12, 0, 0xff, 0x51, 0x03,
		0x07, 0xa1, 0x20, 0, 0x90, 60, 100, 96, 0x80, 60, 0, 0, 0xff, 0x2f, 0,
	]);
	const synth = new FakeRetroPlayer(8000);
	const rendered = renderMidiThroughSynth(parseMidi(bytes), synth);
	assert.ok(
		synth.events.some(([status]) => (status & 0xf0) === 0x90),
		'the synth was driven with a note on',
	);
	assert.ok(rendered.left.length > 0);
});
