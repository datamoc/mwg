import type { BlockSource } from './StreamChannel.ts';

/**
 * Guards for decoders of formats that carry machine code or compressed payloads (NSF, SID, SPC,
 * a tracker with a packed sample bank, an LHA or DEFLATE archive): all of them are untrusted
 * input, and "it ran a long time" or "it grew enormous" is a failure the format itself cannot
 * be asked to prevent. Every limit is named, defaulted and raised by the caller, and every
 * breach is one `DecodeBudgetError` that says which limit and why, never a hang or a crash.
 */
export interface DecoderLimits {
	/** refuse input larger than this many bytes; 16 MiB */
	maxInputBytes: number;
	/** refuse to inflate past this many bytes of output, the bound on a zip bomb; 64 MiB */
	maxOutputBytes: number;
	/** emulated instructions allowed per second of sound produced; 4 million */
	maxInstructionsPerSecond: number;
	/** stop a stream after this many seconds of output, whatever the file says; 3600 */
	maxSeconds: number;
	/** a read that takes longer than this multiple of the audio it produced counts as starved; 1 */
	maxRealtimeRatio: number;
	/** consecutive starved reads before the stream is cut; 8 */
	maxStarvedReads: number;
}

/**
 * The decoder limits every guard starts from, before a caller raises or lowers one.
 *
 * @example
 * ```ts
 * import { DEFAULT_DECODER_LIMITS } from '@datamoc/mwg/audio';
 *
 * console.log(DEFAULT_DECODER_LIMITS.maxInputBytes); // 16777216
 * ```
 */
export const DEFAULT_DECODER_LIMITS: Readonly<DecoderLimits> = Object.freeze({
	maxInputBytes: 16 * 1024 * 1024,
	maxOutputBytes: 64 * 1024 * 1024,
	maxInstructionsPerSecond: 4_000_000,
	maxSeconds: 3600,
	maxRealtimeRatio: 1,
	maxStarvedReads: 8,
});

/** which limit a `DecodeBudgetError` is about */
export type DecoderLimitName = keyof DecoderLimits;

/**
 * A decoder went past a limit; carries the limit's name so a game can say what to raise or
 * what to refuse.
 *
 * @example
 * ```ts
 * import { DecodeBudgetError } from '@datamoc/mwg/audio';
 *
 * const error = new DecodeBudgetError('maxInputBytes', 'tune.nsf is larger than the limit');
 * console.log(error.limit); // 'maxInputBytes'
 * ```
 */
export class DecodeBudgetError extends Error {
	readonly limit: DecoderLimitName;

	constructor(limit: DecoderLimitName, message: string) {
		super(message);
		this.name = 'DecodeBudgetError';
		this.limit = limit;
	}
}

/**
 * Merges a partial override over the defaults and rejects values that cannot be limits.
 *
 * @example
 * ```ts
 * import { decoderLimits } from '@datamoc/mwg/audio';
 *
 * console.log(decoderLimits({ maxSeconds: 600 }).maxSeconds); // 600
 * ```
 */
export function decoderLimits(overrides: Partial<DecoderLimits> = {}): DecoderLimits {
	const limits = { ...DEFAULT_DECODER_LIMITS, ...overrides };
	for (const [name, value] of Object.entries(limits)) {
		if (!(value > 0)) throw new Error(`decoder limit ${name} must be positive`);
	}
	return limits;
}

/**
 * Throws when input is bigger than `maxInputBytes`, before a decoder has touched it.
 *
 * @example
 * ```ts
 * import { assertInputSize } from '@datamoc/mwg/audio';
 *
 * declare const bytes: Uint8Array;
 *
 * assertInputSize(bytes, { maxInputBytes: 1_000_000 }, 'tune.nsf');
 * ```
 */
export function assertInputSize(
	input: { byteLength: number },
	limits: Partial<DecoderLimits> = {},
	label = 'input',
): void {
	const { maxInputBytes } = decoderLimits(limits);
	if (input.byteLength > maxInputBytes) {
		throw new DecodeBudgetError(
			'maxInputBytes',
			`${label} is ${input.byteLength} bytes, over the ${maxInputBytes} byte limit`,
		);
	}
}

/**
 * A count of emulated instructions an emulator spends as it runs. The emulator calls `spend`
 * from its dispatch loop (once per instruction, or once per batch); past the allowance it
 * throws, so a tune that loops forever without producing sound ends the render instead of
 * hanging it.
 *
 * @example
 * ```ts
 * import { InstructionBudget } from '@datamoc/mwg/audio';
 *
 * const budget = InstructionBudget.forSeconds(30);
 * function runFrame(cycles: number): void {
 * 	budget.spend(cycles);
 * }
 * runFrame(20000);
 * console.log(budget.remaining);
 * ```
 */
