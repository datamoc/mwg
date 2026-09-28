import type { LoopRegion } from './Channels.ts';

/** loop points a Vorbis file declares, in samples */
export interface VorbisLoopTags {
	loopStart: number;
	/** null when the file names a start but no length: the loop runs to the end */
	loopLength: number | null;
}

//The comment header sits in the first pages of a file; scanning further would only read audio.
const SCAN_LIMIT = 64 * 1024;

/**
 * Reads the `LOOPSTART` and `LOOPLENGTH` comments (samples) that RPG-style Ogg Vorbis
 * music carries, or null when the file names no loop. Walks the Ogg pages to the Vorbis
 * comment packet rather than scanning for text, and never reads past the first 64 KiB, so
 * a hostile file costs a bounded, quick scan. Malformed input returns null, never throws.
 *
 * @example
 * ```ts
 * import { parseVorbisLoopTags } from '@datamoc/mw_games/audio';
 *
 * declare const oggBytes: Uint8Array;
 *
 * console.log(parseVorbisLoopTags(oggBytes)); // { loopStart, loopLength } or null
 * ```
 */
export function parseVorbisLoopTags(bytes: Uint8Array): VorbisLoopTags | null {
	const data = bytes.subarray(0, SCAN_LIMIT);
	const comment = findCommentPacket(data);
	if (!comment) return null;
	const view = new DataView(comment.buffer, comment.byteOffset, comment.byteLength);
	const decoder = new TextDecoder('utf-8');
	let at = 7; //packet type 3 plus "vorbis"
	const readLength = (): number | null => {
		if (at + 4 > comment.length) return null;
		const value = view.getUint32(at, true);
		at += 4;
		return at + value <= comment.length ? value : null;
	};
	const vendor = readLength();
	if (vendor === null) return null;
	at += vendor;
	if (at + 4 > comment.length) return null;
	const count = view.getUint32(at, true);
	at += 4;
	let start: number | null = null;
	let length: number | null = null;
	for (let index = 0; index < count; index++) {
		const size = readLength();
		if (size === null) break;
		const text = decoder.decode(comment.subarray(at, at + size));
		at += size;
		const separator = text.indexOf('=');
		if (separator < 0) continue;
		const key = text.slice(0, separator).toUpperCase();
		const value = /^\d+$/.test(text.slice(separator + 1)) ? Number(text.slice(separator + 1)) : null;
		if (value === null) continue;
		if (key === 'LOOPSTART') start = value;
		else if (key === 'LOOPLENGTH') length = value;
	}
	return start === null ? null : { loopStart: start, loopLength: length };
}

/**
 * The loop region in seconds for decoded audio, from a file's declared tags: the start,
 * and the start plus the length (or the end of the buffer when no length is declared).
 * Null when the tags name no usable region inside the buffer.
 *
 * @example
 * ```ts
 * import { loopRegionFromTags } from '@datamoc/mw_games/audio';
 *
 * console.log(loopRegionFromTags({ loopStart: 44100, loopLength: 44100 }, 44100, 10)); // { start: 1, end: 2 }
 * ```
 */
export function loopRegionFromTags(
	tags: VorbisLoopTags | null,
	sampleRate: number,
	duration: number,
): LoopRegion | null {
	if (!tags || !(sampleRate > 0)) return null;
	const start = tags.loopStart / sampleRate;
	const end = tags.loopLength ? (tags.loopStart + tags.loopLength) / sampleRate : duration;
	return start >= 0 && end > start && start < duration ? { start, end: Math.min(end, duration) } : null;
}

/** the first packet starting with the Vorbis comment marker, reassembled across Ogg pages */
function findCommentPacket(data: Uint8Array): Uint8Array | null {
	const marker = [3, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73];
	let packet: number[] = [];
	let offset = 0;
	while (offset + 27 <= data.length) {
		if (
			data[offset] !== 0x4f ||
			data[offset + 1] !== 0x67 ||
			data[offset + 2] !== 0x67 ||
			data[offset + 3] !== 0x53
		) {
			return null;
		}
		const segments = data[offset + 26];
		const tableEnd = offset + 27 + segments;
		if (tableEnd > data.length) return null;
		let body = tableEnd;
		for (let index = 0; index < segments; index++) {
			const size = data[offset + 27 + index];
			if (body + size > data.length) return null;
			for (let i = 0; i < size; i++) packet.push(data[body + i]);
			body += size;
			if (size < 255) {
				if (marker.every((byte, i) => packet[i] === byte)) return Uint8Array.from(packet);
				packet = [];
			}
		}
		offset = body;
	}
	return null;
}
