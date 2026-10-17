import { sha256Hex } from './package-container.ts';

export interface RomDetection {
	/** why the bytes were taken for an instrument ROM image */
	readonly reason: 'digest' | 'extension' | 'size';
	/** the label of a registered digest, when that was the reason */
	readonly label?: string;
	/** ready to show: names the file and says what to supply instead */
	readonly message: string;
}

const digests = new Map<string, string>();

/**
 * Sizes an instrument ROM dump typically has: the powers of two from 8 KiB to 2 MiB, which is
 * what a mask ROM or EPROM holds. Size alone proves nothing, so it only counts for bytes that
 * also carry no recognised signature and are not text.
 */
const ROM_SIZES = new Set(Array.from({ length: 9 }, (_, index) => 8192 << index));

const SIGNATURES: readonly (readonly number[])[] = [
	[0x89, 0x50, 0x4e, 0x47], // PNG
	[0xff, 0xd8, 0xff], // JPEG
	[0x47, 0x49, 0x46, 0x38], // GIF
	[0x52, 0x49, 0x46, 0x46], // RIFF: WAV, SF2, AVI, WebP
	[0x4f, 0x67, 0x67, 0x53], // Ogg
	[0x49, 0x44, 0x33], // MP3 with an ID3 tag
	[0x66, 0x4c, 0x61, 0x43], // FLAC
	[0x4d, 0x54, 0x68, 0x64], // Standard MIDI File
	[0x4d, 0x57, 0x50, 0x31], // MWP1
	[0x50, 0x4b, 0x03, 0x04], // ZIP
	[0x1f, 0x8b], // gzip
	[0x46, 0x4f, 0x52, 0x4d], // IFF/AIFF
	[0x59, 0x4d, 0x35, 0x21], // YM5!
	[0x59, 0x4d, 0x36, 0x21], // YM6!
	[0x56, 0x67, 0x6d, 0x20], // Vgm
	[0x50, 0x53, 0x49, 0x44], // PSID
	[0x52, 0x53, 0x49, 0x44], // RSID
	[0x4e, 0x45, 0x53, 0x4d], // NSF
	[0x49, 0x4d, 0x50, 0x4d], // Impulse Tracker
	[0x45, 0x78, 0x74, 0x65, 0x6e], // Extended Module
	[0x77, 0x4f, 0x46], // WOFF / WOFF2
	[0x00, 0x01, 0x00, 0x00], // TrueType
	[0x4f, 0x54, 0x54, 0x4f], // OpenType
];

/**
 * Adds the SHA-256 of a known instrument ROM image to the refusal list. Digests are kept as
 * lower-case hex and never ship with mwg, so the list is whatever a game or a studio registers.
 *
 * @example
 * ```ts
 * import { detectRomImage, registerRomDigest, sha256Hex } from '@datamoc/mw_games/mwl';
 *
 * const bytes = new Uint8Array([1, 2, 3]);
 * registerRomDigest(await sha256Hex(bytes), 'example ROM');
 * console.log((await detectRomImage(bytes))?.reason); // 'digest'
 * ```
 */
export function registerRomDigest(sha256: string, label: string): void {
	const key = sha256.toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('a ROM digest is 64 hexadecimal characters');
	digests.set(key, label);
}

/**
 * Decides whether bytes are an instrument ROM image, which a package must never carry. The
 * answer is a registered digest, a `.rom` extension, or an exact ROM size with no recognised
 * format signature and no text in it. `null` means nothing suggests a ROM.
 *
 * @example
 * ```ts
 * import { detectRomImage } from '@datamoc/mw_games/mwl';
 *
 * const refusal = await detectRomImage(new Uint8Array(65536).fill(0xa5), 'pcm.bin');
 * console.log(refusal?.reason); // 'size'
 * ```
 */
export async function detectRomImage(bytes: Uint8Array, name = 'data'): Promise<RomDetection | null> {
	const refuse = (reason: RomDetection['reason'], why: string, label?: string): RomDetection => ({
		reason,
		...(label ? { label } : {}),
		message: `"${name}" looks like an instrument ROM image (${why}). Packages carry no ROM: supply the patches as a .syx file instead.`,
	});
	const label = digests.size ? digests.get(await sha256Hex(bytes)) : undefined;
	if (label !== undefined) return refuse('digest', `it matches the registered ROM "${label}"`, label);
	if (name.toLowerCase().endsWith('.rom')) return refuse('extension', 'it has a .rom extension');
	if (ROM_SIZES.has(bytes.length) && !hasSignature(bytes) && !looksLikeText(bytes))
		return refuse('size', `${bytes.length} bytes with no recognised format`);
	return null;
}

function hasSignature(bytes: Uint8Array): boolean {
	// a SysEx dump (.syx) is patches, which is what a package should carry; F0 ... F7 frames it
	if (bytes[0] === 0xf0 && bytes[bytes.length - 1] === 0xf7) return true;
	return SIGNATURES.some((signature) => signature.every((byte, index) => bytes[index] === byte));
}

/** JSON, MWL, SVG and the like: mostly printable ASCII in the first block */
function looksLikeText(bytes: Uint8Array): boolean {
	const sample = bytes.subarray(0, 512);
	let printable = 0;
	for (const byte of sample) if ((byte >= 32 && byte < 127) || byte === 9 || byte === 10 || byte === 13) printable++;
	return printable >= sample.length * 0.95;
}
