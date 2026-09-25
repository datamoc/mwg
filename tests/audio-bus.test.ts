import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Channel, AudioBus } from '../src/audio/Channels.ts';
import type { BusLoader, LoadedTrack } from '../src/audio/Channels.ts';

//A hand-driven WebAudio double: the clock only moves when the test moves it.
class FakeParam {
	value = 0;
	setValueAtTime(value: number): void {
		this.value = value;
	}
	setTargetAtTime(value: number): void {
		this.value = value;
	}
	cancelScheduledValues(): void {}
	linearRampToValueAtTime(): void {}
}

class FakeSource {
	buffer: unknown = null;
	loop = false;
	loopStart = 0;
	loopEnd = 0;
	readonly playbackRate = new FakeParam();
	onended: (() => void) | null = null;
	started: { when: number; offset: number } | null = null;
	stops = 0;
	connect(): void {}
	start(when = 0, offset = 0): void {
		this.started = { when, offset };
	}
	stop(): void {
		this.stops++;
	}
	end(): void {
		this.onended?.();
	}
}

class FakeGain {
	readonly gain = new FakeParam();
	connect(): void {}
}

class FakePanner {
	readonly pan = new FakeParam();
	connect(): void {}
}

class FakeContext {
	currentTime = 0;
	readonly destination = {};
	readonly sources: FakeSource[] = [];
	readonly gains: FakeGain[] = [];
	readonly panners: FakePanner[] = [];
	createBufferSource(): FakeSource {
		const source = new FakeSource();
		this.sources.push(source);
		return source;
	}
	createGain(): FakeGain {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}
	createStereoPanner(): FakePanner {
		const panner = new FakePanner();
		this.panners.push(panner);
		return panner;
	}
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function fakeBuffer(duration: number): AudioBuffer {
	return { duration } as unknown as AudioBuffer;
}

function setup(tracks: Record<string, { duration: number }> = {}): {
	fake: FakeContext;
	load: BusLoader;
	requested: { kind: string; name: string }[];
} {
	const requested: { kind: string; name: string }[] = [];
	const load: BusLoader = async (kind, name) => {
		requested.push({ kind, name });
		const found = tracks[`${kind}/${name}`] ?? tracks[name];
		if (!found) return null;
		const loaded: LoadedTrack = { buffer: fakeBuffer(found.duration), loop: null };
		return loaded;
	};
	return { fake: new FakeContext(), load, requested };
}

// ------------------------------------------------------------------- Channel

test('play wires the buffer, parameters and a whole-buffer loop, starting at pos', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10), { volume: 0.8, pitch: 2, pan: -0.5, pos: 3 });

	const [source] = fake.sources;
	assert.equal(source.buffer !== null, true);
	assert.equal(source.loop, true);
	assert.deepEqual(source.started, { when: 0, offset: 3 });
	assert.equal(fake.gains[0].gain.value, 0.8);
	assert.equal(source.playbackRate.value, 2);
	assert.equal(fake.panners[0].pan.value, -0.5);
	assert.equal(channel.isPlaying, true);
});

test('a loop region is written to the node and the playhead starts inside it', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10), { loop: { start: 2, end: 5 }, pos: 2 });

	const [source] = fake.sources;
	assert.equal(source.loopStart, 2);
	assert.equal(source.loopEnd, 5);
	assert.equal(channel.position(), 2);
});

test('position advances with the clock and wraps inside the loop region', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10), { loop: { start: 2, end: 5 }, pos: 2 });

	fake.currentTime = 4; // 2 + 4 = 6, past the end at 5, wraps to 3
	assert.equal(channel.position(), 3);
});

test('playing again stops the old voice and starts a new one', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10));
	channel.play(fakeBuffer(10), { pos: 1 });

	assert.equal(fake.sources[0].stops, 1);
	assert.deepEqual(fake.sources[1].started, { when: 0, offset: 1 });
	assert.equal(channel.isPlaying, true);
});

test('update retunes the live voice without starting a new one', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10), { volume: 0.5 });
	channel.update({ volume: 0.9, pitch: 1.5, pan: 0.25 });

	assert.equal(fake.sources.length, 1);
	assert.equal(fake.gains[0].gain.value, 0.9);
	assert.equal(fake.sources[0].playbackRate.value, 1.5);
	assert.equal(fake.panners[0].pan.value, 0.25);
});

test('stop keeps the playhead where the voice was', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10));
	fake.currentTime = 4;
	channel.stop();

	assert.equal(channel.isPlaying, false);
	assert.equal(channel.position(), 4);
});

test('a non-repeating voice ends on its own when the buffer does', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(5), { repeat: false });

	assert.equal(fake.sources[0].loop, false);
	assert.equal(channel.isPlaying, true);
	fake.sources[0].end();
	assert.equal(channel.isPlaying, false);
});

test('seek moves a playing voice by restarting it at the new playhead', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10));
	channel.seek(7);

	assert.equal(fake.sources.length, 2);
	assert.deepEqual(fake.sources[1].started, { when: 0, offset: 7 });
});

test('state and restore round-trip parameters and playhead as plain data', () => {
	const fake = new FakeContext();
	const channel = new Channel(fake as unknown as AudioContext);
	channel.play(fakeBuffer(10), { volume: 0.6, pitch: 1, pan: 0.1 });
	fake.currentTime = 2;

	const state = channel.state();
	assert.deepEqual(state, { volume: 0.6, pitch: 1, pan: 0.1, pos: 2 });
	assert.deepEqual(JSON.parse(JSON.stringify(state)), state);

	channel.stop();
	channel.restore(state);
	assert.equal(channel.position(), 2);
});

