import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MidiPlayer, noteToFrequency, parseMidi, timedMidiMessages } from '../src/audio/Midi.ts';
import { renderMidiToBuffer, renderMidiToBufferAsync } from '../src/audio/MidiRender.ts';
import {
	midiSynthNames,
	onMidiSynthFallback,
	registerMidiSynth,
	renderMidiThroughSynth,
	resolveMidiSynth,
	unregisterMidiSynth,
	type MidiSynth,
	type MidiSynthFallback,
} from '../src/audio/MidiSynth.ts';

function vlq(value: number): number[] {
	const bytes = [value & 0x7f];
	for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
	return bytes;
}

/** format 0, one track, 96 ticks per quarter at the default 120 BPM: a note of 96 ticks lasts half a second */
function midiFile(body: readonly number[]): Uint8Array {
	const track = [...body, 0, 0xff, 0x2f, 0];
	const length = track.length;
	return new Uint8Array([
		...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
		...[0x4d, 0x54, 0x72, 0x6b, 0, 0, (length >> 8) & 0xff, length & 0xff],
		...track,
	]);
}

/** program 5 on channel 0, then note `note` held 96 ticks */
function oneNote(note: number): Uint8Array {
	return midiFile([0, 0xc0, 5, 0, 0x90, note, 100, ...vlq(96), 0x80, note, 0]);
}

/** a sine synth that remembers what it was sent: stands in for any engine behind the contract */
function sineSynth(sampleRate = 8000): MidiSynth & { received: string[]; resets: number } {
	const held = new Map<number, { frequency: number; phase: number }>();
	const synth = {
		sampleRate,
		received: [] as string[],
		resets: 0,
		event(status: number, data1: number, data2: number): void {
			synth.received.push(`${status.toString(16)}:${data1}:${data2}`);
			const kind = status & 0xf0;
			if (kind === 0x90 && data2 > 0) held.set(data1, { frequency: noteToFrequency(data1), phase: 0 });
			else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) held.delete(data1);
		},
		sysex(): void {},
		render(left: Float32Array, right: Float32Array, start: number, count: number): void {
			for (let i = start; i < start + count; i++) {
				for (const voice of held.values()) {
					const value = Math.sin(voice.phase) * 0.5;
					voice.phase += (2 * Math.PI * voice.frequency) / sampleRate;
					left[i] += value;
					right[i] += value;
				}
			}
		},
		reset(): void {
			synth.resets++;
			held.clear();
		},
	};
	return synth;
}

/** the pitch of a rendered tone, counted from rising zero crossings over the sounding half second */
function measuredHz(left: Float32Array, sampleRate: number): number {
	let crossings = 0;
	const end = Math.floor(sampleRate * 0.5);
	for (let i = 1; i < end; i++) if (left[i - 1] <= 0 && left[i] > 0) crossings++;
	return crossings / 0.5;
}

function collectFallbacks(): { events: MidiSynthFallback[]; stop: () => void } {
	const events: MidiSynthFallback[] = [];
	const listener = (event: MidiSynthFallback): void => {
		events.push(event);
	};
	onMidiSynthFallback.add(listener);
	return { events, stop: () => onMidiSynthFallback.remove(listener) };
}

test('timedMidiMessages gives raw bytes at the playback time of each event', () => {
	const messages = timedMidiMessages(parseMidi(oneNote(69)));
	assert.deepEqual(
		messages.map((m) => [m.status, m.data1, m.data2, m.time]),
		[
			[0xc0, 5, 0, 0],
			[0x90, 69, 100, 0],
			[0x80, 69, 0, 0.5],
		],
	);
});

test('a pitch bend is sent as the 14-bit value, least significant byte first', () => {
	const file = parseMidi(midiFile([0, 0xe0, 0x00, 0x40, 0, 0xe0, 0x7f, 0x7f, 0, 0x90, 60, 100]));
	const bends = timedMidiMessages(file).filter((m) => m.status === 0xe0);
	assert.deepEqual(
		bends.map((m) => [m.data1, m.data2]),
		[
			[0, 64],
			[127, 127],
		],
	);
});

test('a file rendered through a synth sounds at the pitch of its note, whichever engine plays it', () => {
	const file = parseMidi(oneNote(69));
	const first = renderMidiThroughSynth(file, sineSynth(8000));
	const second = renderMidiThroughSynth(file, sineSynth(16000));
	assert.equal(first.sampleRate, 8000);
	assert.equal(second.sampleRate, 16000);
	assert.ok(Math.abs(measuredHz(first.left, 8000) - 440) <= 4);
	assert.ok(Math.abs(measuredHz(second.left, 16000) - 440) <= 4);
	assert.ok(first.duration > 0.5 && first.loopEnd === first.duration);
});

test('messages arrive at their sample, not at the next block boundary', () => {
	const synth = sineSynth(8000);
	const rendered = renderMidiThroughSynth(parseMidi(oneNote(69)), synth, { blockSize: 3000 });
	const onset = rendered.left.findIndex((v) => v !== 0);
	//the note starts at frame 0 and stops at frame 4000 of an 8000 Hz render: silent afterwards
	assert.ok(onset >= 0 && onset <= 1);
	const tailPeak = Math.max(...rendered.left.slice(4100, 6000).map(Math.abs));
	assert.equal(tailPeak, 0);
});

test('the synth is reset before and after the render and muted channels are dropped', () => {
	const synth = sineSynth();
	const twoChannels = midiFile([0, 0x90, 60, 100, 0, 0x91, 64, 100, ...vlq(96), 0x80, 60, 0, 0, 0x81, 64, 0]);
	renderMidiThroughSynth(parseMidi(twoChannels), synth, { mutedChannels: [1] });
	assert.equal(synth.resets, 2);
	assert.deepEqual(synth.received, ['90:60:100', '80:60:0']);
});

