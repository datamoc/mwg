import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioBus, Channel } from '../src/audio/Channels.ts';
import type { BusLoader } from '../src/audio/Channels.ts';
import { applyFilter, createChorus, createDistortion, createReverb } from '../src/audio/effects.ts';

//A hand-driven WebAudio double with the effect nodes this feature touches, each node
//remembering what it feeds so a test can read the wired chain rather than a snapshot.
class FakeParam {
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

class FakeNode {
	readonly gain = new FakeParam();
	readonly pan = new FakeParam();
	readonly playbackRate = new FakeParam();
	readonly frequency = new FakeParam();
	readonly Q = new FakeParam();
	readonly delayTime = new FakeParam();
	buffer: {
		duration: number;
		length: number;
		numberOfChannels: number;
		getChannelData(channel: number): Float32Array;
	} | null = null;
	loop = false;
	loopStart = 0;
	loopEnd = 0;
	type = 'lowpass';
	curve: Float32Array | null = null;
	oversample = 'none';
	onended: (() => void) | null = null;
	started: number | null = null;
	stops = 0;
	readonly connections: unknown[] = [];

	connect(target: unknown): void {
		if (!this.connections.includes(target)) this.connections.push(target);
	}

	disconnect(target?: unknown): void {
		if (target === undefined) {
			this.connections.length = 0;
			return;
		}
		const at = this.connections.indexOf(target);
		if (at !== -1) this.connections.splice(at, 1);
	}

	start(when = 0): void {
		this.started = when;
	}

	stop(): void {
		this.stops++;
	}
}

class FakeBufferNode {
	readonly numberOfChannels: number;
	readonly length: number;
	readonly sampleRate: number;
	private readonly data: Float32Array[];

	constructor(channels: number, length: number, sampleRate: number) {
		this.numberOfChannels = channels;
		this.length = length;
		this.sampleRate = sampleRate;
		this.data = Array.from({ length: channels }, () => new Float32Array(length));
	}

	get duration(): number {
		return this.length / this.sampleRate;
	}

	getChannelData(channel: number): Float32Array {
		return this.data[channel];
	}
}

class FakeContext {
	currentTime = 0;
	readonly sampleRate = 8000;
	readonly destination = new FakeNode();
	readonly sources: FakeNode[] = [];
	readonly gains: FakeNode[] = [];
	readonly panners: FakeNode[] = [];
	readonly biquads: FakeNode[] = [];
	readonly delays: FakeNode[] = [];
	readonly oscillators: FakeNode[] = [];
	readonly convolvers: FakeNode[] = [];
	readonly shapers: FakeNode[] = [];

	createBufferSource(): FakeNode {
		const node = new FakeNode();
		this.sources.push(node);
		return node;
	}

	createGain(): FakeNode {
		const node = new FakeNode();
		this.gains.push(node);
		return node;
	}

	createStereoPanner(): FakeNode {
		const node = new FakeNode();
		this.panners.push(node);
		return node;
	}

	createBiquadFilter(): FakeNode {
		const node = new FakeNode();
		this.biquads.push(node);
		return node;
	}

	createDelay(): FakeNode {
		const node = new FakeNode();
		this.delays.push(node);
		return node;
	}

	createOscillator(): FakeNode {
		const node = new FakeNode();
		this.oscillators.push(node);
		return node;
	}

	createConvolver(): FakeNode {
		const node = new FakeNode();
		this.convolvers.push(node);
		return node;
	}

	createWaveShaper(): FakeNode {
		const node = new FakeNode();
		this.shapers.push(node);
		return node;
	}

