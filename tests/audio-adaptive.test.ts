import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AdaptiveMusic } from '../src/audio/AdaptiveMusic.ts';
import { parseMidi } from '../src/audio/Midi.ts';
import { renderMidiStems, renderMidiToBuffer } from '../src/audio/MidiRender.ts';
import { FakeAudioContext, FakeBufferSource, FakeGain } from '../src/testing/FakeAudio.ts';

const RATE = 8000;

function stems(context: FakeAudioContext, names: string[], seconds = 4): Record<string, AudioBuffer> {
	return Object.fromEntries(
		names.map((name) => [name, context.createBuffer(2, seconds * RATE, RATE) as unknown as AudioBuffer]),
	);
}

/** every started source with the gain it plays through, in creation order */
function voicesOf(context: FakeAudioContext): FakeBufferSource[] {
	return context.sources;
}

function setup(): { context: FakeAudioContext; music: AdaptiveMusic; gains: FakeGain[] } {
	const context = new FakeAudioContext(RATE);
	const gains: FakeGain[] = [];
	const make = context.createGain.bind(context);
	context.createGain = () => {
		const gain = make();
		gains.push(gain);
		return gain;
	};
	(context as unknown as { gains: FakeGain[] }).gains = gains;
	return { context, music: new AdaptiveMusic(context.asContext(), { fadeSeconds: 1 }), gains };
}

test('every stem starts on the same tick at the same offset, silent unless given a level', () => {
	const { context, music, gains } = setup();
	music.load('calm', stems(context, ['drums', 'melody', 'pads']));
	music.play({ pos: 1.5, levels: { pads: 0.6 } });
	const sources = voicesOf(context);
	assert.equal(sources.length, 3);
	assert.ok(sources.every((s) => s.startedAt === sources[0].startedAt && s.offset === 1.5));
	assert.ok(sources.every((s) => s.loop));
	assert.deepEqual(music.levels(), { drums: 0, melody: 0, pads: 0.6 });
	assert.equal(gains[3].gain.value, 0.6, 'pads');
	assert.equal(gains[1].gain.value, 0);
	assert.equal(music.isPlaying, true);
});

test('a level change fades over the given time, a group changes all its members', () => {
	const { context, music, gains } = setup();
	music.load('calm', stems(context, ['drums', 'melody', 'pads']), { groups: { fight: ['drums', 'melody'] } });
	music.play({ levels: { pads: 1 } });
	music.setLevel('fight', 1, 2);
	assert.deepEqual(gains[1].ramps, [{ value: 1, time: 2 }]);
	assert.deepEqual(gains[2].ramps, [{ value: 1, time: 2 }]);
	assert.deepEqual(gains[3].ramps, [], 'pads untouched');
	music.setLevel('pads', 0.25, 0);
	assert.equal(gains[3].gain.value, 0.25, 'no fade means immediately');
	assert.deepEqual(music.levels(), { drums: 1, melody: 1, pads: 0.25 });
	assert.throws(() => music.setLevel('ghost', 1), /neither a stem nor a group/);
});

test('a start level given by group applies to its members and a stem named directly wins', () => {
	const { context, music } = setup();
	music.load('calm', stems(context, ['drums', 'melody']), { groups: { all: ['drums', 'melody'] } });
	music.play({ levels: { all: 0.5, melody: 1 } });
	assert.deepEqual(music.levels(), { drums: 0.5, melody: 1 });
});

test('the position follows the clock and wraps inside the loop region', () => {
	const { context, music } = setup();
	music.load('calm', stems(context, ['drums'], 4), { loop: { start: 1, end: 3 } });
	music.play({ pos: 2 });
	context.advance(0.5);
	assert.equal(music.positionFrames(), 2.5 * RATE);
	context.advance(1);
	assert.equal(music.position(), 1.5, 'past the loop end at 3 it wraps back into the loop');
	const sources = voicesOf(context);
	assert.equal(sources[0].loopStart, 1);
	assert.equal(sources[0].loopEnd, 3);
});

test('switching versions crossfades at the same frame and keeps the levels', () => {
	const { context, music, gains } = setup();
	music.load('calm', stems(context, ['drums', 'melody']));
	music.load('fight', stems(context, ['drums', 'melody']));
	music.play({ levels: { drums: 1, melody: 0.4 } });
	context.advance(1.25);
	music.switchVersion('fight', 2);
	assert.equal(music.version, 'fight');
	const [oldDrums, oldMelody, newDrums, newMelody] = voicesOf(context);
	assert.equal(newDrums.offset, 1.25, 'starts where the old one had got to');
	assert.equal(newMelody.offset, 1.25);
	assert.equal(newDrums.startedAt, context.currentTime);
	assert.equal(oldDrums.stoppedAt, context.currentTime + 2.05);
	assert.equal(oldMelody.stoppedAt, context.currentTime + 2.05);
	assert.deepEqual(music.levels(), { drums: 1, melody: 0.4 });
	//the old master fades out while the new one fades in: gains 0 (old master), 1 2 (old stems), 3 (new master)
	assert.deepEqual(gains[0].ramps.at(-1), { value: 0, time: context.currentTime + 2 });
	assert.deepEqual(gains[3].ramps.at(-1), { value: 1, time: context.currentTime + 2 });
	assert.equal(gains[4].gain.value, 1);
	assert.equal(gains[5].gain.value, 0.4);
	music.switchVersion('fight');
	assert.equal(voicesOf(context).length, 4, 'switching to the version already playing does nothing');
});

