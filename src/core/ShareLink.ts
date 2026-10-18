/**
 * Share links: a short link that carries a piece of a game (a seed and a loadout, a tune) to
 * someone else. The envelope is public and stable, anyone can make or read one; what travels
 * inside it is the game's own JSON, validated by the game that reads it.
 *
 * The link keeps its data in the fragment (`#`), which a browser never sends to a server, so only
 * the limits of browsers and messaging apps apply. The fragment is `mwg:` plus the base64url of
 * one header byte, the deflated body (envelope content type, `id@version` of the game or package,
 * JSON payload) and a short CRC-32 prefix of everything before it, which catches a link a messaging
 * app cut short. Reading is defensive: the payload is untrusted data, inflated under a size budget,
 * never executed, and every failure is a `reason` in the result rather than an exception.
 */

const PREFIX = 'mwg:';
const ENVELOPE_VERSION = 1;
const DEFAULT_MAX_CHARS = 2000;
const DEFAULT_MAX_PAYLOAD_BYTES = 256 * 1024;

export interface ShareEnvelope {
	/** what the payload is (`state`, `music`, ...), chosen by the game */
	type: string;
	/** the game or package the payload belongs to, as `id@version` */
	id: string;
	/** any JSON value */
	payload: unknown;
}

export interface ShareEncodeOptions {
	/** the page the link opens, without a fragment; empty for just the fragment */
	base?: string;
	/** the longest link in characters, base included: 2000 by default (safe in a messaging app), up to 4093 when it stays in a browser */
	maxChars?: number;
	/** checksum bytes, 2 to 4; 3 when omitted */
	checksumBytes?: 2 | 3 | 4;
}

export type ShareFailure =
	'too-long' | 'malformed' | 'checksum' | 'version' | 'unsupported' | 'too-big' | 'refused' | 'schema';

export type ShareDecoded<T> =
	{ ok: true; type: string; id: string; payload: T } | { ok: false; reason: ShareFailure; detail?: string };

export interface ShareDecodeOptions<T> {
	/** the longest link accepted, in characters; 4093 when omitted */
	maxChars?: number;
	/** the largest inflated body in bytes; 256 KiB when omitted */
	maxPayloadBytes?: number;
	/** refuses a link of another type or from another version of the package (return false) */
	accept?: (type: string, id: string) => boolean;
	/** checks the payload against the game's schema and returns it typed; throw to refuse */
	validate?: (payload: unknown, envelope: { type: string; id: string }) => T;
}

/** the result of fitting a link under the limit */
export interface FittedShareLink {
	link: string;
	/** how many reductions were applied: 0 means the full content fitted */
	reductions: number;
}

/**
 * Makes the link for an envelope; throws when the link is longer than `maxChars`, so a caller
 * that must always produce a link uses `fitShareLink` or `bisectShareLink` instead.
 *
 * @example
 * ```ts
 * import { decodeShareLink, encodeShareLink } from '@datamoc/mwg/core';
 *
 * const link = await encodeShareLink({ type: 'state', id: 'pontifex@1.2.0', payload: { seed: 4242 } }, { base: 'https://example.org/play' });
 * const read = await decodeShareLink<{ seed: number }>(link);
 * console.log(read.ok && read.payload.seed); // 4242
 * ```
 */
export async function encodeShareLink(envelope: ShareEnvelope, options: ShareEncodeOptions = {}): Promise<string> {
	const { base = '', maxChars = DEFAULT_MAX_CHARS, checksumBytes = 3 } = options;
	if (!(maxChars > 0 && maxChars <= 4093))
		throw new Error(`a link limit of ${maxChars} characters is outside 1 to 4093`);
	const body = concat([
		lengthPrefixed(envelope.type),
		lengthPrefixed(envelope.id),
		utf8(JSON.stringify(envelope.payload)),
	]);
	const deflated = await deflate(body);
	const compressed = deflated !== null && deflated.length < body.length;
	const header = (ENVELOPE_VERSION << 3) | ((checksumBytes - 2) << 1) | (compressed ? 1 : 0);
	const data = concat([Uint8Array.of(header), compressed ? deflated : body]);
	const crc = crc32(data);
	const sum = new Uint8Array(checksumBytes).map((_, i) => (crc >>> (8 * (3 - i))) & 0xff);
	const link = `${base}#${PREFIX}${toBase64Url(concat([data, sum]))}`;
	if (link.length > maxChars) throw new Error(`the link is ${link.length} characters, over the limit of ${maxChars}`);
	return link;
}