// ------------------------------------------------------------------- AudioBus

test('playBgm loads the named track and plays it with scaled parameters', async () => {
	const { fake, load } = setup({ 'bgm/town': { duration: 100 } });
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'town', volume: 90, pitch: 100, pan: -50 });

	assert.equal(fake.sources.length, 1);
	assert.equal(fake.gains[0].gain.value, 0.9);
	assert.equal(fake.sources[0].playbackRate.value, 1);
	assert.equal(fake.panners[0].pan.value, -0.5);
});

test('replaying the same BGM retunes it instead of restarting it', async () => {
	const { fake, load } = setup({ 'bgm/town': { duration: 100 } });
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'town', volume: 90 });
	await bus.playBgm({ name: 'town', volume: 40 });

	assert.equal(fake.sources.length, 1);
	assert.equal(fake.gains[0].gain.value, 0.4);
});

test('a different BGM stops the old voice and starts over', async () => {
	const { fake, load } = setup({ 'bgm/town': { duration: 100 }, 'bgm/cave': { duration: 60 } });
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'town' });
	await bus.playBgm({ name: 'cave' });

	assert.equal(fake.sources[0].stops, 1);
	assert.equal(fake.sources.length, 2);
});

test('an ME suspends the BGM and resumes it where it left off', async () => {
	const { fake, load } = setup({ 'bgm/town': { duration: 100 }, 'me/fanfare': { duration: 5 } });
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'town' });
	fake.currentTime = 10;
	await bus.playMe({ name: 'fanfare' });

	assert.equal(fake.sources[0].stops, 1); // the BGM voice
	assert.equal(fake.sources[1].loop, false); // the jingle plays once
	fake.sources[1].end();
	await flush();

	assert.equal(fake.sources.length, 3);
	assert.deepEqual(fake.sources[2].started, { when: 0, offset: 10 });
});

test('a BGM requested mid-jingle replaces the suspended one', async () => {
	const { fake, load } = setup({
		'bgm/town': { duration: 100 },
		'bgm/cave': { duration: 60 },
		'me/fanfare': { duration: 5 },
	});
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'town' });
	await bus.playMe({ name: 'fanfare' });
	await bus.playBgm({ name: 'cave' });
	fake.sources[1].end(); // the jingle ends
	await flush();

	const started = fake.sources.filter((source) => source.started !== null);
	assert.equal(started.length, 3); // town, fanfare, cave: town never resumes
	assert.deepEqual(
		started.map((source) => source.started?.offset),
		[0, 0, 0],
	);
});

test('save and replay memorize the playhead across a stop', async () => {
	const { fake, load } = setup({ 'bgm/town': { duration: 100 } });
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'town', volume: 80 });
	fake.currentTime = 25;
	const saved = bus.saveBgm();
	assert.deepEqual(saved, { name: 'town', volume: 80, pitch: 100, pan: 0, pos: 25 });

	bus.stopBgm();
	await bus.replayBgm();
	assert.deepEqual(fake.sources[fake.sources.length - 1].started, { when: 0, offset: 25 });
});

test('snapshot restores plain-data state on a fresh bus', async () => {
	const first = setup({ 'bgm/town': { duration: 100 }, 'bgs/rain': { duration: 200 } });
	const bus = new AudioBus(first.fake as unknown as AudioContext, { load: first.load });
	await bus.playBgm({ name: 'town' });
	await bus.playBgs({ name: 'rain' });
	first.fake.currentTime = 12;
	const snapshot = bus.snapshot();
	assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);

	const second = setup({ 'bgm/town': { duration: 100 }, 'bgs/rain': { duration: 200 } });
	const revived = new AudioBus(second.fake as unknown as AudioContext, { load: second.load });
	revived.restore(snapshot);
	await flush();

	assert.deepEqual(second.requested, [
		{ kind: 'bgm', name: 'town' },
		{ kind: 'bgs', name: 'rain' },
	]);
	assert.deepEqual(second.fake.sources[0].started, { when: 0, offset: 12 });
});

test('sound effects overlap instead of cutting each other off', async () => {
	const { fake, load } = setup({ 'se/hit': { duration: 1 } });
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playSe({ name: 'hit' });
	await bus.playSe({ name: 'hit' });

	assert.equal(fake.sources.length, 2);
	assert.equal(fake.sources[0].stops, 0);
	bus.stopSe();
	assert.equal(fake.sources[0].stops, 1);
	assert.equal(fake.sources[1].stops, 1);
});

test('an unloadable track clears the request instead of hanging the channel', async () => {
	const { fake, load } = setup({});
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'missing' });

	assert.equal(fake.sources.length, 0);
	assert.equal(bus.currentTrack('bgm'), null);
});

test('stopAll silences every voice at once', async () => {
	const { fake, load } = setup({ 'bgm/town': { duration: 100 }, 'se/hit': { duration: 1 } });
	const bus = new AudioBus(fake as unknown as AudioContext, { load });
	await bus.playBgm({ name: 'town' });
	await bus.playSe({ name: 'hit' });
	bus.stopAll();

	assert.equal(fake.sources[0].stops, 1);
	assert.equal(fake.sources[1].stops, 1);
	assert.equal(bus.currentTrack('bgm'), null);
});
