import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JavaRandom } from '../src/core/JavaRandom.ts';
import type { JavaRandomDraw } from '../src/core/JavaRandom.ts';

//Reference values are what `java.util.Random` returns for these seeds.
test('the first draws match java.util.Random for well-known seeds', () => {
	assert.equal(new JavaRandom(0).nextInt(), -1155484576);
	assert.equal(new JavaRandom(42).nextInt(), -1170105035);
	assert.equal(new JavaRandom(0).nextDouble(), 0.730967787376657);
	assert.equal(new JavaRandom(42).nextDouble(), 0.7275636800328681);
});

test('nextInt(bound) stays in range, and a power of two takes the high bits', () => {
	const random = new JavaRandom(7);
	for (let i = 0; i < 500; i++) {
		const value = random.nextInt(10);
		assert.equal(value >= 0 && value < 10, true);
	}
	const a = new JavaRandom(99);
	const b = new JavaRandom(99);
	assert.equal(a.nextInt(16), Math.floor((16 * b.next(31)) / 0x80000000));
	assert.throws(() => a.nextInt(0), /bound/);
});

test('nextLong combines two signed draws and nextBoolean reads one bit', () => {
	const a = new JavaRandom(5);
	const b = new JavaRandom(5);
	const high = BigInt(b.next(32));
	const low = BigInt(b.next(32));
	assert.equal(a.nextLong(), BigInt.asIntN(64, (high << 32n) + low));
	assert.equal(typeof new JavaRandom(1).nextBoolean(), 'boolean');
});

test('setSeed restarts the sequence and a bigint seed matches its number', () => {
	const random = new JavaRandom(3);
	const first = random.nextInt();
	random.nextInt();
	random.setSeed(3n);
	assert.equal(random.nextInt(), first);
	assert.equal(new JavaRandom(-1).nextInt(), new JavaRandom(-1n).nextInt());
});

test('onDraw sees every underlying draw with its bit count', () => {
	const draws: JavaRandomDraw[] = [];
	const random = new JavaRandom(42, { onDraw: (draw) => draws.push(draw) });
	random.nextInt();
	random.nextDouble();
	random.nextBoolean();
	assert.deepEqual(
		draws.map((d) => d.bits),
		[32, 26, 27, 1],
	);
	assert.equal(draws[0].value, -1170105035);
});