test('a file with no notes is refused by name', () => {
	const file = parseMidi(midiFile([0, 0xc0, 5]));
	assert.throws(() => renderMidiThroughSynth(file, sineSynth()), /no notes/);
});

test('a registered engine is used by name and reported by midiSynthNames', () => {
	registerMidiSynth('test:sine', () => sineSynth(8000));
	try {
		assert.ok(midiSynthNames().includes('test:sine'));
		const rendered = renderMidiToBuffer(parseMidi(oneNote(69)), { synth: 'test:sine' });
		assert.equal(rendered.sampleRate, 8000);
		assert.ok(Math.abs(measuredHz(rendered.left, 8000) - 440) <= 4);
	} finally {
		assert.equal(unregisterMidiSynth('test:sine'), true);
	}
});

test('an unknown engine falls back to the built-in synth and says so, it never throws', () => {
	const { events, stop } = collectFallbacks();
	try {
		const rendered = renderMidiToBuffer(parseMidi(oneNote(69)), { synth: 'retro:nothing', sampleRate: 8000 });
		assert.equal(rendered.sampleRate, 8000);
		assert.ok(rendered.left.some((v) => v !== 0));
		assert.deepEqual(
			events.map((e) => [e.requested, e.used, e.reason]),
			[['retro:nothing', 'builtin', 'unknown']],
		);
	} finally {
		stop();
	}
});

test('a list is tried in order and the first working engine voices the file', () => {
	registerMidiSynth('test:broken', () => {
		throw new Error('no ROM');
	});
	registerMidiSynth('test:ok', () => sineSynth(8000));
	const { events, stop } = collectFallbacks();
	try {
		const resolved = resolveMidiSynth(['test:missing', 'test:broken', 'test:ok'], 8000, 'builtin');
		assert.equal(resolved.name, 'test:ok');
		assert.ok(resolved.synth);
		assert.deepEqual(
			events.map((e) => [e.requested, e.used, e.reason, e.message]),
			[['test:missing', 'test:ok', 'failed', 'no ROM']],
		);
	} finally {
		stop();
		unregisterMidiSynth('test:broken');
		unregisterMidiSynth('test:ok');
	}
});

test('an engine list that ends on gm-soundfont stops there with the internal path', () => {
	const { events, stop } = collectFallbacks();
	try {
		const resolved = resolveMidiSynth(['test:absent', 'gm-soundfont', 'test:never'], 8000, 'gm-soundfont');
		assert.equal(resolved.synth, null);
		assert.equal(resolved.name, 'gm-soundfont');
		assert.equal(events.length, 1);
	} finally {
		stop();
	}
});

test('asking for the SoundFont when none was given reports the built-in synth that plays instead', () => {
	const { events, stop } = collectFallbacks();
	try {
		const resolved = resolveMidiSynth('gm-soundfont', 8000, 'builtin');
		assert.equal(resolved.name, 'builtin');
		assert.deepEqual(
			events.map((e) => [e.requested, e.used]),
			[['gm-soundfont', 'builtin']],
		);
	} finally {
		stop();
	}
});

test('a factory returning something that is not a synth counts as a failure', () => {
	const { events, stop } = collectFallbacks();
	try {
		const resolved = resolveMidiSynth(() => ({}) as MidiSynth, 8000, 'builtin');
		assert.equal(resolved.synth, null);
		assert.equal(events[0].reason, 'failed');
	} finally {
		stop();
	}
});

test('a synth that throws while rendering falls back to the internal path', () => {
	const { events, stop } = collectFallbacks();
	try {
		const exploding: MidiSynth = { ...sineSynth(), render: () => assert.fail('boom') };
		const rendered = renderMidiToBuffer(parseMidi(oneNote(69)), { synth: () => exploding, sampleRate: 8000 });
		assert.ok(rendered.left.some((v) => v !== 0));
		assert.equal(events.length, 1);
		assert.equal(events[0].reason, 'failed');
	} finally {
		stop();
	}
});

test('the reserved engine names cannot be registered over', () => {
	assert.throws(() => registerMidiSynth('builtin', () => sineSynth()), /reserved/);
	assert.throws(() => registerMidiSynth('gm-soundfont', () => sineSynth()), /reserved/);
});

test('the async render honours a synth request on this thread', async () => {
	const rendered = await renderMidiToBufferAsync(oneNote(69), { synth: () => sineSynth(8000) });
	assert.equal(rendered.sampleRate, 8000);
	assert.ok(Math.abs(measuredHz(rendered.left, 8000) - 440) <= 4);
});

test('a MidiPlayer with a synth feeds it the raw messages as time passes', () => {
	const synth = sineSynth();
	const player = new MidiPlayer(parseMidi(oneNote(69)), { synth });
	player.play();
	assert.equal(player.duration, 0.5);
	player.update(0.1);
	assert.deepEqual(synth.received, ['c0:5:0', '90:69:100']);
	player.update(0.5);
	assert.equal(synth.received.at(-1), '80:69:0');
	assert.equal(player.isPlaying, false);
});

test('pausing a synth-driven player releases held notes and stopping resets the synth', () => {
	const synth = sineSynth();
	const player = new MidiPlayer(parseMidi(oneNote(69)), { synth });
	player.play();
	player.update(0.1);
	synth.received.length = 0;
	player.pause();
	assert.equal(synth.received.length, 16);
	assert.ok(synth.received.every((message) => /^b[0-9a-f]:123:0$/.test(message)));
	player.stop();
	assert.equal(synth.resets, 1);
});
