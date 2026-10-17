/**
 * The `.mwp` container: a magic, a DEFLATE JSON directory and the entries back to back.
 *
 * ```
 * "MWP1"  u32le directory size  directory (JSON, raw DEFLATE)  entry 0  entry 1 ...
 * ```
 *
 * ZIP was the other candidate. This directory is simpler to hash and to read without a library,
 * rejects what ZIP leaves ambiguous (duplicate names, absolute paths, overlapping members) by
 * construction, and keeps the one rule that matters for content from strangers: nothing is
 * returned unless every entry has been inflated within its declared size and matched its digest.
 * Compression and digests use the platform (`CompressionStream`, `crypto.subtle`), so the module
 * runs unchanged in a browser and in Node.
 */

/**
 * The base of every error a package can raise, so a caller can refuse them all with one test.
 *
 * @example
 * ```ts
 * import { PackageError } from '@datamoc/mw_games/mwl';
 *
 * console.log(new PackageError('refused') instanceof Error); // true
 * ```
 */
export class PackageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PackageError';
	}
}

/**
 * The file is not a well-formed package: bad magic, truncated, malformed directory or media.
 *
 * @example
 * ```ts
 * import { decodePackage, PackageFormatError } from '@datamoc/mw_games/mwl';
 *
 * await decodePackage(new Uint8Array(8)).catch((error) => console.log(error instanceof PackageFormatError)); // true
 * ```
 */
export class PackageFormatError extends PackageError {
	constructor(message: string) {
		super(message);
		this.name = 'PackageFormatError';
	}
}

/**
 * An entry does not match the digest the directory declares for it.
 *
 * @example
 * ```ts
 * import { PackageIntegrityError } from '@datamoc/mw_games/mwl';
 *
 * console.log(new PackageIntegrityError('sha256 mismatch').name); // 'PackageIntegrityError'
 * ```
 */
export class PackageIntegrityError extends PackageError {
	constructor(message: string) {
		super(message);
		this.name = 'PackageIntegrityError';
	}
}

/**
 * The package exceeds a declared limit (size, entry count, image dimensions, audio length).
 *
 * @example
 * ```ts
 * import { PackageLimitError } from '@datamoc/mw_games/mwl';
 *
 * console.log(new PackageLimitError('too many entries').name); // 'PackageLimitError'
 * ```
 */
export class PackageLimitError extends PackageError {
	constructor(message: string) {
		super(message);
		this.name = 'PackageLimitError';
	}
}

/**
 * A path escapes the package (absolute, `..`, a drive, a backslash) or appears twice.
 *
 * @example
 * ```ts
 * import { checkPackagePath, PackagePathError } from '@datamoc/mw_games/mwl';
 *
 * try {
 *   checkPackagePath('../escape.txt');
 * } catch (error) {
 *   console.log(error instanceof PackagePathError); // true
 * }
 * ```
 */
export class PackagePathError extends PackageError {
	constructor(message: string) {
		super(message);
		this.name = 'PackagePathError';
	}
}

export interface PackageFile {
	/** forward-slash path relative to the package root */
	readonly path: string;
	readonly data: Uint8Array;
}

export interface PackageLimits {
	/** size of the `.mwp` file itself */
	readonly maxPackageBytes: number;
	/** sum of the inflated sizes of every entry */
	readonly maxTotalBytes: number;
	readonly maxEntries: number;
	readonly maxEntryBytes: number;
	/** longest `.wav` entry, read from its header */
	readonly maxAudioSeconds: number;
	/** largest `.png` entry, read from its header */
	readonly maxImageWidth: number;
	readonly maxImageHeight: number;
}

/**
 * The limits applied when a caller names none. A game raises them by spreading over this object.
 *
 * @example
 * ```ts
 * import { DEFAULT_PACKAGE_LIMITS, decodePackage } from '@datamoc/mw_games/mwl';
 *
 * const roomy = { ...DEFAULT_PACKAGE_LIMITS, maxEntries: 4096 };
 * await decodePackage(new Uint8Array(8), roomy).catch(() => console.log(roomy.maxEntries)); // 4096
 * ```
 */
