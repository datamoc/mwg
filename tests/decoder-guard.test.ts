import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	DecodeBudgetError,
	InstructionBudget,
	assertInputSize,
	decoderLimits,
	guardBlockSource,
	inflateBounded,
} from '../src/audio/DecoderGuard.ts';
import { StreamChannel, type BlockSource } from '../src/audio/StreamChannel.ts';
import { FakeAudioContext, FakeBlockSource } from '../src/testing/FakeAudio.ts';

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

test('limits default sensibly and refuse values that cannot be limits', () => {
	assert.equal(decoderLimits().maxInputBytes, 16 * 1024 * 1024);
	assert.equal(decoderLimits({ maxSeconds: 10 }).maxSeconds, 10);
	assert.throws(() => decoderLimits({ maxSeconds: 0 }), /maxSeconds must be positive/);
});

test('an oversized input is refused by limit name before any decoding', () => {
	assert.doesNotThrow(() => assertInputSize({ byteLength: 10 }, { maxInputBytes: 10 }));
	assert.throws(
		() => assertInputSize({ byteLength: 11 }, { maxInputBytes: 10 }, 'tune.nsf'),
		(error: unknown) =>
			error instanceof DecodeBudgetError && error.limit === 'maxInputBytes' && /tune\.nsf/.test(error.message),
	);
});

test('an emulator that spends past its instruction budget is stopped', () => {
	const budget = InstructionBudget.forSeconds(2, { maxInstructionsPerSecond: 1000 });
	assert.equal(budget.remaining, 2000);
	budget.spend(1500);
	assert.throws(
		() => budget.spend(600),
		(error: unknown) => error instanceof DecodeBudgetError && error.limit === 'maxInstructionsPerSecond',
	);
	assert.throws(() => new InstructionBudget(0), /positive/);
});

test('a zip bomb is refused once the output passes the limit, and honest data inflates whole', async () => {
	const honest = new Uint8Array(5000).map((_, i) => i % 7);
	assert.deepEqual(await inflateBounded(await deflateRaw(honest), { maxOutputBytes: 10_000 }), honest);
	const bomb = await deflateRaw(new Uint8Array(4_000_000));
	assert.ok(bomb.byteLength < 10_000, 'a few kilobytes of input');
	await assert.rejects(
		inflateBounded(bomb, { maxOutputBytes: 100_000 }),
		(error: unknown) => error instanceof DecodeBudgetError && error.limit === 'maxOutputBytes',
	);
});

test('a guarded source cleans samples, caps the length and keeps the rate', () => {
	const hostile: BlockSource = {
		sampleRate: 100,
		read(left, right, start, count) {
			left.fill(Number.NaN, start, start + count);
			right.fill(1000, start, start + count);
			return count;
		},
		seek() {},
	};
	const guarded = guardBlockSource(hostile, { maxSeconds: 1 });
	const left = new Float32Array(150);
	const right = new Float32Array(150);
	assert.equal(guarded.sampleRate, 100);
	assert.equal(guarded.read(left, right, 0, 150), 100, 'ends at one second whatever the source offers');
	assert.equal(guarded.read(left, right, 0, 50), 0);
	assert.equal(left[0], 0);
	assert.equal(right[0], 4);
	assert.equal(guarded.length, undefined);
});

test('a source that claims more frames than it was asked for is an error', () => {
	const lying: BlockSource = { sampleRate: 100, read: (_l, _r, _s, count) => count + 1, seek() {} };
	assert.throws(
		() => guardBlockSource(lying).read(new Float32Array(8), new Float32Array(8), 0, 4),
		DecodeBudgetError,
	);
});

test('a source slower than real time for too many reads in a row is cut, a fast one resets the count', () => {
	let clock = 0;
	let slow = true;
	const source: BlockSource = {
		sampleRate: 1000,
		read(_l, _r, _s, count) {
			clock += slow ? 50 : 1; //50 ms to produce 10 ms of audio
			return count;
		},
		seek() {},
	};
	const guarded = guardBlockSource(source, { maxStarvedReads: 3 }, { now: () => clock });
	const left = new Float32Array(10);
	const right = new Float32Array(10);
	guarded.read(left, right, 0, 10);
	guarded.read(left, right, 0, 10);
	slow = false;
	guarded.read(left, right, 0, 10);
	slow = true;
	guarded.read(left, right, 0, 10);
	guarded.read(left, right, 0, 10);
	assert.throws(
		() => guarded.read(left, right, 0, 10),
		(error: unknown) => error instanceof DecodeBudgetError && error.limit === 'maxRealtimeRatio',
	);
});

test('a source that throws stops the channel and reports the error instead of escaping a timer', () => {
	const context = new FakeAudioContext();
	const channel = new StreamChannel(context.asContext(), undefined, { pumpMs: 0 });
	const errors: Error[] = [];
	channel.onError.add((error) => {
		errors.push(error);
	});
	const exploding = new FakeBlockSource();
	exploding.read = () => {
		throw new DecodeBudgetError('maxInstructionsPerSecond', 'ran away');
	};
	channel.play(exploding);
	assert.equal(channel.isPlaying, false);
	assert.equal(errors.length, 1);
	assert.match(errors[0].message, /ran away/);
});
