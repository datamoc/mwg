import type { ExportEncoder, ExportEncoderRequest } from './AudioExport.ts';
import { resampleStereo, type StereoFrames } from './Resample.ts';

const OPUS_RATE = 48000;
const PACKET_SAMPLES = 960; //20 ms at 48 kHz, the frame size every packet below holds
const DEFAULT_PRE_SKIP = 312;

let crcTable: Uint32Array | undefined;

/** the Ogg CRC-32: polynomial 0x04C11DB7, not reflected, zero start and no final inversion */
function oggCrc(bytes: Uint8Array): number {
	if (!crcTable) {
		crcTable = new Uint32Array(256).map((_, n) => {
			let value = n << 24;
			for (let k = 0; k < 8; k++) value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1;
			return value >>> 0;
		});
	}
	let crc = 0;
	for (const byte of bytes) crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
	return crc;
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function concat(parts: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** one Ogg page: the pages of this writer never split a packet, so the continued flag is never set */
function page(
	packets: readonly Uint8Array[],
	headerType: number,
	granule: number,
	serial: number,
	sequence: number,
): Uint8Array {
	const lacing: number[] = [];
	for (const packet of packets) {
		let left = packet.length;
		while (left >= 255) {
			lacing.push(255);
			left -= 255;
		}
		lacing.push(left);
	}
	const header = new Uint8Array(27 + lacing.length);
	const view = new DataView(header.buffer);
	header.set([0x4f, 0x67, 0x67, 0x53, 0, headerType]);
	view.setUint32(6, granule >>> 0, true);
	view.setUint32(10, Math.floor(granule / 0x100000000), true);
	view.setUint32(14, serial, true);
	view.setUint32(18, sequence, true);
	header[26] = lacing.length;
	header.set(lacing, 27);
	const bytes = concat([header, ...packets]);
	new DataView(bytes.buffer).setUint32(22, oggCrc(bytes), true);
	return bytes;
}

export interface OggOpusOptions {
	/** the rate of the audio before it was brought to 48 kHz, written to the header for players that show it */
	inputRate: number;
	/** samples the decoder drops from the start (the encoder's look-ahead); 312 when omitted */
	preSkip?: number;
	/** the exact length of the audio in 48 kHz samples, so the last page trims the padding of the final packet */
	totalSamples: number;
	/** Vorbis-comment style tags (`title`, `album`, ...) */
	tags?: Readonly<Record<string, string>>;
}

/**
 * Wraps Opus packets (stereo, 20 ms each) in an Ogg stream: an `OpusHead` page, an `OpusTags` page,
 * then audio pages whose granule positions count 48 kHz samples from the start including the
 * pre-skip, the last one cut to `totalSamples` so a decoder returns exactly the length that went in.
 *
 * @example
 * ```ts
 * import { oggOpus } from '@datamoc/mwg/audio';
 *
 * const silence = Uint8Array.of(0xf8, 0xff, 0xfe); //a 20 ms Opus frame of silence
 * const file = oggOpus([silence, silence], { inputRate: 44100, totalSamples: 1920 });
 * console.log(new TextDecoder().decode(file.subarray(0, 4))); // 'OggS'
 * ```
 */
export function oggOpus(packets: readonly Uint8Array[], options: OggOpusOptions): Uint8Array {
	const preSkip = options.preSkip ?? DEFAULT_PRE_SKIP;
	const serial = 0x6d776731; //'mwg1': a stream's serial only has to differ from the others in one file
	const head = new Uint8Array(19);
	head.set(utf8('OpusHead'));
	const headView = new DataView(head.buffer);
	head[8] = 1;
	head[9] = 2;
	headView.setUint16(10, preSkip, true);
	headView.setUint32(12, Math.round(options.inputRate), true);
	headView.setUint16(16, 0, true);
	head[18] = 0;
	const comments = [
		`ENCODER=mwg`,
		...Object.entries(options.tags ?? {}).map(([key, value]) => `${key.toUpperCase()}=${value}`),
	];
	const vendor = utf8('mwg');
	const entries = comments.map(utf8);
	const tags = new Uint8Array(8 + 4 + vendor.length + 4 + entries.reduce((sum, entry) => sum + 4 + entry.length, 0));
	const tagsView = new DataView(tags.buffer);
	tags.set(utf8('OpusTags'));
	tagsView.setUint32(8, vendor.length, true);
	tags.set(vendor, 12);
	let at = 12 + vendor.length;
	tagsView.setUint32(at, entries.length, true);
	at += 4;
	for (const entry of entries) {
		tagsView.setUint32(at, entry.length, true);
		tags.set(entry, at + 4);
		at += 4 + entry.length;
	}
	const pages: Uint8Array[] = [page([head], 0x02, 0, serial, 0), page([tags], 0, 0, serial, 1)];
	let sequence = 2;
	let started = 0;
	while (started < packets.length) {
		//as many whole packets as fit the 255 lacing values of a page
		let segments = 0;
		let end = started;
		while (end < packets.length && segments + Math.floor(packets[end].length / 255) + 1 <= 255) {
			segments += Math.floor(packets[end].length / 255) + 1;
			end++;
		}
		const last = end === packets.length;
		const granule = last ? preSkip + options.totalSamples : preSkip + end * PACKET_SAMPLES;
		pages.push(page(packets.slice(started, end), last ? 0x04 : 0, granule, serial, sequence++));
		started = end;
	}
	if (packets.length === 0) pages.push(page([], 0x04, preSkip, serial, sequence));
	return concat(pages);
}

/** the parts of WebCodecs this encoder touches, named so a test can stand in for a browser */
interface OpusEncoderGlobals {
	AudioEncoder: new (init: {
		output: (chunk: { byteLength: number; copyTo(target: Uint8Array): void }, metadata?: unknown) => void;
		error: (error: Error) => void;
	}) => {
		configure(config: Record<string, unknown>): void;
		encode(data: unknown): void;
		flush(): Promise<void>;
		close(): void;
	};
	AudioData: new (init: {
		format: string;
		sampleRate: number;
		numberOfFrames: number;
		numberOfChannels: number;
		timestamp: number;
		data: Float32Array;
	}) => { close(): void };
}

/**
 * Whether this environment can encode Opus itself, which is whether a WebCodecs `AudioEncoder`
 * exists. False in Node and in older WebViews, where the game injects another encoder (or
 * leaves Opus out: `AudioExport.formats()` follows this).
 *
 * @example
 * ```ts
 * import { isOpusEncodingAvailable } from '@datamoc/mwg/audio';
 *
 * console.log(isOpusEncodingAvailable()); // true in a current Chrome
 * ```
 */
export function isOpusEncodingAvailable(): boolean {
	const scope = globalThis as unknown as Partial<OpusEncoderGlobals>;
	return typeof scope.AudioEncoder === 'function' && typeof scope.AudioData === 'function';
}

/**
 * An `ExportEncoder` for Opus over WebCodecs: brings the frames to 48 kHz, feeds 20 ms blocks to an
 * `AudioEncoder` at the requested bit rate (128 kbit/s when omitted), and wraps the packets in an
 * Ogg stream with the request's tags. Browser only (`isOpusEncodingAvailable`); it is not
 * self-contained, so it runs on the thread that calls it.
 *
 * @example
 * ```ts
 * import { AudioExport, isOpusEncodingAvailable, webCodecsOpusEncoder } from '@datamoc/mwg/audio';
 *
 * const service = new AudioExport({
 * 	encoders: { opus: webCodecsOpusEncoder },
 * 	opusAvailable: isOpusEncodingAvailable,
 * });
 * console.log(service.formats());
 * ```
 */
export const webCodecsOpusEncoder: ExportEncoder = async (frames: StereoFrames, request: ExportEncoderRequest) => {
	const scope = globalThis as unknown as Partial<OpusEncoderGlobals>;
	if (!isOpusEncodingAvailable()) throw new Error('this environment has no WebCodecs AudioEncoder for Opus');
	const { AudioEncoder, AudioData } = scope as OpusEncoderGlobals;
	const source = frames.sampleRate === OPUS_RATE ? frames : resampleStereo(frames, OPUS_RATE);
	const total = source.left.length;
	const packets: Uint8Array[] = [];
	let preSkip = DEFAULT_PRE_SKIP;
	let failure: Error | null = null;
	const encoder = new AudioEncoder({
		output: (chunk, metadata) => {
			const bytes = new Uint8Array(chunk.byteLength);
			chunk.copyTo(bytes);
			packets.push(bytes);
			//the encoder states its own look-ahead in the OpusHead it describes, bytes 10 and 11
			const description = (metadata as { decoderConfig?: { description?: ArrayBuffer } } | undefined)
				?.decoderConfig?.description;
			if (description && description.byteLength >= 12) preSkip = new DataView(description).getUint16(10, true);
		},
		error: (error) => {
			failure = error;
		},
	});
	try {
		encoder.configure({
			codec: 'opus',
			sampleRate: OPUS_RATE,
			numberOfChannels: 2,
			bitrate: (request.bitrate ?? 128) * 1000,
		});
		for (let at = 0; at < total; at += PACKET_SAMPLES) {
			if (request.signal?.aborted) throw new Error('the export was cancelled');
			const count = Math.min(PACKET_SAMPLES, total - at);
			//planar f32: the left block, then the right, padded with silence to a whole 20 ms
			const block = new Float32Array(PACKET_SAMPLES * 2);
			block.set(source.left.subarray(at, at + count), 0);
			block.set(source.right.subarray(at, at + count), PACKET_SAMPLES);
			const data = new AudioData({
				format: 'f32-planar',
				sampleRate: OPUS_RATE,
				numberOfFrames: PACKET_SAMPLES,
				numberOfChannels: 2,
				timestamp: Math.round((at / OPUS_RATE) * 1e6),
				data: block,
			});
			encoder.encode(data);
			data.close();
			request.onProgress?.(Math.min(1, (at + count) / total));
		}
		await encoder.flush();
		if (failure) throw failure;
	} finally {
		encoder.close();
	}
	return oggOpus(packets, { inputRate: frames.sampleRate, preSkip, totalSamples: total, tags: request.tags });
};
