import type { SampleCodec } from './SampleCodec.ts';

/**
 * Turns the compressed bytes of one SoundFont 3 sample (Ogg Vorbis, Ogg Opus or FLAC, named by
 * `codec`) into mono 16-bit frames at the sample's own rate, which is the rate its header states
 * and the frame count its loop points were written against. Synchronous or asynchronous: a
 * browser decodes through WebAudio (`webAudioSampleDecoder`), a Node tool through whatever it has
 * installed (`decodeFlac` needs nothing). A decoder written for Vorbis alone may ignore `codec`.
 */
export type SoundFontSampleDecoder = (
	bytes: Uint8Array,
	rate: number,
	codec: SampleCodec,
) => Int16Array | Promise<Int16Array>;

/**
 * Turns mono 16-bit frames into the compressed bytes of one SoundFont 3 sample in `codec`. The
 * frames are at `rate`, the rate the sample header will state; an encoder whose codec runs at
 * fixed rates (Opus resamples to 48 kHz) decodes back at `rate` all the same.
 */
export type SoundFontSampleEncoder = (
	frames: Int16Array,
	rate: number,
	codec: SampleCodec,
	options?: SampleEncodeOptions,
) => Uint8Array | Promise<Uint8Array>;

/**
 * How hard an encoder compresses. Each field belongs to one codec and the others ignore it: FLAC is
 * lossless and takes neither. An encoder that has no use for them may leave the parameter out.
 */
export interface SampleEncodeOptions {
	/** target bitrate in kbit/s for Opus (6 to 510); the encoder's own default when absent */
	bitrate?: number;
	/** quality level for Vorbis, -1 (smallest) to 10 (best); the encoder's own default when absent */
	quality?: number;
}

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

/**
 * What a sample header may claim. The rate and the Ogg bytes come from a font file that may have been
 * downloaded, so what they ask the decoder to allocate is bounded: the SoundFont 2 format itself
 * stops at 50 kHz, and sixteen million frames is six minutes at 44.1 kHz for a single instrument sample.
 */
export const MIN_SAMPLE_RATE = 400;
export const MAX_SAMPLE_RATE = 200000;
export const MAX_SAMPLE_FRAMES = 1 << 24;

/**
 * How much a SoundFont 3 may decode to, in frames. The defaults (`MAX_SAMPLE_FRAMES` for one sample, 128
 * million, 256 MB of 16-bit audio, for the whole font) suit a game font; raise them for a very large one
 * you trust, since each frame is two bytes of memory and a damaged font can ask for any number.
 */
export interface SoundFontLimits {
	/** frames one decoded sample may have */
	sampleFrames?: number;
	/** frames all the decoded samples of one font may have */
	totalFrames?: number;
}

/** the whole-font default of {@link SoundFontLimits} */
export const MAX_TOTAL_FRAMES = 1 << 27;

function toInt16(frames: Float32Array): Int16Array {
	const out = new Int16Array(frames.length);
	for (let index = 0; index < frames.length; index++) {
		out[index] = Math.round(Math.max(-1, Math.min(1, frames[index])) * 32767);
	}
	return out;
}

/** linear resampling, only for the rare sample whose rate a context cannot be created at */
function resample(frames: Float32Array, from: number, to: number, maxFrames: number): Float32Array {
	const length = Math.max(1, Math.round((frames.length * to) / from));
	if (length > maxFrames) throw new Error('a decoded sample is longer than a SoundFont sample may be');
	const out = new Float32Array(length);
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
 * the nearest accepted rate and is resampled back. `create` replaces the context factory and `limits`
 * the longest sample it will return.
 *
 * @example
 * ```ts
 * import { loadSoundFont, webAudioSampleDecoder } from '@datamoc/mwg/audio';
 *
 * declare const sf3Bytes: ArrayBuffer;
 *
 * const font = await loadSoundFont(sf3Bytes, { decode: webAudioSampleDecoder() });
 * console.log(font.presetCount);
 * ```
 */
export function webAudioSampleDecoder(
	create: (rate: number) => SampleDecodingContext = offlineContext,
	limits: SoundFontLimits = {},
): SoundFontSampleDecoder {
	const maxFrames = limits.sampleFrames ?? MAX_SAMPLE_FRAMES;
	return async (bytes, rate) => {
		if (!(rate >= MIN_SAMPLE_RATE && rate <= MAX_SAMPLE_RATE)) {
			throw new Error(`a sample rate of ${rate} Hz is not one a SoundFont can state`);
		}
		const contextRate = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
		//decodeAudioData detaches what it is given, and `bytes` is a view into the caller's font
		const copy = bytes.slice().buffer as ArrayBuffer;
		const decoded = await create(contextRate).decodeAudioData(copy);
		if (decoded.length > maxFrames) throw new Error('a decoded sample is longer than a SoundFont sample may be');
		const channel = decoded.getChannelData(0);
		return toInt16(decoded.sampleRate === rate ? channel : resample(channel, decoded.sampleRate, rate, maxFrames));
	};
}