test('a bar-quantised switch waits for the next bar line and carries the frame of that bar', () => {
	const { context, music, gains } = setup();
	music.load('calm', stems(context, ['drums']), { barSeconds: 2 });
	music.load('fight', stems(context, ['drums']), { barSeconds: 2 });
	music.play({ levels: { drums: 1 } });
	context.advance(0.5);
	music.switchVersion('fight', 1, 'bar');
	const [oldDrums, newDrums] = voicesOf(context);
	assert.equal(newDrums.startedAt, 2, 'the new version starts at the bar line, 1.5 s away');
	assert.equal(newDrums.offset, 2, 'at the frame the old one reaches then');
	assert.equal(oldDrums.stoppedAt, 2 + 1.05);
	assert.deepEqual(gains[0].ramps.at(-1), { value: 0, time: 3 }, 'the old master fades from the bar line');
	assert.equal(music.version, 'fight');
});

test('a bar-quantised switch made exactly on a bar line happens at once', () => {
	const { context, music } = setup();
	music.load('calm', stems(context, ['drums']), { barSeconds: 2 });
	music.load('fight', stems(context, ['drums']), { barSeconds: 2 });
	music.play({ levels: { drums: 1 } });
	context.advance(2);
	music.switchVersion('fight', 0, 'bar');
	assert.equal(voicesOf(context)[1].startedAt, 2);
	assert.equal(voicesOf(context)[1].offset, 2);
});

test('a bar-quantised level change starts its fade at the bar line', () => {
	const { context, music, gains } = setup();
	music.load('calm', stems(context, ['drums', 'pads']), { barSeconds: 2 });
	music.play({ levels: { pads: 1 } });
	context.advance(0.5);
	music.setLevel('drums', 1, 1, 'bar');
	assert.deepEqual(gains[1].ramps, [{ value: 1, time: 3 }], 'from 2 s, over 1 s');
	assert.deepEqual(music.levels(), { drums: 1, pads: 1 });
});

test('quantising to a bar needs the version to declare its bar length', () => {
	const { context, music } = setup();
	music.load('calm', stems(context, ['drums']));
	music.play();
	assert.throws(() => music.setLevel('drums', 1, 1, 'bar'), /declares no barSeconds/);
	assert.throws(() => music.load('bad', stems(context, ['drums']), { barSeconds: -1 }), /must be positive/);
});

test('stopping fades the master, then the position is forgotten', () => {
	const { context, music, gains } = setup();
	music.load('calm', stems(context, ['drums']));
	music.play({ levels: { drums: 1 } });
	music.stop(1.5);
	assert.deepEqual(gains[0].ramps, [{ value: 0, time: 1.5 }]);
	assert.equal(voicesOf(context)[0].stoppedAt, 1.55);
	assert.equal(music.isPlaying, false);
	assert.equal(music.positionFrames(), 0);
});

test('stems that do not line up, groups that name nothing and unknown versions are refused', () => {
	const { context, music } = setup();
	const uneven = {
		a: context.createBuffer(2, 100, RATE) as unknown as AudioBuffer,
		b: context.createBuffer(2, 200, RATE) as unknown as AudioBuffer,
	};
	assert.throws(() => music.load('x', uneven), /differs in length/);
	assert.throws(() => music.load('x', {}), /no stems/);
	assert.throws(() => music.load('x', stems(context, ['a']), { groups: { g: ['zz'] } }), /lacks/);
	assert.throws(() => music.load('x', stems(context, ['a']), { groups: { a: ['a'] } }), /name of a stem/);
	music.load('ok', stems(context, ['a']));
	const other = { a: context.createBuffer(2, 100, 4000) as unknown as AudioBuffer };
	assert.throws(() => music.load('slow', other), /Hz/);
	assert.throws(() => music.play({ version: 'nope' }), /no adaptive version/);
	assert.throws(() => music.setLevel('a', 1), /not playing/);
	assert.throws(() => music.switchVersion('ok'), /not playing/);
});

/** channel 0 plays note 60 for a quarter at tick 0, channel 9 plays note 36 later: two voices to tell apart */
function twoChannelMidi(): Uint8Array {
	const track = [0, 0x90, 60, 100, 96, 0x80, 60, 0, 0, 0x99, 36, 100, 96, 0x89, 36, 0, 0, 0xff, 0x2f, 0];
	return new Uint8Array([
		...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
		...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
		...track,
	]);
}

test('stems of a MIDI file are aligned, each holds only its channels, an empty group is silent', () => {
	const file = parseMidi(twoChannelMidi());
	const stemsOut = renderMidiStems(file, { melody: [0], rhythm: [9], empty: [5] }, { sampleRate: RATE });
	const lengths = Object.values(stemsOut).map((s) => s.left.length);
	assert.ok(lengths.every((length) => length === lengths[0]));
	assert.ok(stemsOut.melody.left.some((v) => v !== 0));
	assert.ok(stemsOut.rhythm.left.some((v) => v !== 0));
	assert.ok(stemsOut.empty.left.every((v) => v === 0));
	//the melody note ends before the drum starts, so the melody stem is silent over the drum's onset
	const drumOnset = Math.floor(0.5 * RATE) + 10;
	assert.ok(stemsOut.melody.left.slice(drumOnset + 400, drumOnset + 800).every((v) => Math.abs(v) < 0.2));
	//together they are the whole file
	const whole = renderMidiToBuffer(file, { sampleRate: RATE });
	const sum = stemsOut.melody.left.map((v, i) => v + stemsOut.rhythm.left[i]);
	assert.ok(sum.every((v, i) => Math.abs(v - (whole.left[i] ?? 0)) < 1e-6));
});