/**
 * Reads a link (a full URL, or just its fragment) and returns the envelope, or the reason it was
 * refused. Never throws and never runs anything from the payload.
 */
export async function decodeShareLink<T = unknown>(
	link: string,
	options: ShareDecodeOptions<T> = {},
): Promise<ShareDecoded<T>> {
	const { maxChars = 4093, maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES } = options;
	if (link.length > maxChars) return { ok: false, reason: 'too-long' };
	const at = link.indexOf(`#${PREFIX}`) >= 0 ? link.indexOf(`#${PREFIX}`) + 1 : link.startsWith(PREFIX) ? 0 : -1;
	if (at < 0) return { ok: false, reason: 'malformed', detail: 'no mwg fragment' };
	const raw = fromBase64Url(link.slice(at + PREFIX.length));
	if (!raw || raw.length < 4) return { ok: false, reason: 'malformed', detail: 'not base64url' };
	const header = raw[0];
	if (header >> 3 !== ENVELOPE_VERSION)
		return { ok: false, reason: 'version', detail: `envelope version ${header >> 3}` };
	const checksumBytes = ((header >> 1) & 0b11) + 2;
	if (checksumBytes > 4 || raw.length <= 1 + checksumBytes)
		return { ok: false, reason: 'malformed', detail: 'too short' };
	const data = raw.subarray(0, raw.length - checksumBytes);
	const crc = crc32(data);
	for (let i = 0; i < checksumBytes; i++) {
		if (raw[data.length + i] !== ((crc >>> (8 * (3 - i))) & 0xff)) return { ok: false, reason: 'checksum' };
	}
	let body = data.subarray(1);
	if (header & 1) {
		const inflated = await inflate(body, maxPayloadBytes);
		if (inflated === 'unsupported') return { ok: false, reason: 'unsupported', detail: 'no DecompressionStream' };
		if (inflated === 'too-big') return { ok: false, reason: 'too-big' };
		if (inflated === null) return { ok: false, reason: 'malformed', detail: 'bad deflate stream' };
		body = inflated;
	} else if (body.length > maxPayloadBytes) {
		return { ok: false, reason: 'too-big' };
	}
	try {
		const type = readLengthPrefixed(body, 0);
		const id = readLengthPrefixed(body, type.next);
		const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(id.next)));
		if (options.accept && !options.accept(type.text, id.text)) return { ok: false, reason: 'refused' };
		if (!options.validate) return { ok: true, type: type.text, id: id.text, payload: payload as T };
		try {
			return {
				ok: true,
				type: type.text,
				id: id.text,
				payload: options.validate(payload, { type: type.text, id: id.text }),
			};
		} catch (error) {
			return { ok: false, reason: 'schema', detail: error instanceof Error ? error.message : String(error) };
		}
	} catch {
		return { ok: false, reason: 'malformed', detail: 'body is not an envelope' };
	}
}

/**
 * Makes a link from the first of `candidates` that fits, listed from the fullest content to the
 * leanest; `reductions` tells the receiver how many steps were dropped. Throws when even the
 * last does not fit. `dropByPriority` builds such a list from a record.
 *
 * @example
 * ```ts
 * import { dropByPriority, fitShareLink } from '@datamoc/mwg/core';
 *
 * const loadout = { seed: 7, equipment: ['sword', 'lamp'], decoration: 'banner' };
 * const ladder = dropByPriority(loadout, ['seed', 'equipment', 'decoration']);
 * const { link, reductions } = await fitShareLink('state', 'game@1.0.0', ladder, { maxChars: 600 });
 * console.log(link.length <= 600, reductions); // true 0
 * ```
 */
