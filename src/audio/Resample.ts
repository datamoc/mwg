/**
 * Plain-array helpers for fitting rendered audio to a budget: cut to a length with a fade,
 * fold to mono, halve the rate, convert between rates. They work on the `Float32Array`
 * pairs a render produces, so nothing here needs an `AudioContext`.
 */

/** stereo frames at a sample rate: the shape every renderer in this module hands back */
export interface StereoFrames {
	sampleRate: number;
	left: Float32Array;
	right: Float32Array;
}

/**
 * Converts stereo frames to another sample rate by linear interpolation. Linear is audibly
 * soft above the new Nyquist, which is the right trade for ambience and background music where
 * this is used to save memory; a game that needs a clean conversion renders at the target
 * rate instead.
 *
 * @example
 * ```ts
 * import { resampleStereo } from '@datamoc/mwg/audio';
 *
 * declare const frames: { sampleRate: number; left: Float32Array; right: Float32Array };
 *
 * const half = resampleStereo(frames, frames.sampleRate / 2);
 * console.log(half.left.length);
 * ```
 */
export function resampleStereo<T extends StereoFrames>(frames: T, sampleRate: number): T {
	if (!(sampleRate > 0)) throw new Error('target sample rate must be positive');
	if (sampleRate === frames.sampleRate) return frames;
	const length = Math.max(1, Math.round((frames.left.length * sampleRate) / frames.sampleRate));
	const step = frames.sampleRate / sampleRate;
	const left = new Float32Array(length);
	const right = new Float32Array(length);
	const last = frames.left.length - 1;
	for (let i = 0; i < length; i++) {
		const position = i * step;
		const floor = Math.min(last, Math.floor(position));
		const next = Math.min(last, floor + 1);
		const fraction = position - floor;
		left[i] = frames.left[floor] + (frames.left[next] - frames.left[floor]) * fraction;
		right[i] = frames.right[floor] + (frames.right[next] - frames.right[floor]) * fraction;
	}
	return { ...frames, sampleRate, left, right };
}

/** what a track may cost: every field optional, an omitted one leaves that dimension alone */
export interface RenderBudget {
	/** cut the track to this many seconds, fading the cut so it does not click */
	maxSeconds?: number;
	/** seconds of fade at a cut; 0.5 when omitted */
	fadeSeconds?: number;
	/** fold both channels into one, stored twice-referenced so a stereo consumer still works */
	mono?: boolean;
	/** halve the sample rate, for ambience that carries no high frequencies */
	halfRate?: boolean;
}

/**
 * Fits a rendered track to a budget: cuts it to `maxSeconds` with a fade, folds it to mono
 * and halves its rate, in that order. A mono track shares one array between both channels, so
 * it costs half the memory in the renderer's hands even though a stereo `AudioBuffer` made
 * from it later still has two. Loop points past the cut are pulled back to the new end.
 *
 * @example
 * ```ts
 * import { fitToBudget, renderMidiToBuffer, parseMidi } from '@datamoc/mwg/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const ambience = fitToBudget(renderMidiToBuffer(parseMidi(midiBytes)), { maxSeconds: 60, mono: true, halfRate: true });
 * console.log(ambience.duration);
 * ```
 */
export function fitToBudget<T extends StereoFrames & { loopStart?: number; loopEnd?: number; duration?: number }>(
	track: T,
	budget: RenderBudget,
): T {
	let result: T = track;
	if (budget.maxSeconds !== undefined) {
		if (!(budget.maxSeconds > 0)) throw new Error('budget maxSeconds must be positive');
		const limit = Math.max(1, Math.floor(budget.maxSeconds * result.sampleRate));
		if (result.left.length > limit) {
			const left = result.left.slice(0, limit);
			const right = result.right.slice(0, limit);
			const fade = Math.min(limit, Math.floor((budget.fadeSeconds ?? 0.5) * result.sampleRate));
			for (let i = 0; i < fade; i++) {
				const gain = i / fade;
				left[limit - 1 - i] *= gain;
				right[limit - 1 - i] *= gain;
			}
			const seconds = limit / result.sampleRate;
			result = withEnd({ ...result, left, right }, seconds);
		}
	}
	if (budget.mono) {
		const mixed = new Float32Array(result.left.length);
		for (let i = 0; i < mixed.length; i++) mixed[i] = (result.left[i] + result.right[i]) / 2;
		result = { ...result, left: mixed, right: mixed };
	}
	if (budget.halfRate) result = resampleStereo(result, result.sampleRate / 2);
	return result;
}

function withEnd<T extends { loopStart?: number; loopEnd?: number; duration?: number }>(track: T, seconds: number): T {
	const next = { ...track };
	if (next.duration !== undefined) next.duration = seconds;
	if (next.loopEnd !== undefined) next.loopEnd = Math.min(next.loopEnd, seconds);
	if (next.loopStart !== undefined) next.loopStart = Math.min(next.loopStart, Math.max(0, seconds - 0.1));
	return next;
}
