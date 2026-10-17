import type { StereoFrames } from './Resample.ts';

/**
 * Writes stereo frames as a canonical RIFF/WAVE file: 16-bit PCM by default, or 32-bit float
 * when the samples must survive unclipped. The one container every tool and browser reads, which
 * is why the offline renders of this module go out through it.
 *
 * @example
 * ```ts
 * import { encodeWav, renderMidiToBuffer, parseMidi } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const wav = encodeWav(renderMidiToBuffer(parseMidi(midiBytes)));
 * console.log(wav.byteLength);
 * ```
 */
export function encodeWav(frames: StereoFrames, format: 'pcm16' | 'float32' = 'pcm16'): Uint8Array {
	const count = frames.left.length;
	if (frames.right.length !== count) throw new Error('the two channels must have the same length');
	const bytesPerSample = format === 'pcm16' ? 2 : 4;
	const dataBytes = count * 2 * bytesPerSample;
	const out = new Uint8Array(44 + dataBytes);
	const view = new DataView(out.buffer);
	const text = (offset: number, value: string): void => {
		for (let i = 0; i < value.length; i++) out[offset + i] = value.charCodeAt(i);
	};
	text(0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	text(8, 'WAVE');
	text(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, format === 'pcm16' ? 1 : 3, true);
	view.setUint16(22, 2, true);
	view.setUint32(24, Math.round(frames.sampleRate), true);
	view.setUint32(28, Math.round(frames.sampleRate) * 2 * bytesPerSample, true);
	view.setUint16(32, 2 * bytesPerSample, true);
	view.setUint16(34, bytesPerSample * 8, true);
	text(36, 'data');
	view.setUint32(40, dataBytes, true);
	let at = 44;
	for (let i = 0; i < count; i++) {
		for (const sample of [frames.left[i], frames.right[i]]) {
			if (format === 'pcm16') {
				view.setInt16(at, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
			} else {
				view.setFloat32(at, sample, true);
			}
			at += bytesPerSample;
		}
	}
	return out;
}

/** what a WAVE header says, without decoding the samples */
export interface WavInfo {
	channels: number;
	sampleRate: number;
	bitsPerSample: number;
	/** `'pcm'` for integer samples, `'float'` for IEEE float */
	encoding: 'pcm' | 'float';
	frames: number;
	seconds: number;
}

function wavChunks(bytes: Uint8Array): { info: WavInfo; dataOffset: number } {
	if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF')
		throw new Error('not a RIFF file');
	if (String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE') throw new Error('not a WAVE file');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let format: { tag: number; channels: number; rate: number; bits: number } | null = null;
	let offset = 12;
	while (offset + 8 <= bytes.length) {
		const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
		const size = view.getUint32(offset + 4, true);
		const body = offset + 8;
		if (id === 'fmt ') {
			if (size < 16 || body + 16 > bytes.length) throw new Error('truncated fmt chunk');
			format = {
				tag: view.getUint16(body, true),
				channels: view.getUint16(body + 2, true),
				rate: view.getUint32(body + 4, true),
				bits: view.getUint16(body + 14, true),
			};
		} else if (id === 'data') {
			if (!format) throw new Error('data chunk before fmt chunk');
			const available = Math.min(size, bytes.length - body);
			const encoding = format.tag === 3 ? 'float' : 'pcm';
			if (format.tag !== 1 && format.tag !== 3) throw new Error(`unsupported WAVE format tag ${format.tag}`);
			if (format.channels < 1 || format.bits % 8 !== 0 || format.bits < 8)
				throw new Error('unsupported sample layout');
			const frames = Math.floor(available / (format.channels * (format.bits / 8)));
			return {
				info: {
					channels: format.channels,
					sampleRate: format.rate,
					bitsPerSample: format.bits,
					encoding,
					frames,
					seconds: format.rate > 0 ? frames / format.rate : 0,
				},
				dataOffset: body,
			};
		}
		offset = body + size + (size % 2);
	}
	throw new Error('no data chunk');
}

/**
 * Reads a WAVE header: layout and length, no samples.
 *
 * @example
 * ```ts
 * import { wavInfo } from '@datamoc/mw_games/audio';
 *
 * declare const bytes: Uint8Array;
 *
 * console.log(wavInfo(bytes).sampleRate);
 * ```
 */
export function wavInfo(bytes: Uint8Array): WavInfo {
	return wavChunks(bytes).info;
}

/**
 * Decodes a PCM (8, 16, 24 or 32 bit) or float32 WAVE file to stereo frames: a mono file is
 * duplicated to both channels, and channels past the second are dropped.
 *
 * @example
 * ```ts
 * import { decodeWav } from '@datamoc/mw_games/audio';
 *
 * declare const bytes: Uint8Array;
 *
 * const { sampleRate, left } = decodeWav(bytes);
 * console.log(sampleRate, left.length);
 * ```
 */
export function decodeWav(bytes: Uint8Array): StereoFrames {
	const { info, dataOffset } = wavChunks(bytes);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const width = info.bitsPerSample / 8;
	const left = new Float32Array(info.frames);
	const right = new Float32Array(info.frames);
	const read = (at: number): number => {
		if (info.encoding === 'float') {
			if (width !== 4) throw new Error('only 32-bit float is supported');
			return view.getFloat32(at, true);
		}
		switch (width) {
			case 1:
				return (view.getUint8(at) - 128) / 128;
			case 2:
				return view.getInt16(at, true) / 32768;
			case 3:
				return (view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16) | 0) / 8388608;
			case 4:
				return view.getInt32(at, true) / 2147483648;
			default:
				throw new Error(`unsupported sample width ${info.bitsPerSample}`);
		}
	};
	for (let i = 0; i < info.frames; i++) {
		const at = dataOffset + i * info.channels * width;
		left[i] = read(at);
		right[i] = info.channels > 1 ? read(at + width) : left[i];
	}
	return { sampleRate: info.sampleRate, left, right };
}
