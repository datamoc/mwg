import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioBus } from '../src/audio/Channels.ts';
import type { BusLoader } from '../src/audio/Channels.ts';
import { loopRegionFromTags, parseVorbisLoopTags } from '../src/audio/LoopTags.ts';
import { scheduleMidi } from '../src/audio/Midi.ts';
import type { MidiFile } from '../src/audio/Midi.ts';
import { EventRunner } from '../src/rpg/EventRunner.ts';
import type { EventCommand } from '../src/rpg/EventRunner.ts';
import { GameState } from '../src/rpg/GameState.ts';

// ------------------------------------------------------------ Vorbis loop tags

function oggPage(packets: Uint8Array[], continued = false): Uint8Array {
	const table: number[] = [];
	const body: number[] = [];
	for (const packet of packets) {
		let left = packet.length;
		while (left >= 255) {
			table.push(255);
			left -= 255;
		}
		table.push(left);
		body.push(...packet);
	}
	const header = new Uint8Array(27);
	header.set([0x4f, 0x67, 0x67, 0x53]);
	header[5] = continued ? 1 : 0;
	header[26] = table.length;
	return Uint8Array.from([...header, ...table, ...body]);
}

function commentPacket(comments: string[]): Uint8Array {
	const encoder = new TextEncoder();
	const out: number[] = [3, ...encoder.encode('vorbis')];
	const u32 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
	const vendor = encoder.encode('test');
	out.push(...u32(vendor.length), ...vendor, ...u32(comments.length));
	for (const comment of comments) {
		const bytes = encoder.encode(comment);
		out.push(...u32(bytes.length), ...bytes);
	}
	return Uint8Array.from(out);
}

const identification = Uint8Array.from([1, ...new TextEncoder().encode('vorbis'), 0, 0, 0, 0]);

test('parseVorbisLoopTags reads LOOPSTART and LOOPLENGTH from the comment packet', () => {
	const ogg = Uint8Array.from([
		...oggPage([identification]),
		...oggPage([commentPacket(['TITLE=x', 'loopstart=44100', 'LOOPLENGTH=88200'])]),
	]);
	assert.deepEqual(parseVorbisLoopTags(ogg), { loopStart: 44100, loopLength: 88200 });
});

test('a start with no length loops to the end, and no start means no loop', () => {
	const only = Uint8Array.from([...oggPage([identification]), ...oggPage([commentPacket(['LOOPSTART=10'])])]);
	assert.deepEqual(parseVorbisLoopTags(only), { loopStart: 10, loopLength: null });
	const none = Uint8Array.from([...oggPage([identification]), ...oggPage([commentPacket(['ARTIST=y'])])]);
	assert.equal(parseVorbisLoopTags(none), null);
});

test('malformed or non-Ogg input returns null instead of throwing', () => {
	assert.equal(parseVorbisLoopTags(new Uint8Array([1, 2, 3])), null);
	const truncated = oggPage([identification, commentPacket(['LOOPSTART=1'])]).subarray(0, 40);
	assert.equal(parseVorbisLoopTags(truncated), null);
});

test('loopRegionFromTags converts samples to seconds inside the buffer', () => {
	assert.deepEqual(loopRegionFromTags({ loopStart: 44100, loopLength: 44100 }, 44100, 10), { start: 1, end: 2 });
	assert.deepEqual(loopRegionFromTags({ loopStart: 44100, loopLength: null }, 44100, 10), { start: 1, end: 10 });
	assert.equal(loopRegionFromTags({ loopStart: 44100 * 20, loopLength: null }, 44100, 10), null);
	assert.equal(loopRegionFromTags(null, 44100, 10), null);
});

// ------------------------------------------------------------- bus mixer

