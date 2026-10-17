import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioBus } from '../src/audio/Channels.ts';
import { StreamChannel } from '../src/audio/StreamChannel.ts';
import { StreamPlayable } from '../src/audio/StreamPlayable.ts';
import { FakeAudioContext, FakeBlockSource } from '../src/testing/FakeAudio.ts';

/** a channel with the timer off, so the test is the only thing that pumps it */
function channelOn(context: FakeAudioContext, options = {}): StreamChannel {
	return new StreamChannel(context.asContext(), undefined, { pumpMs: 0, ...options });
}

function firstChunk(context: FakeAudioContext): { left: Float32Array; frames: number } {
	const buffer = context.sources[0].buffer!;
	return { left: buffer.getChannelData(0), frames: buffer.length };
}

test('play queues chunks up to the lookahead and no further', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context);
	channel.play(new FakeBlockSource({ level: 0.25 }));
	//0.5 s chunks starting at 0.02: starts at 0.02, 0.52, 1.02, 1.52 are inside a 2 s lookahead
	assert.equal(context.sources.length, 4);
	assert.deepEqual(
		context.sources.map((s) => s.startedAt),
		[0.02, 0.52, 1.02, 1.52].map((t) => expectClose(t)),
	);
	assert.equal(firstChunk(context).left[10], 0.25);
	assert.equal(channel.isPlaying, true);
});

/** deepEqual cannot take a tolerance, so round the floating start times instead */
function expectClose(value: number): number {
	return Math.round(value * 1000) / 1000;
}

test('pumping as the clock advances keeps the queue one lookahead ahead, with bounded memory for an endless source', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context);
	const source = new FakeBlockSource();
	channel.play(source);
	for (let i = 0; i < 400; i++) {
		context.advance(0.25);
		channel.pump();
	}
	//100 seconds played: about 200 chunks were made, but only the recent ones are still tracked
	assert.ok(context.sources.length >= 200);
	assert.ok((channel as unknown as { chunks: unknown[] }).chunks.length <= 8);
	assert.equal(channel.underrunCount, 0);
	assert.ok(Math.abs(channel.position() - 100 * 1) < 1, 'position tracks the clock');
});

test('the frames a chunk holds are the frames of the source, in order across chunks', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context, { chunkSeconds: 0.25 });
	channel.play(new FakeBlockSource({ ramp: true }));
	const first = context.sources[0].buffer!.getChannelData(0);
	const second = context.sources[1].buffer!.getChannelData(0);
	assert.equal(first[0], 0);
	assert.ok(Math.abs(first[1999] - 1.999) < 1e-6);
	assert.ok(Math.abs(second[0] - 2) < 1e-6);
});

test('a source at another sample rate is converted to the context rate', () => {
	const context = new FakeAudioContext(8000);
	const channel = channelOn(context, { chunkSeconds: 0.5 });
	channel.play(new FakeBlockSource({ sampleRate: 4000, ramp: true }));
	const { left, frames } = firstChunk(context);
	assert.equal(frames, 4000, 'half a second at the context rate');
	//source frame k appears at output frame 2k, midpoints are interpolated
	assert.ok(Math.abs(left[2] - 0.001) < 1e-6);
	assert.ok(Math.abs(left[3] - 0.0015) < 1e-6);
});

test('a playback ratio resamples: double speed halves the frames per second of source', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context, { chunkSeconds: 0.5 });
	channel.play(new FakeBlockSource({ ramp: true }), { pitch: 2 });
	const { left } = firstChunk(context);
	assert.ok(Math.abs(left[1] - 0.002) < 1e-6, 'every output frame advances two source frames');
	assert.throws(() => channel.update({ pitch: 0 }), /positive/);
});

test('a source that does not repeat ends once, after its last chunk has sounded', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context);
	let ended = 0;
	channel.onEnded.add(() => {
		ended++;
	});
	channel.play(new FakeBlockSource({ seconds: 1.2 }));
	assert.equal(ended, 0);
	context.advance(1);
	assert.equal(ended, 0);
	context.advance(0.5);
	assert.equal(ended, 1);
	assert.equal(channel.isPlaying, false);
	context.advance(5);
	assert.equal(ended, 1);
});

