/**
 * Small WebAudio building blocks a game can put on a `Channel` or an `AudioBus`:
 * a biquad filter, an algorithmic reverb (no sample file), a chorus and a distortion.
 * Each one is a plain node or a small `EffectUnit` holding an input, an output and a
 * way to dispose, so a caller never needs to know the graph recipe behind it.
 *
 * @example
 * ```ts
 * import { createFilter, createReverb } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 *
 * const filter = createFilter(context, { type: 'lowpass', frequency: 800, q: 0.7 });
 * const reverb = createReverb(context, { seconds: 1.5, decay: 3 });
 * console.log(filter.type, reverb.buffer?.duration);
 * ```
 */

/** one biquad setting: the type, its cutoff or center frequency, and its optional shape */
export interface FilterSpec {
	type: 'lowpass' | 'highpass' | 'bandpass' | 'lowshelf' | 'highshelf' | 'peaking' | 'notch' | 'allpass';
	/** Hz: cutoff for low/high-pass, center for the rest */
	frequency: number;
	/** resonance; the filter's own default when omitted */
	q?: number;
	/** dB of boost or cut, for the shelf and peaking types */
	gain?: number;
}

/**
 * Creates a biquad filter from a spec, ready to connect into a chain.
 *
 * @example
 * ```ts
 * import { createFilter } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 *
 * const lowpass = createFilter(context, { type: 'lowpass', frequency: 1200, q: 1.2 });
 * lowpass.connect(context.destination);
 * ```
 */
export function createFilter(context: AudioContext, spec: FilterSpec): BiquadFilterNode {
	const node = context.createBiquadFilter();
	applyFilter(node, spec);
	return node;
}

/**
 * Applies (or updates in place) a filter spec on an existing biquad, so a live voice can
 * be retuned without rebuilding the graph. `null` bypasses the node by resetting it to a
 * neutral `'allpass'` at 22000 Hz with a Q of 0.0001, which passes its input unchanged.
 *
 * @example
 * ```ts
 * import { applyFilter, createFilter } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 *
 * const filter = createFilter(context, { type: 'lowpass', frequency: 400 });
 * applyFilter(filter, { type: 'highpass', frequency: 200 });
 * applyFilter(filter, null); // neutral pass-through
 * ```
 */
export function applyFilter(node: BiquadFilterNode, spec: FilterSpec | null): void {
	if (!spec) {
		node.type = 'allpass';
		node.frequency.value = 22000;
		node.Q.value = 0.0001;
		node.gain.value = 0;
		return;
	}
	node.type = spec.type;
	node.frequency.value = spec.frequency;
	if (spec.q !== undefined) node.Q.value = spec.q;
	if (spec.gain !== undefined) node.gain.value = spec.gain;
}

export interface ReverbOptions {
	/** length of the impulse in seconds; 2 when omitted */
	seconds?: number;
	/** how sharply the tail dies away; 2 when omitted */
	decay?: number;
	/** seconds of silence ahead of the tail; 0 when omitted */
	preDelay?: number;
	/** plays the tail backwards; false when omitted */
	reverse?: boolean;
}

/**
 * Builds a convolver with an algorithmic stereo impulse, so a game gets a reverb
 * without shipping an impulse sample. The noise comes from a seeded generator, so the
 * same options always produce the same tail on every run.
 *
 * @example
 * ```ts
 * import { createReverb } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const source: AudioNode;
 *
 * const reverb = createReverb(context, { seconds: 3, decay: 2, preDelay: 0.02 });
 * source.connect(reverb);
 * reverb.connect(context.destination);
 * ```
 */
export function createReverb(context: AudioContext, options: ReverbOptions = {}): ConvolverNode {
	const seconds = Math.max(0, options.seconds ?? 2);
	const decay = Math.max(0, options.decay ?? 2);
	const preDelay = Math.max(0, options.preDelay ?? 0);
	const reverse = options.reverse ?? false;
	const sampleRate = context.sampleRate;
	const preFrames = Math.round(preDelay * sampleRate);
	const tailFrames = Math.max(1, Math.round(seconds * sampleRate));
	const frames = Math.max(1, preFrames + tailFrames);
	const buffer = context.createBuffer(2, frames, sampleRate);

	//a local LCG: deterministic, and it never touches the global random source
	let seed = 0x2545f491;
	const noise = (): number => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return (seed / 0xffffffff) * 2 - 1;
	};

	for (let channel = 0; channel < 2; channel++) {
		const data = buffer.getChannelData(channel);
		for (let i = 0; i < tailFrames; i++) {
			const at = preFrames + (reverse ? tailFrames - 1 - i : i);
			if (at >= frames) continue;
			const progress = tailFrames <= 1 ? 0 : i / (tailFrames - 1);
			data[at] = noise() * Math.pow(1 - progress, decay);
		}
	}

	const convolver = context.createConvolver();
	convolver.buffer = buffer;
	return convolver;
}