class Param {
	value = 1;
	setValueAtTime(value: number): void {
		this.value = value;
	}
	setTargetAtTime(value: number): void {
		this.value = value;
	}
	cancelScheduledValues(): void {}
	linearRampToValueAtTime(): void {}
}
class Node {
	readonly gain = new Param();
	readonly pan = new Param();
	readonly playbackRate = new Param();
	buffer: unknown = null;
	loop = false;
	loopStart = 0;
	loopEnd = 0;
	onended: (() => void) | null = null;
	readonly connections: unknown[] = [];
	connect(target: unknown): void {
		this.connections.push(target);
	}
	start(): void {}
	stop(): void {}
}
class Context {
	currentTime = 0;
	readonly destination = new Node();
	readonly gains: Node[] = [];
	readonly sources: Node[] = [];
	createGain(): Node {
		const node = new Node();
		this.gains.push(node);
		return node;
	}
	createStereoPanner(): Node {
		return new Node();
	}
	createBufferSource(): Node {
		const node = new Node();
		this.sources.push(node);
		return node;
	}
}

test('setMixer scales a kind at its own gain node and keeps snapshots unscaled', async () => {
	const context = new Context();
	const load: BusLoader = async () => ({ buffer: { duration: 5 } as unknown as AudioBuffer });
	const bus = new AudioBus(context as unknown as AudioContext, { load });
	const [bgm, bgs, me, se] = context.gains;
	for (const gain of [bgm, bgs, me, se]) assert.deepEqual(gain.connections, [context.destination]);

	bus.setMixer('bgm', { volume: 0.5 });
	assert.equal(bgm.gain.value, 0.5);
	bus.setMixer('bgm', { muted: true });
	assert.equal(bgm.gain.value, 0);
	bus.setMixer('bgm', { muted: false });
	assert.equal(bgm.gain.value, 0.5);
	assert.equal(se.gain.value, 1);
	assert.deepEqual(bus.mixer('bgm'), { volume: 0.5, muted: false });

	await bus.playBgm({ name: 'town', volume: 80 });
	assert.equal(bus.snapshot().bgm?.volume, 80);
	await bus.playSe({ name: 'hit' });
	assert.deepEqual(context.sources.at(-1)?.connections.length, 1);
});

// ------------------------------------------------------------ pitch bend

test('a note carries the pitch bend in effect at its start, in semitones', () => {
	const file: MidiFile = {
		ticksPerQuarter: 96,
		loopStartTick: null,
		events: [
			{ tick: 0, type: 'noteOn', note: 60, velocity: 100, channel: 0 },
			{ tick: 10, type: 'noteOff', note: 60, velocity: 0, channel: 0 },
			{ tick: 20, type: 'pitchBend', channel: 0, value: 8192 },
			{ tick: 20, type: 'noteOn', note: 60, velocity: 100, channel: 0 },
			{ tick: 30, type: 'noteOff', note: 60, velocity: 0, channel: 0 },
			{ tick: 40, type: 'pitchBend', channel: 0, value: 0 },
			{ tick: 40, type: 'noteOn', note: 60, velocity: 100, channel: 0 },
			{ tick: 50, type: 'noteOff', note: 60, velocity: 0, channel: 0 },
		],
	} as MidiFile;
	const [first, second, third] = scheduleMidi(file);
	assert.equal('bend' in first, false);
	assert.equal(second.bend, 2);
	assert.equal('bend' in third, false);
});

// ------------------------------------------------------ unknown commands

test('onUnknownCommand hears every command the runner does not know, and a stray goto', async () => {
	const heard: EventCommand[] = [];
	const game = new GameState();
	const runner = new EventRunner({ present: async () => undefined, game, onUnknownCommand: (c) => heard.push(c) });
	await runner.run([
		{ transfer: { map: 2 } } as unknown as EventCommand,
		{ setSwitch: 'a', value: true },
		{ goto: 'Nowhere' },
		{ setSwitch: 'b', value: true },
	]);
	assert.equal(heard.length, 2);
	assert.deepEqual(heard[1], { goto: 'Nowhere' });
	assert.equal(game.switch('a'), true);
	assert.equal(game.switch('b'), false);
});
