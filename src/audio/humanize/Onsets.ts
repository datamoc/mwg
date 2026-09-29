/**
 * Onset detection, for the audio path of `GrooveExtractor`: when a groove has to come
 * from a recording rather than from a pair of MIDI files, something has to find the hits
 * first. Spectral flux over a short sliding window is the usual measure (what aubio and
 * Essentia reach for), and it is cheap enough to hand-roll: a radix-2 FFT, the rise in
 * magnitude bin by bin, then a local threshold with a minimum gap so one attack is not
 * reported again by its own decay.
 *
 * The timings are what a groove lives or dies on, so the frame geometry is worth stating.
 * Frames are padded by half a window either side, which is what lets a hit at sample 0 be
 * measured with the window's full weight instead of its zeroed edge. A Hann window makes
 * flux peak a quarter of a window plus half a hop after the hit it is reacting to; the
 * detector subtracts that constant, leaving only the half-hop of frame quantization.
 *
 * Flux alone is not enough to call something an onset, which is what `ENERGY_RISE` below
 * is for: everything else in this file is about locating a hit, that gate is about
 * refusing to find one where there is none.
 */

const FRAME = 256;
const HOP = 64;
/** frames either side of a peak that make up its local mean and spread */
const NEIGHBOURHOOD = 10;
/**
 * How far above its neighbourhood a peak has to sit. Two is the balance point: an attack
 * lands well above it however loud the rest of the file is, while three lets the
 * neighbourhood of a sparse attack (mostly zeros) put the peak back within reach.
 */
const FLUX_SIGMAS = 2;
/**
 * An onset has to multiply its frame's energy by this much. This is what tells a hit apart
 * from a sustained note: flux alone reports the beating of a steady tone as a train of
 * onsets, because the tone's energy sloshes between bins while its own envelope is flat. A
 * real onset multiplies the frame's energy many times over; a steady tone moves it by a
 * couple of per cent. The previous frame may carry the rise, since flux compares against
 * the frame it came from and so trails the energy by up to one frame.
 */
const ENERGY_RISE = 0.05;
/** minimum gap between two onsets, in frames: one attack, not its own ringing */
const MIN_GAP_FRAMES = 4;
/** where a Hann window's derivative puts the flux peak behind the hit: FRAME/4 + HOP/2 */
const FLUX_PEAK_DELAY = FRAME / 4 + HOP / 2;

/** in-place iterative radix-2 FFT; `real` and `imaginary` must be a power of two long */
function fft(real: Float64Array, imaginary: Float64Array): void {
	const length = real.length;

	let j = 0;
	for (let i = 1; i < length; i++) {
		let bit = length >> 1;
		while (j & bit) {
			j ^= bit;
			bit >>= 1;
		}
		j ^= bit;
		if (i < j) {
			let swap = real[i];
			real[i] = real[j];
			real[j] = swap;
			swap = imaginary[i];
			imaginary[i] = imaginary[j];
			imaginary[j] = swap;
		}
	}

	for (let size = 2; size <= length; size <<= 1) {
		const angle = (-2 * Math.PI) / size;
		const stepReal = Math.cos(angle);
		const stepImaginary = Math.sin(angle);
		const half = size >> 1;
		for (let start = 0; start < length; start += size) {
			let weightReal = 1;
			let weightImaginary = 0;
			for (let k = 0; k < half; k++) {
				const even = start + k;
				const odd = even + half;
				const oddReal = real[odd] * weightReal - imaginary[odd] * weightImaginary;
				const oddImaginary = real[odd] * weightImaginary + imaginary[odd] * weightReal;
				real[odd] = real[even] - oddReal;
				imaginary[odd] = imaginary[even] - oddImaginary;
				real[even] += oddReal;
				imaginary[even] += oddImaginary;

				const nextReal = weightReal * stepReal - weightImaginary * stepImaginary;
				weightImaginary = weightReal * stepImaginary + weightImaginary * stepReal;
				weightReal = nextReal;
			}
		}
	}
}

/**
 * When each onset in a mono signal happens, in seconds from its start.
 *
 * Returns an empty array rather than throwing when there is nothing to find; the caller
 * decides whether silence is a valid extraction result (it is not, and it says so).
 */
export function detectOnsets(samples: Float32Array, sampleRate: number): number[] {
	if (samples.length === 0 || sampleRate <= 0) return [];

	const pad = FRAME / 2;
	const padded = new Float32Array(samples.length + pad * 2);
	padded.set(samples, pad);

	const window = new Float64Array(FRAME);
	for (let i = 0; i < FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

	const real = new Float64Array(FRAME);
	const imaginary = new Float64Array(FRAME);
	const previous = new Float64Array(FRAME / 2);
	const flux: number[] = [];
	const energyRise: number[] = [];
	let previousEnergy = 0;

	for (let start = 0; start + FRAME <= padded.length; start += HOP) {
		let energy = 0;
		for (let i = 0; i < FRAME; i++) {
			real[i] = padded[start + i] * window[i];
			imaginary[i] = 0;
			energy += real[i] * real[i];
		}
		//nothing against nothing is no change, but a frame that finally carries signal is
		//an unbounded one, which is what the first frame of any file is
		energyRise.push(previousEnergy === 0 ? (energy === 0 ? 0 : Infinity) : energy / previousEnergy - 1);
		previousEnergy = energy;

		fft(real, imaginary);

		let rise = 0;
		for (let k = 0; k < FRAME / 2; k++) {
			const magnitude = Math.hypot(real[k], imaginary[k]);
			const difference = magnitude - previous[k];
			if (difference > 0) rise += difference;
			previous[k] = magnitude;
		}
		flux.push(rise);
	}

	const onsets: number[] = [];
	let lastFrame = -Infinity;
	for (let i = 0; i < flux.length; i++) {
		const from = Math.max(0, i - NEIGHBOURHOOD);
		const to = Math.min(flux.length - 1, i + NEIGHBOURHOOD);
		const span = to - from + 1;

		let mean = 0;
		for (let k = from; k <= to; k++) mean += flux[k];
		mean /= span;

		let variance = 0;
		for (let k = from; k <= to; k++) variance += (flux[k] - mean) ** 2;
		const threshold = mean + FLUX_SIGMAS * Math.sqrt(variance / span);

		//`<= 0` first: a silent file has flux of exactly zero everywhere, and its last
		//frame would otherwise pass every later test and report an onset at the end
		if (flux[i] <= 0 || flux[i] < threshold) continue;
		//and an attack has to have moved the envelope, not just the bin balance
		if (energyRise[i] < ENERGY_RISE && (i === 0 || energyRise[i - 1] < ENERGY_RISE)) continue;
		// the last frame of a flat top wins, so the plateau an impulse leaves behind
		// resolves to one onset rather than the first frame of the plateau
		if (i > 0 && flux[i - 1] > flux[i]) continue;
		if (i + 1 < flux.length && flux[i + 1] >= flux[i]) continue;
		if (i - lastFrame < MIN_GAP_FRAMES) continue;

		const time = (i * HOP + pad - FLUX_PEAK_DELAY) / sampleRate;
		onsets.push(Math.max(0, time));
		lastFrame = i;
	}
	return onsets;
}
