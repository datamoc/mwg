import { MAX_SAMPLE_FRAMES, MAX_SAMPLE_RATE, MIN_SAMPLE_RATE } from './SampleDecoder.ts';
import type { SoundFontSampleDecoder, SoundFontSampleEncoder } from './SampleDecoder.ts';

/**
 * A small FLAC codec for one mono 16-bit sample, so a SoundFont 3 can carry lossless samples and
 * be written and read in Node or a browser with nothing installed. The encoder uses fixed
 * predictors (orders 0 to 4) with partitioned Rice coding; the decoder reads any FLAC stream up
 * to 24 bits (constant, verbatim, fixed and LPC subframes, every stereo mode), keeping the left
 * channel of a stereo file.
 */

/** samples per frame the encoder writes */
const BLOCK_SIZE = 4096;
const MAX_FIXED_ORDER = 4;

const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let n = 0; n < 256; n++) {
	let c8 = n;
	for (let bit = 0; bit < 8; bit++) c8 = c8 & 0x80 ? ((c8 << 1) ^ 0x07) & 0xff : (c8 << 1) & 0xff;
	CRC8[n] = c8;
	let c16 = n << 8;
	for (let bit = 0; bit < 8; bit++) c16 = c16 & 0x8000 ? ((c16 << 1) ^ 0x8005) & 0xffff : (c16 << 1) & 0xffff;
	CRC16[n] = c16;
}

function crc8(bytes: Uint8Array, length: number): number {
	let crc = 0;
	for (let index = 0; index < length; index++) crc = CRC8[crc ^ bytes[index]];
	return crc;
}

function crc16(bytes: Uint8Array, length: number): number {
	let crc = 0;
	for (let index = 0; index < length; index++) crc = ((crc << 8) & 0xffff) ^ CRC16[(crc >> 8) ^ bytes[index]];
	return crc;
}

/** writes bits most significant first into a growing byte buffer */
class BitWriter {
	bytes = new Uint8Array(1024);
	length = 0;
	private acc = 0;
	private count = 0;

	private push(byte: number): void {
		if (this.length === this.bytes.length) {
			const grown = new Uint8Array(this.bytes.length * 2);
			grown.set(this.bytes);
			this.bytes = grown;
		}
		this.bytes[this.length++] = byte;
	}

	/** the low `n` bits of `value` (two's complement when negative), `n` up to 32 */
	bits(value: number, n: number): void {
		while (n > 24) {
			n -= 24;
			this.bits(Math.floor(value / 2 ** n) & 0xffffff, 24);
			value = value % 2 ** n;
		}
		this.acc = this.acc * 2 ** n + (value < 0 ? value + 2 ** n : value % 2 ** n);
		this.count += n;
		while (this.count >= 8) {
			this.count -= 8;
			const shifted = Math.floor(this.acc / 2 ** this.count);
			this.push(shifted & 0xff);
			this.acc -= shifted * 2 ** this.count;
		}
	}

	/** `q` zero bits and a one */
	unary(q: number): void {
		for (; q >= 24; q -= 24) this.bits(0, 24);
		this.bits(1, q + 1);
	}

	align(): void {
		if (this.count > 0) this.bits(0, 8 - this.count);
	}
}

/** a frame number as the UTF-8-style code FLAC uses, up to 2^31 */
function utf8Number(value: number): number[] {
	if (value < 0x80) return [value];
	let extra = 1;
	while (value >= 2 ** (5 * extra + 6)) extra++;
	const out = [((0xff00 >> (extra + 1)) & 0xff) | Math.floor(value / 2 ** (6 * extra))];
	for (let index = extra - 1; index >= 0; index--) out.push(0x80 | (Math.floor(value / 2 ** (6 * index)) & 0x3f));
	return out;
}