export class InstructionBudget {
	private left: number;

	constructor(allowance: number) {
		if (!(allowance > 0)) throw new Error('instruction allowance must be positive');
		this.left = allowance;
	}

	/** the allowance for rendering this many seconds of sound under the limits' per-second rate */
	static forSeconds(seconds: number, limits: Partial<DecoderLimits> = {}): InstructionBudget {
		const { maxInstructionsPerSecond } = decoderLimits(limits);
		return new InstructionBudget(Math.max(1, Math.ceil(seconds * maxInstructionsPerSecond)));
	}

	get remaining(): number {
		return this.left;
	}

	spend(count = 1): void {
		this.left -= count;
		if (this.left < 0) {
			throw new DecodeBudgetError(
				'maxInstructionsPerSecond',
				'the emulated program ran past its instruction budget',
			);
		}
	}
}

/**
 * Inflates a raw DEFLATE stream while counting the output, so a few kilobytes that expand into
 * gigabytes are refused after `maxOutputBytes`, not after they have filled memory.
 *
 * @example
 * ```ts
 * import { inflateBounded } from '@datamoc/mwg/audio';
 *
 * declare const packed: Uint8Array;
 *
 * const bytes = await inflateBounded(packed, { maxOutputBytes: 1_000_000 });
 * ```
 */
export async function inflateBounded(
	packed: Uint8Array,
	limits: Partial<DecoderLimits> = {},
	format: 'deflate-raw' | 'deflate' | 'gzip' = 'deflate-raw',
): Promise<Uint8Array> {
	const { maxOutputBytes } = decoderLimits(limits);
	const stream = new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxOutputBytes) {
			await reader.cancel();
			throw new DecodeBudgetError('maxOutputBytes', `inflated data passed the ${maxOutputBytes} byte limit`);
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

export interface GuardOptions {
	/** replaces `performance.now` so a test controls the clock */
	now?: () => number;
}

/**
 * Wraps a `BlockSource` so a misbehaving decoder cannot hurt the game: a read that claims more
 * frames than it was given room for is an error, non-finite or wildly loud samples are zeroed
 * or clamped, the stream ends at `maxSeconds` whatever the file says, and a source that keeps
 * taking longer to produce audio than the audio lasts is cut after `maxStarvedReads` in a row
 * rather than being allowed to starve the page.
 *
 * @example
 * ```ts
 * import { guardBlockSource, type BlockSource } from '@datamoc/mwg/audio';
 *
 * declare const untrusted: BlockSource;
 *
 * const safe = guardBlockSource(untrusted, { maxSeconds: 600 });
 * ```
 */
export function guardBlockSource(
	source: BlockSource,
	overrides: Partial<DecoderLimits> = {},
	options: GuardOptions = {},
): BlockSource {
	const limits = decoderLimits(overrides);
	const now = options.now ?? (() => performance.now());
	const maxFrames = Math.floor(limits.maxSeconds * source.sampleRate);
	let produced = 0;
	let starved = 0;
	return {
		sampleRate: source.sampleRate,
		get length() {
			return source.length === undefined ? undefined : Math.min(source.length, maxFrames);
		},
		read(left, right, start, count) {
			const allowed = Math.min(count, Math.max(0, maxFrames - produced));
			if (allowed === 0) return 0;
			const before = now();
			const got = source.read(left, right, start, allowed);
			const elapsedMs = now() - before;
			if (!(got >= 0) || got > allowed) {
				throw new DecodeBudgetError(
					'maxOutputBytes',
					`a source returned ${got} frames for a request of ${allowed}`,
				);
			}
			for (let i = start; i < start + got; i++) {
				const l = left[i];
				const r = right[i];
				left[i] = Number.isFinite(l) ? Math.max(-4, Math.min(4, l)) : 0;
				right[i] = Number.isFinite(r) ? Math.max(-4, Math.min(4, r)) : 0;
			}
			produced += got;
			const audioMs = (got / source.sampleRate) * 1000;
			starved = got > 0 && elapsedMs > audioMs * limits.maxRealtimeRatio ? starved + 1 : 0;
			if (starved >= limits.maxStarvedReads) {
				throw new DecodeBudgetError(
					'maxRealtimeRatio',
					`a source took longer than real time to render ${starved} reads in a row`,
				);
			}
			return got;
		},
		seek(frame) {
			source.seek(frame);
			produced = Math.min(frame, maxFrames);
		},
	};
}
