/**
 * The compression a SoundFont 3 sample was stored with. The format only says a sample is
 * compressed (bit 4 of its type) and leaves the codec to the application, so a reader has to look
 * at the bytes: Vorbis and Opus both travel in Ogg pages and are told apart by their first packet,
 * FLAC is a native stream.
 */
export type SampleCodec = 'vorbis' | 'opus' | 'flac';

/**
 * every codec a SoundFont 3 sample may use here, in the order a tool lists them
 *
 * @example
 * ```ts
 * import { SAMPLE_CODECS } from '@datamoc/mwg/audio';
 *
 * console.log(SAMPLE_CODECS.join(', ')); // vorbis, opus, flac
 * ```
 */
export const SAMPLE_CODECS: readonly SampleCodec[] = ['vorbis', 'opus', 'flac'];

function startsWith(bytes: Uint8Array, at: number, text: string): boolean {
	if (at + text.length > bytes.length) return false;
	for (let index = 0; index < text.length; index++) {
		if (bytes[at + index] !== text.charCodeAt(index)) return false;
	}
	return true;
}

/**
 * Names the codec of one compressed sample from its first bytes, or throws naming what it found.
 * An Ogg stream is Vorbis when its first packet starts `\x01vorbis` and Opus when it starts
 * `OpusHead`; a stream beginning `fLaC` is FLAC.
 *
 * @example
 * ```ts
 * import { detectSampleCodec } from '@datamoc/mwg/audio';
 *
 * console.log(detectSampleCodec(new TextEncoder().encode('fLaC')));
 * ```
 */
export function detectSampleCodec(bytes: Uint8Array): SampleCodec {
	if (startsWith(bytes, 0, 'fLaC')) return 'flac';
	if (startsWith(bytes, 0, 'OggS')) {
		//27 header bytes (the last is the segment count), then that many segment-table bytes
		const first = 27 + (bytes[26] ?? 0);
		if (startsWith(bytes, first, '\x01vorbis')) return 'vorbis';
		if (startsWith(bytes, first, 'OpusHead')) return 'opus';
		throw new Error('a compressed sample is an Ogg stream that is neither Vorbis nor Opus');
	}
	throw new Error(
		'a compressed sample is not Vorbis, Opus or FLAC data: the font is damaged or uses a codec this reader does not know',
	);
}