	createBuffer(channels: number, length: number, sampleRate: number): FakeBufferNode {
		return new FakeBufferNode(channels, length, sampleRate);
	}
}

function fakeBuffer(duration: number): AudioBuffer {
	return { duration } as unknown as AudioBuffer;
}

/** the nodes a node feeds, in order, down to the destination */
function chainFrom(node: FakeNode): FakeNode[] {
	const path: FakeNode[] = [];
	const seen = new Set<FakeNode>();
	let current = node;
	while (current.connections.length > 0) {
		const next = current.connections[0] as FakeNode;
		if (seen.has(next)) break;
		seen.add(next);
		path.push(next);
		current = next;
	}
	return path;
}

function insertNode(): FakeNode {
	return new FakeNode();
}

// -------------------------------------------------------------------- Channel

test('setFilter creates the biquad once and updates it in place on later calls', () => {
	const context = new FakeContext();
	const channel = new Channel(context as unknown as AudioContext);
	channel.play(fakeBuffer(10), { pitch: 1 });

	channel.setFilter({ type: 'lowpass', frequency: 800, q: 0.7 });
	assert.equal(context.biquads.length, 1);
	const filter = context.biquads[0];
	assert.equal(filter.type, 'lowpass');
	assert.equal(filter.frequency.value, 800);
	assert.equal(filter.Q.value, 0.7);

	channel.setFilter({ type: 'highpass', frequency: 200 });
	assert.equal(context.biquads.length, 1, 'the same node is retuned, not replaced');
	assert.equal(filter.type, 'highpass');
	assert.equal(filter.frequency.value, 200);
	assert.equal(context.sources.length, 1, 'the source is not restarted');

	channel.update({ pitch: 1.5 });
	assert.equal(context.sources[0].playbackRate.value, 1.5, 'update still retunes through the filter');
	assert.deepEqual(channel.filter(), { type: 'highpass', frequency: 200 });
});

test('a null filter bypasses the existing biquad without throwing', () => {
	const context = new FakeContext();
	const channel = new Channel(context as unknown as AudioContext);
	channel.play(fakeBuffer(10));
	channel.setFilter({ type: 'bandpass', frequency: 1500 });

	assert.doesNotThrow(() => channel.setFilter(null));
	assert.equal(context.biquads.length, 1);
	assert.equal(context.biquads[0].type, 'allpass');
	assert.equal(context.biquads[0].frequency.value, 22000);
	assert.equal(context.biquads[0].Q.value, 0.0001);
	assert.equal(channel.filter(), null);
	assert.equal(context.sources.length, 1);
});

test('inserts land after the panner in insertion order, with the filter first', () => {
	const context = new FakeContext();
	const channel = new Channel(context as unknown as AudioContext);
	const first = insertNode();
	const second = insertNode();
	channel.play(fakeBuffer(10));
	channel.setFilter({ type: 'lowpass', frequency: 500 });

	channel.insert(first as unknown as AudioNode);
	channel.insert(second as unknown as AudioNode);

	const panner = context.panners[0];
	assert.deepEqual(chainFrom(panner), [context.biquads[0], first, second, context.destination]);
	assert.equal(context.sources.length, 1, 'inserting does not restart the voice');
});

test('an insert made before play is wired in, and removing it reconnects the destination', () => {
	const context = new FakeContext();
	const channel = new Channel(context as unknown as AudioContext);
	const insert = insertNode();
	channel.insert(insert as unknown as AudioNode);
	channel.play(fakeBuffer(10));

	const panner = context.panners[0];
	assert.deepEqual(chainFrom(panner), [insert, context.destination]);

	channel.removeInsert(insert as unknown as AudioNode);
	assert.deepEqual(chainFrom(panner), [context.destination]);
	assert.deepEqual(insert.connections, [], 'the removed insert feeds nothing');
	assert.equal(context.sources.length, 1);
});

test('inserts and the filter survive a play restart', () => {
	const context = new FakeContext();
	const channel = new Channel(context as unknown as AudioContext);
	const insert = insertNode();
	channel.setFilter({ type: 'lowpass', frequency: 900 });
	channel.insert(insert as unknown as AudioNode);
	channel.play(fakeBuffer(10));
	channel.play(fakeBuffer(10), { pos: 1 });

	assert.equal(context.biquads.length, 1);
	const secondPanner = context.panners[1];
	assert.deepEqual(chainFrom(secondPanner), [context.biquads[0], insert, context.destination]);
	assert.equal(context.sources[1].loopStart, 0);
});

test('clearInserts leaves the filter in the chain', () => {
	const context = new FakeContext();
	const channel = new Channel(context as unknown as AudioContext);
	const insert = insertNode();
	channel.play(fakeBuffer(10));
	channel.setFilter({ type: 'lowshelf', frequency: 300, gain: 4 });
	channel.insert(insert as unknown as AudioNode);

	channel.clearInserts();
	assert.deepEqual(chainFrom(context.panners[0]), [context.biquads[0], context.destination]);
});

// ---------------------------------------------------------------------- AudioBus

test('a bus filter sits between a kind gain and the destination and reports its spec', async () => {
	const context = new FakeContext();
	const load: BusLoader = async () => ({ buffer: fakeBuffer(1), loop: null });
	const bus = new AudioBus(context as unknown as AudioContext, { load });
	bus.setFilter('se', { type: 'lowpass', frequency: 600, q: 1 });

	assert.deepEqual(bus.filter('se'), { type: 'lowpass', frequency: 600, q: 1 });
	assert.equal(bus.filter('bgm'), null);
	assert.equal(context.biquads.length, 1);

	//the four kind gains are built first, in bgm/bgs/me/se order
	const seGain = context.gains[3];
	assert.deepEqual(chainFrom(seGain), [context.biquads[0], context.destination]);

	await bus.playSe({ name: 'hit' });
	assert.equal(context.sources.length, 1);
	assert.equal(context.sources[0].connections[0], context.gains[4], 'the voice has its own gain');
	assert.deepEqual(
		chainFrom(context.panners[0]),
		[seGain, context.biquads[0], context.destination],
		'and feeds the kind gain, then its filter',
	);
});

test('a bus filter updates in place and null bypasses it', () => {
	const context = new FakeContext();
	const bus = new AudioBus(context as unknown as AudioContext, { load: async () => null });
	bus.setFilter('bgm', { type: 'highpass', frequency: 100 });
	bus.setFilter('bgm', { type: 'bandpass', frequency: 400 });

	assert.equal(context.biquads.length, 1, 'one biquad per kind, retuned');
	assert.equal(context.biquads[0].type, 'bandpass');

	bus.setFilter('bgm', null);
	assert.equal(context.biquads[0].type, 'allpass');
	assert.equal(bus.filter('bgm'), null);
	assert.deepEqual(chainFrom(context.gains[0]), [context.biquads[0], context.destination]);
});

// -------------------------------------------------------------------- helpers

test('createDistortion builds a tanh curve with the requested oversampling', () => {
	const context = new FakeContext();
	const shaper = createDistortion(context as unknown as AudioContext, { amount: 75, oversample: '2x' });

	assert.equal(context.shapers.length, 1);
	assert.equal(shaper, context.shapers[0] as unknown as WaveShaperNode);
	assert.equal(context.shapers[0].oversample, '2x');
	const curve = context.shapers[0].curve!;
	assert.ok(curve.length > 1000);
	const middle = Math.floor(curve.length / 2);
	assert.ok(curve[0] < 0 && curve[curve.length - 1] > 0, 'the curve is monotonic in sign');
	assert.ok(Math.abs(curve[middle]) < 1e-3, 'the middle of the curve is near silence');
	assert.ok(Math.abs(curve[curve.length - 1]) < 1.0001, 'tanh saturates at full scale');
});

test('createChorus wires a delay, an LFO into its delay time, and an output gain', () => {
	const context = new FakeContext();
	const chorus = createChorus(context as unknown as AudioContext, { rate: 2, depth: 0.004, delay: 0.02 });

	assert.equal(context.delays.length, 1);
	assert.equal(context.oscillators.length, 1);
	assert.equal(context.gains.length, 2);
	const [delay] = context.delays;
	const [lfo] = context.oscillators;
	const [output, lfoDepth] = context.gains;
	assert.equal(chorus.input, delay as unknown as AudioNode);
	assert.equal(chorus.output, output as unknown as AudioNode);
	assert.equal(delay.delayTime.value, 0.02);
	assert.equal(lfo.frequency.value, 2);
	assert.equal(lfoDepth.gain.value, 0.004);
	assert.equal(lfo.started, 0, 'the oscillator starts at once');
	assert.deepEqual(lfo.connections, [lfoDepth]);
	assert.deepEqual(lfoDepth.connections, [delay.delayTime]);

	chorus.dispose();
	assert.equal(lfo.stops, 1);
	chorus.dispose();
	assert.equal(lfo.stops, 1, 'dispose is idempotent');
});

test('createReverb builds a deterministic stereo impulse with the requested length and pre-delay', () => {
	const context = new FakeContext();
	const convolver = createReverb(context as unknown as AudioContext, { seconds: 0.5, decay: 2, preDelay: 0.01 });

	assert.equal(context.convolvers.length, 1);
	assert.equal(convolver, context.convolvers[0] as unknown as ConvolverNode);
	const buffer = context.convolvers[0].buffer!;
	assert.equal(buffer.numberOfChannels, 2);
	assert.equal(buffer.length, 4080, '0.5 s of tail after 0.01 s of silence at 8000 Hz');

	const left = buffer.getChannelData(0);
	const right = buffer.getChannelData(1);
	assert.equal(left[0], 0, 'the pre-delay is silent');
	assert.equal(left[79], 0);
	assert.notEqual(left[80], 0, 'the tail starts after the pre-delay');
	assert.ok(
		right.some((value) => value !== 0),
		'both channels carry noise',
	);
	assert.ok(Math.abs(left[80]) > Math.abs(left[buffer.length - 1]), 'the envelope decays');

	createReverb(context as unknown as AudioContext, { seconds: 0.5, decay: 2, preDelay: 0.01 });
	const repeat = context.convolvers[1].buffer!.getChannelData(0);
	assert.deepEqual(Array.from(repeat), Array.from(left), 'the same options reproduce the same tail');
	assert.ok(Array.from(right).some((value) => value !== left[0]));
});

test('applyFilter resets a node to the neutral bypass', () => {
	const context = new FakeContext();
	const channel = new Channel(context as unknown as AudioContext);
	channel.play(fakeBuffer(10));
	channel.setFilter({ type: 'peaking', frequency: 1000, q: 2, gain: 6 });
	applyFilter(context.biquads[0] as unknown as BiquadFilterNode, null);

	assert.equal(context.biquads[0].type, 'allpass');
	assert.equal(context.biquads[0].frequency.value, 22000);
	assert.equal(context.biquads[0].Q.value, 0.0001);
	assert.equal(context.biquads[0].gain.value, 0);
});