/** the cost in bits of Rice coding `values` with parameter `k` */
function riceCost(values: Int32Array, from: number, to: number, k: number): number {
	let bits = (to - from) * (k + 1);
	for (let index = from; index < to; index++) bits += values[index] >> k;
	return bits;
}

/** the best Rice parameter for one partition and its cost */
function bestRice(values: Int32Array, from: number, to: number): { k: number; cost: number } {
	let sum = 0;
	for (let index = from; index < to; index++) sum += values[index];
	const mean = (sum / Math.max(1, to - from)) | 0;
	const guess = mean > 0 ? 31 - Math.clz32(mean) : 0;
	let best = { k: 0, cost: Infinity };
	for (let k = Math.max(0, guess - 1); k <= Math.min(30, guess + 1); k++) {
		const cost = riceCost(values, from, to, k);
		if (cost < best.cost) best = { k, cost };
	}
	return best;
}

/** residual of fixed predictor `order` over `block`, zigzag-folded to non-negative numbers */
function fixedResidual(block: Int16Array, order: number): Int32Array {
	const out = new Int32Array(block.length - order);
	for (let index = order; index < block.length; index++) {
		const a = block[index - 1];
		const b = block[index - 2];
		const c = block[index - 3];
		const d = block[index - 4];
		const predicted =
			order === 0
				? 0
				: order === 1
					? a
					: order === 2
						? 2 * a - b
						: order === 3
							? 3 * a - 3 * b + c
							: 4 * a - 6 * b + 4 * c - d;
		const r = block[index] - predicted;
		out[index - order] = r >= 0 ? 2 * r : -2 * r - 1;
	}
	return out;
}

/** the partition order and per-partition parameters that code `folded` (a residual after `order` warm-up samples) smallest */
function planRice(folded: Int32Array, blockSize: number, order: number) {
	let best: { order: number; ks: number[]; cost: number } | null = null;
	for (let po = 0; po <= 8; po++) {
		const parts = 1 << po;
		if (blockSize % parts !== 0 || blockSize / parts <= order) break;
		const size = blockSize / parts;
		const ks: number[] = [];
		let cost = 0;
		for (let part = 0; part < parts; part++) {
			const from = part === 0 ? 0 : part * size - order;
			const to = (part + 1) * size - order;
			const rice = bestRice(folded, from, to);
			ks.push(rice.k);
			cost += rice.cost;
		}
		if (!best || cost < best.cost) best = { order: po, ks, cost };
	}
	return best!;
}

function writeFrame(writer: BitWriter, block: Int16Array, number: number): void {
	let constant = true;
	for (let index = 1; index < block.length && constant; index++) constant = block[index] === block[0];

	const header = [0xff, 0xf8, 0x70, 0x08, ...utf8Number(number), (block.length - 1) >> 8, (block.length - 1) & 0xff];
	header.push(crc8(Uint8Array.from(header), header.length));
	const start = writer.length;
	for (const byte of header) writer.bits(byte, 8);

	if (constant) {
		writer.bits(0, 8); //zero bit, type CONSTANT, no wasted bits
		writer.bits(block[0], 16);
	} else {
		let best: { order: number; folded: Int32Array; plan: ReturnType<typeof planRice>; cost: number } | null = null;
		for (let order = 0; order <= Math.min(MAX_FIXED_ORDER, block.length - 1); order++) {
			const folded = fixedResidual(block, order);
			const plan = planRice(folded, block.length, order);
			const cost = order * 16 + plan.cost + plan.ks.length * 5;
			if (!best || cost < best.cost) best = { order, folded, plan, cost };
		}
		if (best && best.cost < block.length * 16) {
			writer.bits((0b001000 << 1) | (best.order << 1), 8); //zero bit, FIXED type 001xxx, no wasted bits
			for (let index = 0; index < best.order; index++) writer.bits(block[index], 16);
			const wide = Math.max(...best.plan.ks) > 14;
			writer.bits(wide ? 1 : 0, 2);
			writer.bits(best.plan.order, 4);
			const size = block.length / (1 << best.plan.order);
			for (let part = 0; part < best.plan.ks.length; part++) {
				const k = best.plan.ks[part];
				writer.bits(k, wide ? 5 : 4);
				const from = part === 0 ? 0 : part * size - best.order;
				const to = (part + 1) * size - best.order;
				for (let index = from; index < to; index++) {
					const value = best.folded[index];
					writer.unary(value >> k);
					if (k > 0) writer.bits(value & (2 ** k - 1), k);
				}
			}
		} else {
			writer.bits(0b000001 << 1, 8); //VERBATIM
			for (let index = 0; index < block.length; index++) writer.bits(block[index], 16);
		}
	}
	writer.align();
	const crc = crc16(writer.bytes.subarray(start), writer.length - start);
	writer.bits(crc, 16);
}

