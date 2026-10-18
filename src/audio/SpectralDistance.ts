import { fft } from './Fft.ts';
import { resampleStereo, type StereoFrames } from './Resample.ts';

export interface SpectralDistanceOptions {
	/** analysis window in frames, a power of two; 2048 when omitted */
	windowSize?: number;
	/** frames between windows; half the window when omitted */
	hop?: number;
	/** bins quieter than this many dB below the loudest are ignored as noise floor; 80 when omitted */
	floorDb?: number;
}

export interface SpectralDistanceResult {
	/** mean absolute difference of the log spectra in decibels: 0 for identical audio, a few dB for the same timbre played slightly differently */
	decibels: number;
	/** windows compared */
	windows: number;
}

/** the Hann-windowed magnitude spectrum, in dB, of one mono window starting at `start` (zero padded past the end) */
function logSpectrum(samples: Float32Array, start: number, size: number): Float64Array {
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	for (let i = 0; i < size; i++) {
		const sample = start + i < samples.length ? samples[start + i] : 0;
		re[i] = sample * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
	}
	fft(re, im);
	const bins = new Float64Array(size / 2);
	for (let k = 0; k < bins.length; k++) bins[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) + 1e-12);
	return bins;
}

/**
 * How far apart two renders sound, as the mean absolute difference of their log spectra: the
 * number to watch when one synthesis engine is tuned toward another's reference, or when a change
 * must not alter a render. Both are folded to mono and brought to the first one's sample rate; the
 * shorter is padded with silence. Bins more than `floorDb` below the loudest of the pair do not
 * count, so inaudible noise cannot dominate the figure.
 *
 * @example
 * ```ts
 * import { spectralDistance } from '@datamoc/mwg/audio';
 *
 * declare const reference: { sampleRate: number; left: Float32Array; right: Float32Array };
 * declare const candidate: { sampleRate: number; left: Float32Array; right: Float32Array };
 *
 * console.log(spectralDistance(reference, candidate).decibels);
 * ```
 */
export function spectralDistance(
	a: StereoFrames,
	b: StereoFrames,
	options: SpectralDistanceOptions = {},
): SpectralDistanceResult {
	const size = options.windowSize ?? 2048;
	if (size < 4 || (size & (size - 1)) !== 0) throw new Error('window size must be a power of two of at least 4');
	const hop = Math.max(1, Math.floor(options.hop ?? size / 2));
	const floor = options.floorDb ?? 80;
	const matched = resampleStereo(b, a.sampleRate);
	const mono = (frames: StereoFrames): Float32Array => frames.left.map((value, i) => (value + frames.right[i]) / 2);
	const first = mono(a);
	const second = mono(matched);
	const length = Math.max(first.length, second.length);
	let total = 0;
	let counted = 0;
	let windows = 0;
	for (let start = 0; start === 0 || start + size / 2 < length; start += hop) {
		const x = logSpectrum(first, start, size);
		const y = logSpectrum(second, start, size);
		let peak = -Infinity;
		for (let k = 0; k < x.length; k++) peak = Math.max(peak, x[k], y[k]);
		for (let k = 0; k < x.length; k++) {
			if (Math.max(x[k], y[k]) < peak - floor) continue;
			total += Math.abs(x[k] - y[k]);
			counted++;
		}
		windows++;
	}
	return { decibels: counted === 0 ? 0 : total / counted, windows };
}
