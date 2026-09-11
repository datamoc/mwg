import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MersenneTwister, RandomStreams } from '../src/core/Random.ts';

/**
 * The reference MT19937 test vector: seed 5489 (the engine's default seed) and the first ten
 * tempered outputs. These are the same numbers every MT19937 implementation produces, which
 * is what makes "compatible engine" checkable rather than asserted.
 */
const MT19937_SEED_5489 = [
	3499211612, 581869302, 3890346734, 3586334585, 545404204, 4161255391, 3922919429, 949333985, 2715962298, 1323567403,
];

test('the engine matches the MT19937 test vector for the default seed', () => {
	const rng = new MersenneTwister(5489);
	const produced = MT19937_SEED_5489.map(() => rng.nextUint32());
	assert.deepEqual(produced, MT19937_SEED_5489);
});

test('the same seed produces the same stream, and a different seed does not', () => {
	const a = new MersenneTwister(7);
	const b = new MersenneTwister(7);
	const c = new MersenneTwister(8);

	assert.deepEqual(
		[a.nextUint32(), a.nextUint32(), a.nextUint32()],
		[b.nextUint32(), b.nextUint32(), b.nextUint32()],
	);
	assert.notEqual(c.nextUint32(), new MersenneTwister(7).nextUint32());
});

test('discard skips values without consuming them out of order', () => {
	const fresh = new MersenneTwister(99);
	const reference = [fresh.nextUint32(), fresh.nextUint32(), fresh.nextUint32(), fresh.nextUint32()];

	const skipping = new MersenneTwister(99);
	skipping.discard(2);
	assert.equal(skipping.nextUint32(), reference[2]);
	assert.equal(skipping.nextUint32(), reference[3]);
});

test('discardCount counts every value produced, including discarded ones', () => {
	const rng = new MersenneTwister(1);
	assert.equal(rng.discardCount, 0);
	rng.nextUint32();
	assert.equal(rng.discardCount, 1);
	rng.discard(10);
	assert.equal(rng.discardCount, 11, 'discarded values count too, as get_discard() reports');

	rng.seed(2);
	assert.equal(rng.discardCount, 0, 'seeding resets the count');
});

test('getState/setState resumes the exact stream', () => {
	const rng = new MersenneTwister(1234);
	rng.nextUint32();
	rng.nextUint32();
	const saved = rng.getState();
	const expected = [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()];

	const resumed = new MersenneTwister(1);
	resumed.setState(saved);
	assert.deepEqual([resumed.nextUint32(), resumed.nextUint32(), resumed.nextUint32()], expected);
});

test('float is in [0, 1) and int is in [0, bound)', () => {
	const rng = new MersenneTwister(5);
	for (let i = 0; i < 100; i++) {
		const value = rng.float();
		assert.ok(value >= 0 && value < 1, `float ${value} is in range`);
		const roll = rng.int(6);
		assert.ok(Number.isInteger(roll) && roll >= 0 && roll < 6, `int ${roll} is in range`);
	}
	assert.equal(rng.int(0), 0);
	assert.equal(rng.int(-3), 0);
});

test('two named streams draw independently of each other', () => {
	const one = new RandomStreams(42);
	const two = new RandomStreams(42);

	const loot = one.stream('loot');
	const ai = one.stream('ai:goblin-3');

	//the loot draws must not move the ai stream
	const expectedAi = two.stream('ai:goblin-3').nextUint32();
	loot.nextUint32();
	loot.nextUint32();
	loot.nextUint32();
	assert.equal(ai.nextUint32(), expectedAi);
});

test('creating a later stream does not disturb one already in use', () => {
	//whatever order the streams are created in, 'first' is the same stream
	const plain = new RandomStreams(7);
	const expected = plain.stream('first').nextUint32();

	const withAnEarlierStream = new RandomStreams(7);
	withAnEarlierStream.stream('second').nextUint32();
	assert.equal(withAnEarlierStream.stream('first').nextUint32(), expected);
});

test('a stream is derived from the base seed and its own name', () => {
	const streams = new RandomStreams(7);
	assert.equal(streams.seedOf('loot'), undefined, 'no seed before the stream has been asked for');

	streams.stream('loot');
	const lootSeed = streams.seedOf('loot');
	assert.equal(typeof lootSeed, 'number');
	assert.equal(streams.seedOf('loot'), lootSeed, 'the derived seed is stable');
	assert.deepEqual(streams.names(), ['loot']);

	//the same name under the same base seed derives the same stream, a different base seed does not
	const same = new RandomStreams(7);
	same.stream('loot');
	assert.equal(same.seedOf('loot'), lootSeed);

	const other = new RandomStreams(8);
	other.stream('loot');
	assert.notEqual(other.seedOf('loot'), lootSeed);
});

test('RandomStreams getState/setState round-trips every stream position', () => {
	const streams = new RandomStreams(31337);
	streams.stream('loot').int(100);
	streams.stream('ai').int(100);
	const saved = streams.getState();

	const expectedLoot = [streams.stream('loot').nextUint32(), streams.stream('loot').nextUint32()];
	const expectedAi = streams.stream('ai').nextUint32();

	const resumed = new RandomStreams(1); // a different base seed: only the saved state should matter
	resumed.setState(saved);
	assert.deepEqual([resumed.stream('loot').nextUint32(), resumed.stream('loot').nextUint32()], expectedLoot);
	assert.equal(resumed.stream('ai').nextUint32(), expectedAi);
	assert.equal(resumed.seedOf('loot'), streams.seedOf('loot'));
});

test('reseed drops every stream rather than resetting it', () => {
	const streams = new RandomStreams(1);
	streams.stream('a').nextUint32();
	streams.reseed(2);
	assert.deepEqual(streams.names(), [], 'the stream is gone');
	assert.equal(streams.seedOf('a'), undefined);

	//and a stream rebuilt under the new seed is the same as a fresh registry's
	const rebuilt = streams.stream('a').nextUint32();
	assert.equal(rebuilt, new RandomStreams(2).stream('a').nextUint32());
});
