import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	chance,
	element,
	float,
	int,
	normalRange,
	range,
	shuffle,
	weighted,
	weightedKey,
	withSeed,
} from '../src/core/Random.ts';

import type { FloatSource } from '../src/core/Random.ts';

/**
 * P39: helpers that draw floats only (`float`, `chance`, `weighted`, `weightedKey`)
 * accept the narrower `FloatSource`, so a float-only stream needs no dead `int`.
 * Helpers that may draw integers (`int`, `range`, `normalRange`, `element`,
 * `shuffle`) keep requiring the full `RandomSource` - `element` included, because
 * it draws through `int()` and re-spelling that draw would change its stream.
 */

const quarter: FloatSource = { float: () => 0.25 };

test('a float-only source drives every float helper to its exact arithmetic', () => {
	assert.equal(float(undefined, undefined, quarter), 0.25);
	assert.equal(float(10, undefined, quarter), 2.5);
	assert.equal(float(2, 6, quarter), 3);
	assert.equal(chance(0.5, quarter), true);
	assert.equal(chance(0.25, quarter), false);
	assert.equal(weighted([1, 3], quarter), 1);
	assert.equal(weighted([3, 1], quarter), 0);
	assert.equal(
		weightedKey(
			new Map([
				['a', 3],
				['b', 1],
			]),
			quarter,
		),
		'a',
	);
});

test('a varying float-only source steers picks across the whole range', () => {
	const values = [0.0, 0.99];
	let calls = 0;
	const alternating: FloatSource = {
		float: () => values[calls++ % values.length],
	};
	assert.equal(weighted([1, 1], alternating), 0);
	assert.equal(weighted([1, 1], alternating), 1);
	assert.equal(chance(0.5, alternating), true);
	assert.equal(chance(0.5, alternating), false);
});

test('float-only draws leave the ambient stream untouched', () => {
	const before = withSeed(777, () => {
		weighted([1, 1, 1], quarter);
		chance(0.5, quarter);
		return float();
	});
	assert.equal(
		before,
		withSeed(777, () => float()),
	);
});

test('the int-drawing helpers reject a float-only source at the types, and fail loud past them', () => {
	//the static rejection above is the contract; past the types (plain JS callers)
	//the missing int must throw rather than silently mis-draw
	const attempts = [
		() => {
			// @ts-expect-error - int draws integers: a float-only source is not enough
			int(6, undefined, quarter);
		},
		() => {
			// @ts-expect-error - range draws integers: a float-only source is not enough
			range(1, 6, quarter);
		},
		() => {
			// @ts-expect-error - element draws through int(): a float-only source is not enough
			element(['a', 'b'], quarter);
		},
		() => {
			// @ts-expect-error - shuffle draws integers: a float-only source is not enough
			shuffle([1, 2, 3], quarter);
		},
	];
	assert.equal(attempts.length, 4);
	for (const attempt of attempts) assert.throws(attempt);
	// @ts-expect-error - normalRange returns integers, so it stays on the wide type even
	// though it only calls float(): a float-only source is not enough
	normalRange(1, 6, quarter);
});
