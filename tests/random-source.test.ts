import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	Generator,
	MersenneTwister,
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

/**
 * P33: every derived helper draws from the ambient stream by default and from an
 * injected `RandomSource` when one is passed. A journaled rule receives its randomness
 * through its own snapshot-able stream, so the injected path must produce exactly the
 * same draws the ambient path would - and must leave the ambient stream untouched.
 */

test('each derived helper draws identically from the ambient stream and from an injected stream of the same seed', () => {
	const weights = [1, 2, 3, 0];
	const keys = new Map([
		['a', 1],
		['b', 3],
	]);

	const ambient = withSeed(4242, () => ({
		float: float(),
		floatMax: float(10),
		floatRange: float(2, 5),
		int: int(100),
		intRange: range(1, 6),
		normal: normalRange(1, 6),
		chance: chance(0.5),
		element: element(['x', 'y', 'z']),
		weighted: weighted(weights),
		weightedKey: weightedKey(keys),
		shuffled: shuffle([1, 2, 3, 4, 5]),
	}));

	const injected = new Generator(4242);
	const drawn = {
		float: float(undefined, undefined, injected),
		floatMax: float(10, undefined, injected),
		floatRange: float(2, 5, injected),
		int: int(100, undefined, injected),
		intRange: range(1, 6, injected),
		normal: normalRange(1, 6, injected),
		chance: chance(0.5, injected),
		element: element(['x', 'y', 'z'], injected),
		weighted: weighted(weights, injected),
		weightedKey: weightedKey(keys, injected),
		shuffled: shuffle([1, 2, 3, 4, 5], injected),
	};

	assert.deepEqual(drawn, ambient);
});

test('drawing through an injected source does not consume the ambient stream', () => {
	const before = withSeed(777, () => {
		const stream = new Generator(1);
		weighted([1, 1, 1], stream);
		element(['a', 'b'], stream);
		return float();
	});
	const after = withSeed(777, () => float());
	assert.equal(before, after);
});

test('injected draws keep the null-reporting conventions: empty picks stay null, never -1 or undefined', () => {
	const stream = new Generator(5);
	assert.equal(element([], stream), null);
	assert.equal(weighted([], stream), null);
	assert.equal(weighted([0, 0, 0], stream), null);
	assert.equal(weightedKey(new Map(), stream), null);
	assert.equal(
		weightedKey(
			new Map([
				['a', 0],
				['b', 0],
			]),
			stream,
		),
		null,
	);
});

test('a MersenneTwister stream is a usable injected source wherever a Generator is', () => {
	const twister = new MersenneTwister(5489);
	const first = weighted([1, 1, 1, 1], twister);
	assert.ok(first === null || (first >= 0 && first < 4), 'an index in range or null');

	const again = new MersenneTwister(5489);
	assert.equal(weighted([1, 1, 1, 1], again), first, 'same seed, same injected draw');
});