test('a source with a loop region wraps inside it and never ends', () => {
	const context = new FakeAudioContext();
	const source = new FakeBlockSource({ seconds: 1, ramp: true });
	const channel = channelOn(context);
	let ended = 0;
	channel.onEnded.add(() => {
		ended++;
	});
	channel.play(source, { repeat: true, loop: { start: 0.25, end: 0.75 } });
	for (let i = 0; i < 40; i++) {
		context.advance(0.25);
		channel.pump();
	}
	assert.equal(ended, 0);
	assert.ok(source.seeks.includes(2000), 'looped back to the loop start frame');
	const position = channel.position();
	assert.ok(position >= 0.25 && position <= 0.75, `position ${position} stays inside the loop`);
});

test('repeat without a region loops the whole of a source that has a length', () => {
	const context = new FakeAudioContext();
	const source = new FakeBlockSource({ seconds: 0.6 });
	const channel = channelOn(context);
	channel.play(source, { repeat: true });
	context.advance(3);
	channel.pump();
	assert.ok(source.seeks.filter((frame) => frame === 0).length >= 2);
	assert.equal(channel.isPlaying, true);
});

test('an endless source stops after endAfterSeconds, fading out over the end', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context, { lookaheadSeconds: 10 });
	let ended = 0;
	channel.onEnded.add(() => {
		ended++;
	});
	channel.play(new FakeBlockSource({ level: 1 }), { endAfterSeconds: 2, endFadeSeconds: 1 });
	const total = context.sources.reduce((frames, s) => frames + s.buffer!.length, 0);
	assert.equal(total, 3 * 8000, 'two seconds plus the one second fade');
	const last = context.sources.at(-1)!.buffer!.getChannelData(0);
	assert.ok(last[last.length - 1] < 0.001, 'silent at the very end');
	context.advance(4);
	assert.equal(ended, 1);
});

test('seek moves the playhead and asks the source for the frame', () => {
	const context = new FakeAudioContext();
	const source = new FakeBlockSource({ seconds: 10, ramp: true });
	const channel = channelOn(context);
	channel.play(source);
	channel.seek(4);
	assert.equal(source.seeks.at(-1), 32000);
	assert.ok(Math.abs(channel.position() - 4) < 0.05);
	assert.ok(Math.abs(context.sources.at(-1)!.buffer!.getChannelData(0)[0] - 0) >= 0, 'new chunks were queued');
});

test('stop remembers the playhead and a later seekless play starts there when asked', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context);
	channel.play(new FakeBlockSource({ seconds: 10 }));
	context.advance(1.02);
	channel.stop();
	assert.equal(channel.isPlaying, false);
	assert.ok(Math.abs(channel.position() - 1) < 0.05);
});

test('an underrun is reported with how late the queue was, once', () => {
	const context = new FakeAudioContext();
	const channel = channelOn(context, { lookaheadSeconds: 1 });
	const late: number[] = [];
	channel.onUnderrun.add((seconds) => {
		late.push(seconds);
	});
	channel.play(new FakeBlockSource());
	context.advance(5);
	channel.pump();
	assert.equal(channel.underrunCount, 1);
	assert.ok(late[0] > 3);
	channel.pump();
	assert.equal(channel.underrunCount, 1);
});

test('the timer pumps by itself and stops with the channel', () => {
	const context = new FakeAudioContext();
	const pending: (() => void)[] = [];
	const channel = new StreamChannel(context.asContext(), undefined, {
		pumpMs: 100,
		schedule: (callback) => pending.push(callback),
		unschedule: () => pending.pop(),
	});
	channel.play(new FakeBlockSource());
	assert.equal(pending.length, 1);
	const queued = context.sources.length;
	context.advance(1);
	pending.shift()!();
	assert.ok(context.sources.length > queued);
	channel.stop();
	assert.equal(pending.length, 0, 'the rescheduled timer was cancelled by stop');
});

test('StreamPlayable resumes a suspended context, plays, pauses and keeps its position', async () => {
	const context = new FakeAudioContext();
	context.state = 'suspended';
	const player = new StreamPlayable(context.asContext(), new FakeBlockSource({ seconds: 10 }), {
		channel: { pumpMs: 0 },
	});
	assert.equal(player.paused, true);
	await player.play();
	assert.equal(context.resumes, 1);
	assert.equal(player.paused, false);
	context.advance(1.52);
	assert.ok(Math.abs(player.currentTime - 1.5) < 0.05);
	player.pause();
	const held = player.currentTime;
	context.advance(3);
	assert.equal(player.currentTime, held);
	assert.equal(player.paused, true);
});

test('StreamPlayable.currentTime is settable while paused and while playing', async () => {
	const context = new FakeAudioContext();
	const source = new FakeBlockSource({ seconds: 10 });
	const player = new StreamPlayable(context.asContext(), source, { channel: { pumpMs: 0 } });
	player.currentTime = 3;
	assert.equal(player.currentTime, 3);
	await player.play();
	assert.equal(source.seeks.at(-1), 24000);
	player.currentTime = 6;
	assert.equal(source.seeks.at(-1), 48000);
});