/**
 * Encodes mono 16-bit frames as a FLAC stream (`fLaC`, STREAMINFO, then frames), lossless: the
 * decoder returns exactly `frames`. `rate` goes into STREAMINFO; the MD5 field stays zero, which
 * the format defines as "not computed".
 *
 * @example
 * ```ts
 * import { decodeFlac, encodeFlac } from '@datamoc/mwg/audio';
 *
 * const flac = encodeFlac(Int16Array.from([0, 100, 200, 100, 0]), 22050);
 * console.log(decodeFlac(flac).rate); // 22050
 * ```
 */
export function encodeFlac(frames: Int16Array, rate: number): Uint8Array {
	if (!(rate >= 1 && rate <= 655350 && Number.isInteger(rate))) {
		throw new Error(`a FLAC stream cannot state a sample rate of ${rate} Hz`);
	}
	const writer = new BitWriter();
	const sizes: number[] = [];
	for (let at = 0, number = 0; at < frames.length; at += BLOCK_SIZE, number++) {
		const before = writer.length;
		writeFrame(writer, frames.subarray(at, Math.min(at + BLOCK_SIZE, frames.length)), number);
		sizes.push(writer.length - before);
	}
	const info = new BitWriter();
	for (const byte of [0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34]) info.bits(byte, 8); //fLaC, last block, STREAMINFO, 34 bytes
	info.bits(Math.min(BLOCK_SIZE, Math.max(frames.length, 16)), 16);
	info.bits(BLOCK_SIZE, 16);
	info.bits(sizes.length ? Math.min(...sizes) : 0, 24);
	info.bits(sizes.length ? Math.max(...sizes) : 0, 24);
	info.bits(rate, 20);
	info.bits(0, 3); //one channel
	info.bits(15, 5); //16 bits
	info.bits(Math.floor(frames.length / 2 ** 32), 4);
	info.bits(frames.length % 2 ** 32, 32);
	for (let index = 0; index < 16; index++) info.bits(0, 8); //MD5 not computed
	const out = new Uint8Array(info.length + writer.length);
	out.set(info.bytes.subarray(0, info.length));
	out.set(writer.bytes.subarray(0, writer.length), info.length);
	return out;
}

/** reads bits most significant first from a byte range, throwing at its end */
class BitReader {
	private position = 0; //in bits
	private readonly bytes: Uint8Array;
	constructor(bytes: Uint8Array) {
		this.bytes = bytes;
	}

	get byteOffset(): number {
		return this.position >> 3;
	}

	get atEnd(): boolean {
		return this.position >= this.bytes.length * 8;
	}

	bits(n: number): number {
		if (this.position + n > this.bytes.length * 8) throw new Error('a FLAC stream ends in the middle of a frame');
		let value = 0;
		let remaining = n;
		while (remaining > 0) {
			const bitsLeft = 8 - (this.position & 7);
			const take = Math.min(bitsLeft, remaining);
			const byte = this.bytes[this.position >> 3];
			value = value * 2 ** take + ((byte >> (bitsLeft - take)) & ((1 << take) - 1));
			this.position += take;
			remaining -= take;
		}
		return value;
	}