export const DEFAULT_PACKAGE_LIMITS: PackageLimits = {
	maxPackageBytes: 64 * 1024 * 1024,
	maxTotalBytes: 128 * 1024 * 1024,
	maxEntries: 512,
	maxEntryBytes: 32 * 1024 * 1024,
	maxAudioSeconds: 600,
	maxImageWidth: 4096,
	maxImageHeight: 4096,
};

export interface PackageDirectoryEntry {
	readonly path: string;
	/** inflated size */
	readonly size: number;
	/** DEFLATE size inside the container */
	readonly packed: number;
	/** from the end of the directory */
	readonly offset: number;
	/** lower-case hex SHA-256 of the inflated bytes */
	readonly sha256: string;
}

export interface DecodedPackage {
	/** the path of the MWL document */
	readonly main: string;
	readonly entries: readonly PackageDirectoryEntry[];
	readonly files: readonly PackageFile[];
}

const MAGIC = [0x4d, 0x57, 0x50, 0x31]; // 'MWP1'
const HEADER_BYTES = 8;
/** the directory is a list of short records; a bigger one is not a package */
const MAX_DIRECTORY_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAIN = 'content.mwl';

/**
 * Validates a path that will live inside a package and returns it unchanged.
 *
 * @example
 * ```ts
 * import { checkPackagePath } from '@datamoc/mw_games/mwl';
 *
 * console.log(checkPackagePath('media/portrait.png')); // 'media/portrait.png'
 * ```
 */
export function checkPackagePath(path: string): string {
	if (typeof path !== 'string' || path === '' || path.length > 240) throw new PackagePathError(`bad package path`);
	// eslint-disable-next-line no-control-regex
	if (path.includes('\\') || /[\u0000-\u001f]/.test(path) || path.startsWith('/') || /^[A-Za-z]:/.test(path))
		throw new PackagePathError(`package path "${path}" must be relative with forward slashes`);
	for (const segment of path.split('/'))
		if (segment === '' || segment === '.' || segment === '..')
			throw new PackagePathError(`package path "${path}" escapes or is not normalised`);
	return path;
}

/**
 * Lower-case hex SHA-256 of some bytes, through `crypto.subtle`.
 *
 * @example
 * ```ts
 * import { sha256Hex } from '@datamoc/mw_games/mwl';
 *
 * console.log((await sha256Hex(new Uint8Array(0))).slice(0, 8)); // 'e3b0c442'
 * ```
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Packs files into one `.mwp`. It refuses what `decodePackage` would refuse, so a package that
 * was written can be read back under the same limits.
 *
 * @example
 * ```ts
 * import { decodePackage, encodePackage } from '@datamoc/mw_games/mwl';
 *
 * const text = new TextEncoder().encode('[]');
 * const bytes = await encodePackage([{ path: 'content.mwl', data: text }]);
 * console.log((await decodePackage(bytes)).main); // 'content.mwl'
 * ```
 */