/**
 * A node pair a caller can place in a chain: what goes in, what comes out, and how to let go.
 *
 * @example
 * ```ts
 * import { createChorus, type EffectUnit } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 *
 * const unit: EffectUnit = createChorus(context);
 * unit.dispose();
 * ```
 */
export interface EffectUnit {
	readonly input: AudioNode;
	readonly output: AudioNode;
	dispose(): void;
}

export interface ChorusOptions {
	/** LFO frequency in Hz; 1.5 when omitted */
	rate?: number;
	/** modulation depth in seconds around the base delay; 0.002 when omitted */
	depth?: number;
	/** base delay in seconds; 0.03 when omitted */
	delay?: number;
}

/**
 * A chorus: a short delay whose time is swept by a low-frequency oscillator, so the copy
 * drifts in and out of tune with the dry signal feeding it. The oscillator starts at once;
 * `dispose()` stops it and unwires the unit.
 *
 * @example
 * ```ts
 * import { createChorus } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const source: AudioNode;
 *
 * const chorus = createChorus(context, { rate: 0.8, depth: 0.003, delay: 0.02 });
 * source.connect(chorus.input);
 * chorus.output.connect(context.destination);
 * chorus.dispose();
 * ```
 */
export function createChorus(context: AudioContext, options: ChorusOptions = {}): EffectUnit {
	const rate = Math.max(0, options.rate ?? 1.5);
	const depth = Math.max(0, options.depth ?? 0.002);
	const delaySeconds = Math.max(0, options.delay ?? 0.03);

	const delay = context.createDelay(1);
	delay.delayTime.value = delaySeconds;
	const output = context.createGain();
	delay.connect(output);

	const lfo = context.createOscillator();
	lfo.frequency.value = rate;
	const lfoDepth = context.createGain();
	lfoDepth.gain.value = depth;
	lfo.connect(lfoDepth);
	lfoDepth.connect(delay.delayTime);
	lfo.start();

	let disposed = false;
	return {
		input: delay,
		output,
		dispose(): void {
			if (disposed) return;
			disposed = true;
			try {
				lfo.stop();
			} catch {
				//already stopped
			}
			disconnectNode(lfo);
			disconnectNode(lfoDepth);
			disconnectNode(delay);
			disconnectNode(output);
		},
	};
}

export interface DistortionOptions {
	/** how hard the curve drives the signal, 0 to 100; 50 when omitted */
	amount?: number;
	/** the wave shaper's own oversampling mode; `'4x'` when omitted */
	oversample?: OverSampleType;
}

/**
 * A distortion: a tanh-shaped wave-shaper curve, which soft-clips a signal instead of
 * cutting it off at full scale. `amount` runs from 0 (nearly clean) to 100 (heavily driven).
 *
 * @example
 * ```ts
 * import { createDistortion } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const source: AudioNode;
 *
 * const drive = createDistortion(context, { amount: 70 });
 * source.connect(drive);
 * drive.connect(context.destination);
 * ```
 */
export function createDistortion(context: AudioContext, options: DistortionOptions = {}): WaveShaperNode {
	const amount = Math.min(100, Math.max(0, options.amount ?? 50));
	const drive = 1 + (amount / 100) * 9;
	const samples = 44100;
	const curve = new Float32Array(samples);
	for (let i = 0; i < samples; i++) {
		const x = (i / (samples - 1)) * 2 - 1;
		curve[i] = Math.tanh(drive * x);
	}
	const shaper = context.createWaveShaper();
	shaper.curve = curve;
	shaper.oversample = options.oversample ?? '4x';
	return shaper;
}

/** disconnects a node from everything it fed, tolerating fakes and already-cut edges */
function disconnectNode(node: AudioNode): void {
	const target = node as unknown as { disconnect?: (...args: unknown[]) => void };
	if (typeof target.disconnect !== 'function') return;
	try {
		target.disconnect();
	} catch {
		//already disconnected
	}
}