	signed(n: number): number {
		const value = this.bits(n);
		return value >= 2 ** (n - 1) ? value - 2 ** n : value;
	}

	unary(): number {
		let zeros = 0;
		while (this.bits(1) === 0) zeros++;
		return zeros;
	}

	align(): void {
		this.position = (this.position + 7) & ~7;
	}
}

interface FrameHeader {
	blockSize: number;
	assignment: number;
	bps: number;
}

function readFrameHeader(reader: BitReader, streamBps: number): FrameHeader {
	if (reader.bits(14) !== 0b11111111111110)
		throw new Error('a FLAC frame does not start with its sync code: damaged stream');
	reader.bits(2); //reserved, blocking strategy
	const sizeCode = reader.bits(4);
	const rateCode = reader.bits(4);
	const assignment = reader.bits(4);
	if (assignment > 10) throw new Error('a FLAC frame uses a reserved channel assignment');
	const bpsCode = reader.bits(3);
	reader.bits(1);
	//the frame or sample number, a UTF-8-style code of up to seven bytes
	const lead = reader.bits(8);
	let extra = 0;
	for (let mask = 0x80; lead & mask && extra < 7; mask >>= 1) extra++;
	if (extra === 1 || extra > 6) throw new Error('a FLAC frame number is malformed');
	for (let index = 1; index < extra; index++) reader.bits(8);
	let blockSize: number;
	if (sizeCode === 0) throw new Error('a FLAC frame uses a reserved block size');
	else if (sizeCode === 1) blockSize = 192;
	else if (sizeCode <= 5) blockSize = 576 << (sizeCode - 2);
	else if (sizeCode === 6) blockSize = reader.bits(8) + 1;
	else if (sizeCode === 7) blockSize = reader.bits(16) + 1;
	else blockSize = 256 << (sizeCode - 8);
	if (rateCode === 12) reader.bits(8);
	else if (rateCode === 13 || rateCode === 14) reader.bits(16);
	else if (rateCode === 15) throw new Error('a FLAC frame uses an invalid sample rate code');
	reader.bits(8); //CRC-8
	const sizes = [streamBps, 8, 12, 0, 16, 20, 24, 0];
	const bps = sizes[bpsCode];
	if (!bps) throw new Error('a FLAC frame uses a sample size this reader does not support');
	return { blockSize, assignment, bps };
}

function readResidual(reader: BitReader, out: Int32Array, order: number, blockSize: number): void {
	const method = reader.bits(2);
	if (method > 1) throw new Error('a FLAC frame uses a reserved residual coding method');
	const partitionOrder = reader.bits(4);
	const parts = 1 << partitionOrder;
	if (blockSize % parts !== 0 || blockSize / parts < order) throw new Error('a FLAC residual partition is malformed');
	const size = blockSize / parts;
	const escape = method === 0 ? 15 : 31;
	let at = order;
	for (let part = 0; part < parts; part++) {
		const k = reader.bits(method === 0 ? 4 : 5);
		const count = part === 0 ? size - order : size;
		if (k === escape) {
			const width = reader.bits(5);
			for (let index = 0; index < count; index++) out[at++] = width === 0 ? 0 : reader.signed(width);
			continue;
		}
		for (let index = 0; index < count; index++) {
			const q = reader.unary();
			const folded = q * 2 ** k + (k > 0 ? reader.bits(k) : 0);
			out[at++] = folded % 2 === 0 ? folded / 2 : -(folded + 1) / 2;
		}
	}
}

