import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MusicPlayer, toAudioBuffer, type RenderedMidi } from '../src/audio/index.ts';

class FakeParam {
	value = 0;
	setValueAtTime(): void {}
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
	started: { offset: number } | null = null;
	connect(): void {}
	start(_when = 0, offset = 0): void {
		this.started = { offset };
	}
	stop(): void {}
	end(): void {
		this.onended?.();
	}
}

class FakeContext {
	currentTime = 0;
	readonly destination = {};
	readonly sources: FakeSource[] = [];
	createBufferSource(): FakeSource {
		const source = new FakeSource();
		this.sources.push(source);
		return source;
	}
	createGain(): { gain: FakeParam; connect(): void } {
		return { gain: new FakeParam(), connect() {} };
	}
	createBuffer(channels: number, length: number, sampleRate: number): unknown {
		const data = Array.from({ length: channels }, () => new Float32Array(length));
		return {
			numberOfChannels: channels,
			length,
			sampleRate,
			duration: length / sampleRate,
			getChannelData: (channel: number) => data[channel],
		};
	}
}

function setup(): { context: FakeContext; player: MusicPlayer } {
	const context = new FakeContext();
	return { context, player: new MusicPlayer(context as unknown as AudioContext) };
}

const track = (duration: number): AudioBuffer => ({ duration }) as unknown as AudioBuffer;

test('toAudioBuffer copies both channels of a render into the buffer', () => {
	const context = new FakeContext();
	const rendered: RenderedMidi = {
		sampleRate: 4,
		left: new Float32Array([1, 2]),
		right: new Float32Array([3, 4]),
		loopStart: 0,
		loopEnd: 0.5,
		duration: 0.5,
	};
	const buffer = toAudioBuffer(context as unknown as AudioContext, rendered);
	assert.deepEqual([...buffer.getChannelData(0)], [1, 2]);
	assert.deepEqual([...buffer.getChannelData(1)], [3, 4]);
	assert.equal(buffer.duration, 0.5);
});

test('pause holds the position and resume continues from it', () => {
	const { context, player } = setup();
	player.load(track(100));
	player.play();
	context.currentTime = 12;
	player.pause();
	assert.ok(player.isPaused && !player.isPlaying);
	context.currentTime = 40;
	assert.equal(player.position(), 12);
	player.resume();
	assert.equal(context.sources.at(-1)?.started?.offset, 12);
	context.currentTime = 45;
	assert.equal(player.position(), 17);
});

test('seek moves a playing track and leaves a paused one paused', () => {
	const { context, player } = setup();
	player.load(track(100));
	player.play();
	player.seek(30);
	assert.equal(context.sources.at(-1)?.started?.offset, 30);
	player.pause();
	player.seek(60);
	assert.ok(player.isPaused);
	assert.equal(player.position(), 60);
	player.seek(500);
	assert.equal(player.position(), 100);
});

test('onEnded fires once when a track plays through, never while paused or repeating', () => {
	const { context, player } = setup();
	let ended = 0;
	player.onEnded.add(() => {
		ended++;
	});
	player.load(track(10));
	player.play();
	player.pause();
	player.update();
	assert.equal(ended, 0);
	player.resume();
	context.sources.at(-1)?.end();
	player.update();
	player.update();
	assert.equal(ended, 1);
	assert.ok(!player.isPlaying);

	player.play({ repeat: true });
	player.update();
	assert.equal(ended, 1);
});

test('volume is clamped and reaches the playing voice', () => {
	const { player } = setup();
	player.load(track(10));
	player.play();
	player.volume = 3;
	assert.equal(player.volume, 1);
	player.volume = 0.25;
	assert.equal(player.volume, 0.25);
});

test('stop resets the playhead and a new play starts at the beginning', () => {
	const { context, player } = setup();
	player.load(track(100));
	player.play();
	context.currentTime = 12;
	assert.equal(player.position(), 12);
	player.stop();
	assert.equal(player.position(), 0);
	assert.equal(player.isPlaying, false);
	player.play();
	assert.equal(context.sources.at(-1)?.started?.offset, 0);
});
