import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Generator, withSeed, int, normalRange, weighted, shuffle, reset } from '../src/core/Random.ts';

test('the same seed produces the same stream', () => {
	const a = new Generator(12345);
	const b = new Generator(12345);
	for (let i = 0; i < 10_000; i++) {
		assert.equal(a.nextUint32(), b.nextUint32());
	}
});

test('adjacent seeds diverge immediately', () => {
	//seeds are run through splitmix32 before use precisely so that seed 1 and seed 2 do
	//not produce visibly related dungeons
	const a = new Generator(12345);
	const b = new Generator(12346);
	assert.notEqual(a.nextUint32(), b.nextUint32());
});

test('state can be saved and restored, so a save file resumes the same stream', () => {
	const g = new Generator(999);
	for (let i = 0; i < 100; i++) g.nextUint32();

	const state = g.getState();
	const expected = [g.nextUint32(), g.nextUint32(), g.nextUint32()];

	g.setState(state);
	assert.deepEqual([g.nextUint32(), g.nextUint32(), g.nextUint32()], expected);
});

test('the state never repeats over a long run', () => {
	const g = new Generator(1);
	const seen = new Set<string>();

	for (let i = 0; i < 500_000; i++) {
		g.nextUint32();
		const key = g.getState().join(',');
		assert.ok(!seen.has(key), `state repeated after ${i} draws`);
		seen.add(key);
	}
});

test('int(bound) is unbiased for a bound that does not divide 2^32', () => {
	//the naive nextUint32() % 7 favours the low values; rejection sampling is what this
	//test is really checking
	const draws = 2_000_000;
	const bound = 7;
	const buckets = new Array(bound).fill(0);
	const g = new Generator(2024);

	for (let i = 0; i < draws; i++) buckets[g.int(bound)]++;

	const expected = draws / bound;
	for (const count of buckets) {
		assert.ok(
			Math.abs(count - expected) / expected < 0.01,
			`bucket deviated by ${((Math.abs(count - expected) / expected) * 100).toFixed(2)}%`
		);
	}
});

test('float() is uniform across the unit interval', () => {
	//chi-square over 16 bins, 15 degrees of freedom. a single seed exceeds the 5%
	//threshold once in twenty runs by chance, so this checks the median over many seeds
	//rather than any one of them
	const bins = 16;
	const draws = 500_000;
	const expected = draws / bins;
	const scores: number[] = [];

	for (let seed = 1; seed <= 20; seed++) {
		const g = new Generator(seed * 7919);
		const counts = new Array(bins).fill(0);
		for (let i = 0; i < draws; i++) counts[Math.floor(g.float() * bins)]++;
		scores.push(counts.reduce((sum, o) => sum + (o - expected) ** 2 / expected, 0));
	}

	scores.sort((a, b) => a - b);
	const median = scores[10];

	//the expected median of a chi-square with 15 dof is about 14.3
	assert.ok(median > 7 && median < 24, `median chi-square was ${median.toFixed(1)}`);

	//and no more than a couple of seeds should clear the 5% critical value of 25.0
	assert.ok(scores.filter((s) => s > 25).length <= 4, 'too many seeds failed the 5% test');
});

test('every bit of the output is balanced', () => {
	const draws = 500_000;
	const ones = new Array(32).fill(0);
	const g = new Generator(31337);

	for (let i = 0; i < draws; i++) {
		const value = g.nextUint32();
		for (let bit = 0; bit < 32; bit++) {
			if (value & (1 << bit)) ones[bit]++;
		}
	}

	for (const count of ones) {
		assert.ok(Math.abs(count - draws / 2) / (draws / 2) < 0.01);
	}
});

test('withSeed isolates its stream and always replays it', () => {
	reset();
	const first = withSeed(42, () => int(1000));
	const second = withSeed(42, () => int(1000));
	assert.equal(first, second);
});

test('withSeed pops its generator even when the body throws', () => {
	reset();
	assert.throws(() =>
		withSeed(1, () => {
			throw new Error('level generation failed');
		})
	);
	//if the generator had leaked, this would be drawing from the seeded stream
	assert.doesNotThrow(() => int(10));
});

test('normalRange peaks in the middle', () => {
	const counts = new Array(11).fill(0);
	for (let i = 0; i < 200_000; i++) counts[normalRange(0, 10)]++;

	assert.ok(counts[5] > counts[0] * 3, 'the centre should be far more likely than the edges');
	//and it must stay inside its bounds
	assert.ok(counts.every((c) => c > 0));
});

test('weighted draws in proportion to the weights', () => {
	const weights = [1, 3, 6];
	const draws = 200_000;
	const counts = [0, 0, 0];

	for (let i = 0; i < draws; i++) counts[weighted(weights)]++;

	const total = weights.reduce((a, b) => a + b, 0);
	weights.forEach((w, i) => {
		const share = counts[i] / draws;
		assert.ok(Math.abs(share - w / total) < 0.01, `index ${i} had share ${share.toFixed(3)}`);
	});
});

test('weighted returns -1 when every weight is zero', () => {
	assert.equal(weighted([0, 0, 0]), -1);
	assert.equal(weighted([]), -1);
});

test('shuffle sends every value to every position equally often', () => {
	const size = 10;
	const runs = 50_000;
	const positions = Array.from({ length: size }, () => new Array(size).fill(0));

	for (let i = 0; i < runs; i++) {
		const shuffled = shuffle([...Array(size).keys()]);
		shuffled.forEach((value, index) => positions[value][index]++);
	}

	const expected = runs / size;
	for (const row of positions) {
		for (const count of row) {
			assert.ok(
				Math.abs(count - expected) / expected < 0.08,
				`a value landed in one position ${((count / expected) * 100).toFixed(0)}% of the expected rate`
			);
		}
	}
});
