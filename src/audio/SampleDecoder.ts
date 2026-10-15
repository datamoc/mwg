/**
 * Turns the Ogg Vorbis bytes of one SoundFont 3 sample into mono 16-bit frames at the
 * sample's own rate, which is the rate its header states and the frame count its loop
 * points were written against. Synchronous or asynchronous: a browser decodes through
 * WebAudio (`webAudioSampleDecoder`), a Node tool through whatever it has installed.
 */
export type SoundFontSampleDecoder = (ogg: Uint8Array, rate: number) => Int16Array | Promise<Int16Array>;

/** the slice of `OfflineAudioContext` the decoder uses, so a test can stand in for it */
export interface SampleDecodingContext {
	decodeAudioData(data: ArrayBuffer): Promise<{
		sampleRate: number;
		length: number;
		getChannelData(channel: number): Float32Array;
	}>;
}

/** the narrowest rate range every engine's `OfflineAudioContext` accepts */
const MIN_RATE = 8000;
const MAX_RATE = 96000;

function toInt16(frames: Float32Array): Int16Array {
	const out = new Int16Array(frames.length);
	for (let index = 0; index < frames.length; index++) {
		out[index] = Math.round(Math.max(-1, Math.min(1, frames[index])) * 32767);
	}
	return out;
}

/** linear resampling, only for the rare sample whose rate a context cannot be created at */
function resample(frames: Float32Array, from: number, to: number): Float32Array {
	const out = new Float32Array(Math.max(1, Math.round((frames.length * to) / from)));
	for (let index = 0; index < out.length; index++) {
		const at = (index * from) / to;
		const base = Math.floor(at);
		const next = Math.min(base + 1, frames.length - 1);
		out[index] = frames[base] + (frames[next] - frames[base]) * (at - base);
	}
	return out;
}

function offlineContext(rate: number): SampleDecodingContext {
	if (typeof OfflineAudioContext === 'undefined') {
		throw new Error('no OfflineAudioContext here: pass a decoder of your own to decode a SoundFont 3');
	}
	return new OfflineAudioContext(1, 1, rate);
}

/**
 * A decoder over WebAudio's `decodeAudioData`, for a browser: each sample decodes in a context
 * created at the sample's own rate, so the browser does not resample it and the loop points keep
 * meaning what the font wrote. A rate outside what a context accepts (8 to 96 kHz) decodes at
 * the nearest accepted rate and is resampled back. `create` replaces the context factory.
 *
 * @example
 * ```ts
 * import { loadSoundFont, webAudioSampleDecoder } from '@datamoc/mw_games/audio';
 *
 * declare const sf3Bytes: ArrayBuffer;
 *
 * const font = await loadSoundFont(sf3Bytes, { decode: webAudioSampleDecoder() });
 * console.log(font.presetCount);
 * ```
 */
export function webAudioSampleDecoder(
	create: (rate: number) => SampleDecodingContext = offlineContext,
): SoundFontSampleDecoder {
	return async (ogg, rate) => {
		const contextRate = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
		//decodeAudioData detaches what it is given, and `ogg` is a view into the caller's font
		const copy = ogg.slice().buffer as ArrayBuffer;
		const decoded = await create(contextRate).decodeAudioData(copy);
		const channel = decoded.getChannelData(0);
		return toInt16(decoded.sampleRate === rate ? channel : resample(channel, decoded.sampleRate, rate));
	};
}