export async function fitShareLink(
	type: string,
	id: string,
	candidates: readonly unknown[],
	options: ShareEncodeOptions = {},
): Promise<FittedShareLink> {
	let last: unknown;
	for (let reductions = 0; reductions < candidates.length; reductions++) {
		try {
			return { link: await encodeShareLink({ type, id, payload: candidates[reductions] }, options), reductions };
		} catch (error) {
			last = error;
		}
	}
	throw last ?? new Error('there is nothing to share');
}

/**
 * The ladder `fitShareLink` wants for a record: the whole record first, then the record without
 * its least important field, and so on. `priority` lists the field names from most to least
 * important; fields it does not name are dropped last-to-first after it, never before.
 */
export function dropByPriority(
	record: Readonly<Record<string, unknown>>,
	priority: readonly string[],
): Record<string, unknown>[] {
	const kept = priority.filter((key) => key in record);
	const ladder: Record<string, unknown>[] = [];
	for (let count = kept.length; count >= 1; count--) {
		ladder.push(Object.fromEntries(kept.slice(0, count).map((key) => [key, record[key]])));
	}
	return ladder;
}

/**
 * The longest prefix of `items` whose link fits, found by bisection: `build` makes the payload for
 * a count, and the answer is the largest count that fits (0 is allowed, for a payload with no
 * items). Counts that do not fit are never tried twice.
 *
 * @example
 * ```ts
 * import { bisectShareLink } from '@datamoc/mwg/core';
 *
 * const notes = Array.from({ length: 500 }, (_, i) => [60 + (i % 12), i]);
 * const { link, kept } = await bisectShareLink('music', 'game@1.0.0', notes, (items, cut) => ({ cut, items }), {
 * 	maxChars: 800,
 * });
 * console.log(link.length <= 800, kept < notes.length); // true true
 * ```
 */
export async function bisectShareLink<T>(
	type: string,
	id: string,
	items: readonly T[],
	build: (kept: readonly T[], truncated: boolean) => unknown,
	options: ShareEncodeOptions = {},
): Promise<{ link: string; kept: number }> {
	const attempt = async (count: number): Promise<string | null> => {
		try {
			return await encodeShareLink(
				{ type, id, payload: build(items.slice(0, count), count < items.length) },
				options,
			);
		} catch {
			return null;
		}
	};
	const whole = await attempt(items.length);
	if (whole !== null) return { link: whole, kept: items.length };
	let low = 0;
	let high = items.length - 1;
	let best: { link: string; kept: number } | null = null;
	while (low <= high) {
		const middle = (low + high) >> 1;
		const link = await attempt(middle);
		if (link !== null) {
			best = { link, kept: middle };
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	if (!best) throw new Error('not even the shortest version of the content fits the link limit');
	return best;
}

function utf8(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

function lengthPrefixed(text: string): Uint8Array {
	const bytes = utf8(text);
	if (bytes.length > 255) throw new Error('an envelope type or id is limited to 255 bytes');
	return concat([Uint8Array.of(bytes.length), bytes]);
}

function readLengthPrefixed(bytes: Uint8Array, at: number): { text: string; next: number } {
	const length = bytes[at];
	if (length === undefined || at + 1 + length > bytes.length) throw new Error('truncated');
	return {
		text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(at + 1, at + 1 + length)),
		next: at + 1 + length,
	};
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

async function pump(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | 'too-big' | null> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel().catch(() => {});
				return 'too-big';
			}
			chunks.push(value);
		}
	} catch {
		return null;
	}
	return concat(chunks);
}

/** null when the platform has no CompressionStream */
async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
	if (typeof CompressionStream === 'undefined') return null;
	const result = await pump(
		new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw')),
		Infinity,
	);
	return result === 'too-big' ? null : result;
}

async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array | 'too-big' | 'unsupported' | null> {
	if (typeof DecompressionStream === 'undefined') return 'unsupported';
	return pump(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')), limit);
}

let crcTable: Uint32Array | undefined;

function crc32(bytes: Uint8Array): number {
	if (!crcTable) {
		crcTable = new Uint32Array(256).map((_, n) => {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			return c >>> 0;
		});
	}
	let crc = 0xffffffff;
	for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function toBase64Url(bytes: Uint8Array): string {
	let text = '';
	for (const byte of bytes) text += String.fromCharCode(byte);
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	try {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}
