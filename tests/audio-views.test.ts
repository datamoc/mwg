import { test } from 'node:test';
import assert from 'node:assert/strict';

import { channelEnvelopes, trackerNoteName, trackerPattern, waveformEnvelope } from '../src/audio/AudioViews.ts';
import { parseMidi } from '../src/audio/index.ts';

test('waveformEnvelope keeps the peak of each bucket, in both directions', () => {
	const view = waveformEnvelope(new Float32Array([0, 1, -1, 0.5, 0.25, -0.25]), 3);
	assert.deepEqual(view, [
		{ min: 0, max: 1 },
		{ min: -1, max: 0.5 },
		{ min: -0.25, max: 0.25 },
	]);
	assert.deepEqual(waveformEnvelope(new Float32Array([]), 4), []);
	assert.deepEqual(waveformEnvelope(new Float32Array([2]), 0), []);
	const [left, right] = channelEnvelopes(new Float32Array([1, -1]), new Float32Array([0.5, -0.5]), 1);
	assert.deepEqual(left, [{ min: -1, max: 1 }]);
	assert.deepEqual(right, [{ min: -0.5, max: 0.5 }], 'each channel envelopes its own samples');
});

test('trackerNoteName spells middle C as C4 and carries the octave boundary', () => {
	assert.equal(trackerNoteName(60), 'C4');
	assert.equal(trackerNoteName(61), 'C#4');
	assert.equal(trackerNoteName(59), 'B3', 'one below middle C is the octave under it');
	assert.equal(trackerNoteName(72), 'C5');
});

/** an SMF with a tempo and two notes: C4 on channel 0 at tick 0, E4 on channel 1 a quarter later */
function twoNoteFile(): Uint8Array {
	const track = [
		0,
		0xff,
		0x51,
		0x03,
		0x07,
		0xa1,
		0x20, //500000 us per quarter
		0,
		0x90,
		60,
		96,
		0x60,
		0x80,
		60,
		0,
		0,
		0x91,
		64,
		96,
		0x60,
		0x81,
		64,
		0,
		0,
		0xff,
		0x2f,
		0,
	];
	return new Uint8Array([
		0x4d,
		0x54,
		0x68,
		0x64,
		0,
		0,
		0,
		6,
		0,
		0,
		0,
		1,
		0,
		96,
		0x4d,
		0x54,
		0x72,
		0x6b,
		0,
		0,
		0,
		track.length,
		...track,
	]);
}

test('trackerPattern lays notes on the step grid, one column per channel', () => {
	const rows = trackerPattern(parseMidi(twoNoteFile()));
	//96 ticks per quarter, 4 steps per quarter: a step is 24 ticks; the second note is at tick 96
	assert.equal(rows.length, 5, 'steps 0 to 4');
	assert.deepEqual(rows[0].notes, ['C4', null]);
	assert.deepEqual(rows[4].notes, [null, 'E4']);
	assert.deepEqual(rows[1].notes, [null, null], 'an empty step names nothing');
	assert.equal(rows[0].time, 0);
	assert.ok(rows[4].time > 0.49 && rows[4].time < 0.51, 'a quarter at 120 bpm is half a second');
	assert.equal(rows[1].time, 0, 'an empty row carries the last sounding time');
});