export async function encodePackage(
	files: readonly PackageFile[],
	options: { readonly main?: string; readonly limits?: Partial<PackageLimits> } = {},
): Promise<Uint8Array> {
	const limits = { ...DEFAULT_PACKAGE_LIMITS, ...options.limits };
	const main = options.main ?? DEFAULT_MAIN;
	const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	checkTable(
		sorted.map((file) => ({ path: file.path, size: file.data.length })),
		limits,
	);
	if (!sorted.some((file) => file.path === main)) throw new PackageFormatError(`main document "${main}" is missing`);
	const entries: PackageDirectoryEntry[] = [];
	const bodies: Uint8Array[] = [];
	let offset = 0;
	for (const file of sorted) {
		checkMedia(file.path, file.data, limits);
		const packed = await deflateRaw(file.data);
		entries.push({
			path: file.path,
			size: file.data.length,
			packed: packed.length,
			offset,
			sha256: await sha256Hex(file.data),
		});
		bodies.push(packed);
		offset += packed.length;
	}
	const directory = await deflateRaw(new TextEncoder().encode(JSON.stringify({ entries, main })));
	const header = new Uint8Array(HEADER_BYTES);
	header.set(MAGIC, 0);
	new DataView(header.buffer).setUint32(4, directory.length, true);
	const out = concat([header, directory, ...bodies]);
	if (out.length > limits.maxPackageBytes)
		throw new PackageLimitError(`package is ${out.length} bytes, over the ${limits.maxPackageBytes} limit`);
	return out;
}

/**
 * Reads a `.mwp`. Every entry is inflated within its declared size and matched to its SHA-256
 * before anything is returned; any problem throws a `PackageError` subclass and no partial
 * content escapes.
 *
 * @example
 * ```ts
 * import { decodePackage, encodePackage } from '@datamoc/mw_games/mwl';
 *
 * const bytes = await encodePackage([{ path: 'content.mwl', data: new TextEncoder().encode('[]') }]);
 * const decoded = await decodePackage(bytes, { maxEntries: 8 });
 * console.log(decoded.files.map((file) => file.path)); // ['content.mwl']
 * ```
 */
export async function decodePackage(
	bytes: Uint8Array,
	overrides: Partial<PackageLimits> = {},
): Promise<DecodedPackage> {
	const limits = { ...DEFAULT_PACKAGE_LIMITS, ...overrides };
	if (bytes.length > limits.maxPackageBytes)
		throw new PackageLimitError(`package is ${bytes.length} bytes, over the ${limits.maxPackageBytes} limit`);
	if (bytes.length < HEADER_BYTES || MAGIC.some((byte, index) => bytes[index] !== byte))
		throw new PackageFormatError('not an MWP1 package (bad magic)');
	const directorySize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
	if (directorySize > MAX_DIRECTORY_BYTES || HEADER_BYTES + directorySize > bytes.length)
		throw new PackageFormatError('package directory size is out of range');
	const dataStart = HEADER_BYTES + directorySize;
	const directoryText = new TextDecoder('utf-8', { fatal: true });
	let raw: unknown;
	try {
		raw = JSON.parse(
			directoryText.decode(
				await inflateRaw(bytes.subarray(HEADER_BYTES, dataStart), MAX_DIRECTORY_BYTES, 'directory'),
			),
		);
	} catch (error) {
		if (error instanceof PackageError) throw error;
		throw new PackageFormatError('package directory is not valid JSON');
	}
	const { entries, main } = readDirectory(raw, bytes.length - dataStart, limits);
	if (!entries.some((entry) => entry.path === main))
		throw new PackageFormatError(`main document "${main}" is not in the package`);
	const files: PackageFile[] = [];
	for (const entry of entries) {
		const start = dataStart + entry.offset;
		const data = await inflateRaw(bytes.subarray(start, start + entry.packed), entry.size, entry.path);
		if (data.length !== entry.size)
			throw new PackageFormatError(`entry "${entry.path}" inflates to ${data.length} bytes, not ${entry.size}`);
		if ((await sha256Hex(data)) !== entry.sha256)
			throw new PackageIntegrityError(`entry "${entry.path}" does not match its sha256`);
		checkMedia(entry.path, data, limits);
		files.push({ path: entry.path, data });
	}
	return { main, entries, files };
}