function readSubframe(reader: BitReader, blockSize: number, bps: number): Int32Array {
	if (reader.bits(1) !== 0) throw new Error('a FLAC subframe header is malformed');
	const type = reader.bits(6);
	let wasted = 0;
	if (reader.bits(1)) wasted = reader.unary() + 1;
	const width = bps - wasted;
	if (width < 1 || width > 25) throw new Error('a FLAC subframe has a sample size this reader does not support');
	const out = new Int32Array(blockSize);
	if (type === 0) {
		out.fill(reader.signed(width));
	} else if (type === 1) {
		for (let index = 0; index < blockSize; index++) out[index] = reader.signed(width);
	} else if (type >= 8 && type <= 12) {
		const order = type - 8;
		if (order > blockSize) throw new Error('a FLAC subframe predictor is longer than its block');
		for (let index = 0; index < order; index++) out[index] = reader.signed(width);
		readResidual(reader, out, order, blockSize);
		for (let index = order; index < blockSize; index++) {
			const a = out[index - 1];
			const b = out[index - 2];
			const c = out[index - 3];
			const d = out[index - 4];
			const predicted =
				order === 0
					? 0
					: order === 1
						? a
						: order === 2
							? 2 * a - b
							: order === 3
								? 3 * a - 3 * b + c
								: 4 * a - 6 * b + 4 * c - d;
			out[index] += predicted;
		}
	} else if (type >= 32) {
		const order = type - 31;
		if (order > blockSize) throw new Error('a FLAC subframe predictor is longer than its block');
		for (let index = 0; index < order; index++) out[index] = reader.signed(width);
		const precision = reader.bits(4) + 1;
		if (precision === 16) throw new Error('a FLAC subframe has an invalid coefficient precision');
		const shift = reader.signed(5);
		if (shift < 0) throw new Error('a FLAC subframe has a negative prediction shift');
		const coefficients: number[] = [];
		for (let index = 0; index < order; index++) coefficients.push(reader.signed(precision));
		readResidual(reader, out, order, blockSize);
		for (let index = order; index < blockSize; index++) {
			let sum = 0;
			for (let tap = 0; tap < order; tap++) sum += coefficients[tap] * out[index - 1 - tap];
			out[index] += Math.floor(sum / 2 ** shift);
		}
	} else {
		throw new Error('a FLAC subframe uses a reserved type');
	}
	if (wasted > 0) for (let index = 0; index < blockSize; index++) out[index] *= 2 ** wasted;
	return out;
}

/**
 * Decodes a FLAC stream to mono 16-bit frames and the rate its STREAMINFO states. A stereo stream
 * keeps its left channel; a sample size other than 16 bits is shifted to 16. The stream's own
 * length and rate are checked against `maxFrames` (default {@link MAX_SAMPLE_FRAMES}) and the
 * rates a SoundFont can state before anything is allocated, since the bytes may come from a
 * downloaded font.
 *
 * @example
 * ```ts
 * import { decodeFlac, encodeFlac } from '@datamoc/mwg/audio';
 *
 * const { frames, rate } = decodeFlac(encodeFlac(Int16Array.from([1, 2, 3]), 8000));
 * console.log(frames.length, rate); // 3 8000
 * ```
 */