test('StreamPlayable fires onended once for a track that ends and holds the duration afterwards', async () => {
	const context = new FakeAudioContext();
	const player = new StreamPlayable(context.asContext(), new FakeBlockSource({ seconds: 1 }), {
		channel: { pumpMs: 0 },
	});
	let ended = 0;
	player.onended = () => {
		ended++;
	};
	await player.play();
	context.advance(2);
	assert.equal(ended, 1);
	assert.equal(player.ended, true);
	assert.equal(player.currentTime, 1);
	assert.equal(player.duration, 1);
	await player.play();
	assert.equal(player.ended, false, 'playing again restarts it');
	assert.equal(player.currentTime < 0.1, true);
});

test('StreamPlayable never fires onended while it loops, and an endless source reports Infinity', async () => {
	const context = new FakeAudioContext();
	const player = new StreamPlayable(context.asContext(), new FakeBlockSource({ seconds: 0.5 }), {
		channel: { pumpMs: 0 },
	});
	player.loop = true;
	let ended = 0;
	player.onended = () => {
		ended++;
	};
	await player.play();
	context.advance(4);
	player.channel.pump();
	assert.equal(ended, 0);
	assert.equal(new StreamPlayable(context.asContext(), new FakeBlockSource()).duration, Infinity);
});

test('StreamPlayable clamps volume, ignores a nonpositive rate and applies a valid one', () => {
	const context = new FakeAudioContext();
	const player = new StreamPlayable(context.asContext(), new FakeBlockSource({ seconds: 1 }), {
		channel: { pumpMs: 0 },
	});
	player.volume = 4;
	assert.equal(player.volume, 1);
	player.volume = -1;
	assert.equal(player.volume, 0);
	player.playbackRate = 0;
	assert.equal(player.playbackRate, 1);
	player.playbackRate = 1.5;
	assert.equal(player.playbackRate, 1.5);
});

test('the bus plays a streamed BGM through a StreamChannel and reports its playhead', async () => {
	const context = new FakeAudioContext();
	const source = new FakeBlockSource({ seconds: 20 });
	const bus = new AudioBus(context.asContext(), {
		load: () => Promise.resolve(null),
		stream: (_kind, name) => Promise.resolve(name === 'chip' ? { source } : null),
	});
	await bus.playBgm({ name: 'chip', volume: 80 });
	const stream = bus.streamChannel('bgm');
	assert.equal(stream.isPlaying, true);
	context.advance(2.02);
	const track = bus.currentTrack('bgm');
	assert.ok(track && Math.abs(track.pos - 2) < 0.1);
	bus.stopBgm();
	assert.equal(stream.isPlaying, false);
	assert.equal(bus.currentTrack('bgm'), null);
});

test('a stream loader that answers null lets the buffer loader play instead', async () => {
	const context = new FakeAudioContext();
	const buffer = context.createBuffer(2, 80000, 8000);
	const bus = new AudioBus(context.asContext(), {
		load: () => Promise.resolve({ buffer: buffer as unknown as AudioBuffer }),
		stream: () => Promise.resolve(null),
	});
	await bus.playBgm({ name: 'plain' });
	assert.equal(bus.streamChannel('bgm').isPlaying, false);
	assert.equal(context.sources.length, 1);
});

test('a replaced request aborts the loader and only the current request reports progress', async () => {
	const context = new FakeAudioContext();
	const signals: AbortSignal[] = [];
	const release: (() => void)[] = [];
	const bus = new AudioBus(context.asContext(), {
		load: (_kind, _name, loadContext) => {
			signals.push(loadContext!.signal);
			loadContext!.progress(0.25);
			return new Promise((resolve) => {
				release.push(() => {
					loadContext!.progress(1);
					resolve(null);
				});
			});
		},
	});
	const seen: string[] = [];
	bus.onLoadProgress.add((p) => {
		seen.push(`${p.name}:${p.fraction}`);
	});
	const first = bus.playBgm({ name: 'one' });
	const second = bus.playBgm({ name: 'two' });
	assert.equal(signals[0].aborted, true);
	assert.equal(signals[1].aborted, false);
	release.forEach((fn) => fn());
	await Promise.all([first, second]);
	assert.deepEqual(seen, ['one:0.25', 'two:0.25', 'two:1']);
});