function readDirectory(
	raw: unknown,
	dataBytes: number,
	limits: PackageLimits,
): { entries: PackageDirectoryEntry[]; main: string } {
	const record = raw as { entries?: unknown; main?: unknown } | null;
	if (!record || typeof record !== 'object' || !Array.isArray(record.entries) || typeof record.main !== 'string')
		throw new PackageFormatError('package directory needs "entries" and "main"');
	// Count before reading any field, so a directory of a million records is refused cheaply.
	if (record.entries.length > limits.maxEntries)
		throw new PackageLimitError(
			`package has ${record.entries.length} entries, over the ${limits.maxEntries} limit`,
		);
	const entries = record.entries.map((item: unknown, index: number): PackageDirectoryEntry => {
		const entry = item as Record<string, unknown> | null;
		const count = (name: string): number => {
			const value = entry?.[name];
			if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
				throw new PackageFormatError(`directory entry ${index} has a bad "${name}"`);
			return value;
		};
		if (typeof entry?.path !== 'string') throw new PackageFormatError(`directory entry ${index} has no path`);
		const sha256 = entry.sha256;
		if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256))
			throw new PackageFormatError(`directory entry ${index} has a bad sha256`);
		const result = {
			path: checkPackagePath(entry.path),
			size: count('size'),
			packed: count('packed'),
			offset: count('offset'),
			sha256,
		};
		if (result.offset + result.packed > dataBytes)
			throw new PackageFormatError(`entry "${result.path}" lies outside the package`);
		return result;
	});
	checkTable(entries, limits);
	return { entries, main: checkPackagePath(record.main) };
}

/** duplicate names (also by case, which collide on common filesystems) and the size limits */
function checkTable(entries: readonly { path: string; size: number }[], limits: PackageLimits): void {
	if (entries.length > limits.maxEntries)
		throw new PackageLimitError(`package has ${entries.length} entries, over the ${limits.maxEntries} limit`);
	const seen = new Set<string>();
	let total = 0;
	for (const entry of entries) {
		checkPackagePath(entry.path);
		const key = entry.path.toLowerCase();
		if (seen.has(key)) throw new PackagePathError(`duplicate package path "${entry.path}"`);
		seen.add(key);
		if (entry.size > limits.maxEntryBytes)
			throw new PackageLimitError(
				`entry "${entry.path}" is ${entry.size} bytes, over the ${limits.maxEntryBytes} limit`,
			);
		total += entry.size;
	}
	if (total > limits.maxTotalBytes)
		throw new PackageLimitError(`package inflates to ${total} bytes, over the ${limits.maxTotalBytes} limit`);
}

/** `.png` dimensions and `.wav` length are cheap to read from the header; other media are not probed */
function checkMedia(path: string, data: Uint8Array, limits: PackageLimits): void {
	const lower = path.toLowerCase();
	if (lower.endsWith('.png')) {
		const size = readPngSize(data);
		if (!size) throw new PackageFormatError(`"${path}" is not a PNG image`);
		if (size.width > limits.maxImageWidth || size.height > limits.maxImageHeight)
			throw new PackageLimitError(
				`image "${path}" is ${size.width}x${size.height}, over ${limits.maxImageWidth}x${limits.maxImageHeight}`,
			);
	} else if (lower.endsWith('.wav')) {
		const seconds = readWavSeconds(data);
		if (seconds === undefined) throw new PackageFormatError(`"${path}" is not a readable WAV file`);
		if (seconds > limits.maxAudioSeconds)
			throw new PackageLimitError(
				`audio "${path}" lasts ${seconds.toFixed(1)} s, over the ${limits.maxAudioSeconds} s limit`,
			);
	}
}

