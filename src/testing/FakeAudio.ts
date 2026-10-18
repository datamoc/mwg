import type { BlockSource } from '../audio/StreamChannel.ts';
import type { MidiSynth } from '../audio/MidiSynth.ts';

/**
 * A WebAudio double whose clock only moves when a test moves it. It records every buffer
 * source that was started and ends them as `advance()` passes their end time, which is exactly
 * the part of an `AudioContext` a streaming voice depends on (the clock, scheduled starts, the
 * `onended` of a source) and nothing else.
 *
 * @example
 * ```ts
 * import { StreamChannel } from '@datamoc/mwg/audio';
 * import { FakeAudioContext, FakeBlockSource } from '@datamoc/mwg/testing';
 *
 * const context = new FakeAudioContext();
 * const channel = new StreamChannel(context.asContext(), undefined, { pumpMs: 0 });
 * channel.play(new FakeBlockSource({ seconds: 1 }));
 * context.advance(2);
 * ```
 */
export class FakeAudioContext {
	currentTime = 0;
	readonly sampleRate: number;
	state: 'running' | 'suspended' = 'running';
	readonly destination = { connect(): void {} };
	/** every buffer source made, in order, with when it was asked to start */
	readonly sources: FakeBufferSource[] = [];
	resumes = 0;

	constructor(sampleRate = 8000) {
		this.sampleRate = sampleRate;
	}

	createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
		return new FakeBuffer(channels, length, sampleRate);
	}

	createBufferSource(): FakeBufferSource {
		const source = new FakeBufferSource();
		this.sources.push(source);
		return source;
	}

	createGain(): FakeGain {
		return new FakeGain();
	}

	createStereoPanner(): { pan: { value: number }; connect(): void } {
		return { pan: { value: 0 }, connect(): void {} };
	}

	resume(): Promise<void> {
		this.resumes++;
		this.state = 'running';
		return Promise.resolve();
	}

	/** moves the clock and ends every started source whose scheduled end has passed */
	advance(seconds: number): void {
		this.currentTime += seconds;
		for (const source of this.sources) {
			if (source.startedAt === null || source.ended || source.stopped) continue;
			if (source.startedAt + source.duration <= this.currentTime) {
				source.ended = true;
				source.onended?.();
			}
		}
	}

	/** the double typed as the context the code under test expects */
	asContext(): AudioContext {
		return this as unknown as AudioContext;
	}
}

export class FakeBuffer {
	readonly length: number;
	readonly numberOfChannels: number;
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

export class FakeBufferSource {
	buffer: FakeBuffer | null = null;
	loop = false;
	loopStart = 0;
	loopEnd = 0;
	readonly playbackRate = { value: 1 };
	onended: (() => void) | null = null;
	startedAt: number | null = null;
	/** the offset into the buffer the source was started at */
	offset = 0;
	/** when the source was told to stop, if it was */
	stoppedAt: number | null = null;
	stopped = false;
	ended = false;

	get duration(): number {
		return this.buffer?.duration ?? 0;
	}

	connect(): void {}

	start(when = 0, offset = 0): void {
		this.startedAt = when;
		this.offset = offset;
	}

	stop(when?: number): void {
		this.stopped = true;
		this.stoppedAt = when ?? null;
	}
}

/** a gain node that remembers every ramp it was given, so a test can read a fade without listening */
export class FakeGain {
	readonly ramps: { value: number; time: number }[] = [];
	readonly gain = {
		value: 1,
		setTargetAtTime: (value: number): void => {
			this.gain.value = value;
		},
		setValueAtTime: (value: number): void => {
			this.gain.value = value;
		},
		cancelScheduledValues: (): void => {
			this.ramps.length = 0;
		},
		linearRampToValueAtTime: (value: number, time: number): void => {
			this.ramps.push({ value, time });
		},
	};

	connect(): void {}
}

export interface FakeBlockSourceOptions {
	/** length in seconds; omit for a source with no end */
	seconds?: number;
	sampleRate?: number;
	/** value written to both channels at frame i is `ramp ? i / 1000 : level`; a ramp makes the frame position readable from the output */
	ramp?: boolean;
	level?: number;
}

/**
 * A deterministic `BlockSource`: a ramp whose value names its frame, or a flat level, of a known
 * length or none at all. It counts every read and seek so a test can see how the consumer pulled.
 */
export class FakeBlockSource implements BlockSource {
	readonly sampleRate: number;
	readonly length?: number;
	position = 0;
	reads = 0;
	seeks: number[] = [];
	private readonly ramp: boolean;
	private readonly level: number;

	constructor(options: FakeBlockSourceOptions = {}) {
		this.sampleRate = options.sampleRate ?? 8000;
		if (options.seconds !== undefined) this.length = Math.round(options.seconds * this.sampleRate);
		this.ramp = options.ramp ?? false;
		this.level = options.level ?? 0.5;
	}

	read(left: Float32Array, right: Float32Array, start: number, count: number): number {
		this.reads++;
		const available = this.length === undefined ? count : Math.max(0, Math.min(count, this.length - this.position));
		for (let i = 0; i < available; i++) {
			const value = this.ramp ? (this.position + i) / 1000 : this.level;
			left[start + i] = value;
			right[start + i] = value;
		}
		this.position += available;
		return available;
	}

	seek(frame: number): void {
		this.seeks.push(frame);
		this.position = frame;
	}
}

/**
 * A `MidiSynth` double for a retro engine: it records every message it was driven with and
 * renders a flat level while any note is on (silence otherwise), so a test can assert what a
 * renderer sent and read the shape of the output without a real synth or clock. Pair it with
 * `FakeAudioContext`, whose `advance()` is the audio clock a test moves by hand.
 *
 * @example
 * ```ts
 * import { FakeRetroPlayer } from '@datamoc/mwg/testing';
 *
 * const synth = new FakeRetroPlayer(8000);
 * synth.event(0x90, 60, 100); // note on, middle C
 * const left = new Float32Array(4);
 * synth.render(left, new Float32Array(4), 0, 4);
 * console.log(synth.notesOn, left[0] > 0); // 1, true
 * ```
 */
export class FakeRetroPlayer implements MidiSynth {
	readonly sampleRate: number;
	/** every channel message received, as `[status, data1, data2]` in order */
	readonly events: [number, number, number][] = [];
	/** every system-exclusive message received, as a copy */
	readonly sysexMessages: Uint8Array[] = [];
	resets = 0;
	renders = 0;
	private readonly sounding = new Map<number, number>();

	constructor(sampleRate = 8000) {
		this.sampleRate = sampleRate;
	}

	/** how many notes are currently on */
	get notesOn(): number {
		return this.sounding.size;
	}

	event(status: number, data1: number, data2: number): void {
		this.events.push([status, data1, data2]);
		const kind = status & 0xf0;
		const key = ((status & 0x0f) << 8) | data1;
		if (kind === 0x90 && data2 > 0) this.sounding.set(key, data2);
		else if (kind === 0x80 || kind === 0x90) this.sounding.delete(key);
	}

	sysex(bytes: Uint8Array): void {
		this.sysexMessages.push(new Uint8Array(bytes));
	}

	render(left: Float32Array, right: Float32Array, start: number, count: number): void {
		this.renders++;
		let level = 0;
		for (const velocity of this.sounding.values()) level = Math.max(level, velocity / 127);
		for (let i = 0; i < count; i++) {
			left[start + i] += level * 0.5;
			right[start + i] += level * 0.5;
		}
	}

	reset(): void {
		this.resets++;
		this.sounding.clear();
	}
}