export function decodeFlac(
	bytes: Uint8Array,
	maxFrames: number = MAX_SAMPLE_FRAMES,
): { frames: Int16Array; rate: number } {
	if (bytes.length < 42 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'fLaC') {
		throw new Error('not a FLAC stream');
	}
	let at = 4;
	let streamInfo: Uint8Array | null = null;
	for (let last = false; !last;) {
		if (at + 4 > bytes.length) throw new Error('a FLAC stream ends inside its metadata');
		last = (bytes[at] & 0x80) !== 0;
		const type = bytes[at] & 0x7f;
		const size = (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
		if (at + 4 + size > bytes.length) throw new Error('a FLAC stream ends inside its metadata');
		if (type === 0) streamInfo = bytes.subarray(at + 4, at + 4 + size);
		at += 4 + size;
	}
	if (!streamInfo || streamInfo.length < 34) throw new Error('a FLAC stream has no STREAMINFO');
	const info = new BitReader(streamInfo);
	info.bits(16 + 16 + 24 + 24);
	const rate = info.bits(20);
	const channels = info.bits(3) + 1;
	const streamBps = info.bits(5) + 1;
	const total = info.bits(36);
	if (!(rate >= MIN_SAMPLE_RATE && rate <= MAX_SAMPLE_RATE)) {
		throw new Error(`a FLAC stream of ${rate} Hz is not a sample rate a SoundFont can state`);
	}
	if (total > maxFrames) throw new Error('a FLAC sample is longer than a SoundFont sample may be');

	const reader = new BitReader(bytes.subarray(at));
	const chunks: Int16Array[] = [];
	let length = 0;
	while (!reader.atEnd) {
		const header = readFrameHeader(reader, streamBps);
		length += header.blockSize;
		if (length > maxFrames) throw new Error('a FLAC sample is longer than a SoundFont sample may be');
		const plan = header.assignment < 8 ? header.assignment + 1 : 2;
		if (header.assignment < 8 ? header.assignment + 1 !== channels : channels !== 2) {
			throw new Error('a FLAC frame disagrees with its STREAMINFO about the channel count');
		}
		const decoded: Int32Array[] = [];
		for (let channel = 0; channel < plan; channel++) {
			//the side channel of a stereo mode carries one more bit
			const side =
				(header.assignment === 8 && channel === 1) ||
				(header.assignment === 9 && channel === 0) ||
				(header.assignment === 10 && channel === 1);
			decoded.push(readSubframe(reader, header.blockSize, header.bps + (side ? 1 : 0)));
		}
		reader.align();
		reader.bits(16); //CRC-16
		let left = decoded[0];
		if (header.assignment === 9) left = decoded[0].map((value, index) => value + decoded[1][index]);
		else if (header.assignment === 10) {
			left = decoded[0].map((mid, index) => {
				const side = decoded[1][index];
				return (mid * 2 + (side & 1) + side) >> 1;
			});
		}
		const shift = 16 - header.bps;
		chunks.push(
			Int16Array.from(left, (value) => (shift >= 0 ? value * 2 ** shift : Math.floor(value / 2 ** -shift))),
		);
	}
	const frames = new Int16Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		frames.set(chunk, offset);
		offset += chunk.length;
	}
	return { frames, rate };
}

/**
 * {@link encodeFlac} as a {@link SoundFontSampleEncoder}, for `encodeSoundFont(font, flacSampleEncoder, 'flac')`
 *
 * @example
 * ```ts
 * import { flacSampleEncoder } from '@datamoc/mwg/audio';
 *
 * console.log((await flacSampleEncoder(Int16Array.from([0, 1, 2]), 22050, 'flac')).length);
 * ```
 */
export const flacSampleEncoder: SoundFontSampleEncoder = (frames, rate, codec) => {
	if (codec !== 'flac') throw new Error(`flacSampleEncoder writes FLAC, not ${codec}`);
	return encodeFlac(frames, rate);
};

/**
 * {@link decodeFlac} as a {@link SoundFontSampleDecoder}: FLAC samples only, so a font written with
 * `flacSampleEncoder` loads in Node or a browser with no WebAudio
 *
 * @example
 * ```ts
 * import { encodeFlac, flacSampleDecoder } from '@datamoc/mwg/audio';
 *
 * const flac = encodeFlac(Int16Array.from([0, 1, 2]), 22050);
 * console.log(flacSampleDecoder(flac, 22050, 'flac'));
 * ```
 */
export const flacSampleDecoder: SoundFontSampleDecoder = (bytes, rate, codec) => {
	if (codec !== 'flac') throw new Error(`flacSampleDecoder reads FLAC, not ${codec}`);
	const decoded = decodeFlac(bytes);
	if (decoded.rate !== rate)
		throw new Error(`a FLAC sample states ${decoded.rate} Hz but its font header states ${rate} Hz`);
	return decoded.frames;
};