function readPngSize(data: Uint8Array): { width: number; height: number } | undefined {
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (data.length < 24 || signature.some((byte, index) => data[index] !== byte)) return undefined;
	if (String.fromCharCode(data[12], data[13], data[14], data[15]) !== 'IHDR') return undefined;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readWavSeconds(data: Uint8Array): number | undefined {
	const tag = (at: number): string => String.fromCharCode(data[at], data[at + 1], data[at + 2], data[at + 3]);
	if (data.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let byteRate = 0; // the lower of the declared rate and sampleRate * blockAlign, so a lying header cannot shorten the duration
	for (let at = 12; at + 8 <= data.length;) {
		const length = view.getUint32(at + 4, true);
		if (tag(at) === 'fmt ' && at + 22 <= data.length) {
			const declared = view.getUint32(at + 16, true);
			const derived = view.getUint32(at + 12, true) * view.getUint16(at + 20, true);
			byteRate = Math.min(declared, derived || declared);
		}
		// a streaming writer may leave the data size at 0xFFFFFFFF; the real length is what is there
		if (tag(at) === 'data') return byteRate > 0 ? Math.min(length, data.length - at - 8) / byteRate : undefined;
		at += 8 + length + (length & 1);
	}
	return undefined;
}

function blobStream(bytes: Uint8Array): ReadableStream {
	return new Blob([bytes as BlobPart]).stream();
}

/** reads a stream, giving up the moment it passes `limit`: a zip bomb is stopped while inflating */
async function collect(stream: ReadableStream<Uint8Array>, limit: number, what: string): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > limit) {
			await reader.cancel();
			throw new PackageLimitError(`"${what}" inflates past its declared ${limit} bytes`);
		}
		chunks.push(value);
	}
	return concat(chunks);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

async function inflateRaw(data: Uint8Array, limit: number, what: string): Promise<Uint8Array> {
	if (typeof DecompressionStream === 'undefined') return inflateStored(data, limit, what);
	try {
		return await collect(blobStream(data).pipeThrough(new DecompressionStream('deflate-raw')), limit, what);
	} catch (error) {
		if (error instanceof PackageError) throw error;
		throw new PackageFormatError(`"${what}" is not valid DEFLATE data`);
	}
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const stored = storeBlocks(data);
	if (typeof CompressionStream === 'undefined') return stored;
	const packed = await collect(blobStream(data).pipeThrough(new CompressionStream('deflate-raw')), Infinity, 'entry');
	return packed.length < stored.length ? packed : stored;
}

/** raw DEFLATE made only of stored blocks: valid for every inflater, needs no compressor */
function storeBlocks(data: Uint8Array): Uint8Array {
	const blocks = Math.max(1, Math.ceil(data.length / 65535));
	const out = new Uint8Array(data.length + blocks * 5);
	let at = 0;
	for (let block = 0; block < blocks; block++) {
		const chunk = data.subarray(block * 65535, (block + 1) * 65535);
		out[at++] = block === blocks - 1 ? 1 : 0;
		out[at++] = chunk.length & 0xff;
		out[at++] = chunk.length >> 8;
		out[at++] = ~chunk.length & 0xff;
		out[at++] = (~chunk.length >> 8) & 0xff;
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

/** the inflater of last resort, for a platform without `DecompressionStream`: stored blocks only */
function inflateStored(data: Uint8Array, limit: number, what: string): Uint8Array {
	const chunks: Uint8Array[] = [];
	let at = 0;
	let total = 0;
	for (let final = false; !final;) {
		if (at + 5 > data.length) throw new PackageFormatError(`"${what}" is truncated`);
		final = (data[at] & 1) === 1;
		if ((data[at] >> 1) & 3)
			throw new PackageFormatError(`"${what}" is compressed and this platform has no DecompressionStream`);
		const length = data[at + 1] | (data[at + 2] << 8);
		if (((data[at + 3] | (data[at + 4] << 8)) ^ 0xffff) !== length)
			throw new PackageFormatError(`"${what}" has a corrupt stored block`);
		total += length;
		if (total > limit) throw new PackageLimitError(`"${what}" inflates past its declared ${limit} bytes`);
		if (at + 5 + length > data.length) throw new PackageFormatError(`"${what}" is truncated`);
		chunks.push(data.subarray(at + 5, at + 5 + length));
		at += 5 + length;
	}
	if (at !== data.length) throw new PackageFormatError(`"${what}" has trailing bytes`);
	return concat(chunks);
}
