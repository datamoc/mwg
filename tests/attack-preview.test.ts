import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AttackPreview } from '../src/battle/AttackPreview.ts';

/**
 * The attack preview (item 265): the damage totals a dialog prints and the frame timeline it
 * animates, from damage the game computed. The boundaries are at 0, at the last frame, and on a
 * strike that misses.
 */

const preview = (overrides: Partial<ConstructorParameters<typeof AttackPreview>[0]> = {}) =>
	new AttackPreview({
		attacker: { hp: 20 },
		defender: { hp: 12 },
		damage: 4,
		strikes: 3,
		strikeDuration: 0.2,
		...overrides,
	});

test('the totals are the maximum damage and the chance-weighted expected damage', () => {
	const full = preview();
	assert.equal(full.totalDamage, 12);
	assert.equal(full.expectedDamage, 12, 'no chance given means every strike lands');

	const half = preview({ chanceToHit: 0.5 });
	assert.equal(half.expectedDamage, 6);
	assert.equal(half.totalDamage, 12, 'the maximum is unchanged by the chance');
});

test('a frame per strike drops the defender hp and floors at zero', () => {
	const frames = preview().frames;
	assert.equal(frames.length, 4, 'before the first strike and after each of the three');
	assert.deepEqual(
		frames.map((frame) => frame.defenderHp),
		[12, 8, 4, 0],
	);
	assert.equal(frames[3].defenderDamage, 12);
});

test('a strike that misses leaves the defender where they were', () => {
	const missed = preview({ hits: [true, false, true] });
	assert.deepEqual(
		missed.frames.map((frame) => frame.defenderHp),
		[12, 8, 8, 4],
	);
	assert.equal(missed.defenderKilled, false, 'two of three landed, so the defender lives');
});

test('sampleAt reads the frame the animation clock is on', () => {
	const animation = preview();
	assert.ok(Math.abs(animation.duration - 0.6) < 1e-9, 'three strikes of 0.2s');
	assert.equal(animation.sampleAt(0).strike, 0);
	assert.equal(animation.sampleAt(0.25).strike, 1, 'mid-way through the second strike');
	assert.equal(animation.sampleAt(0.4).strike, 2, 'exactly on the third frame');
	assert.equal(animation.sampleAt(99).strike, 3, 'past the end clamps to the last');
	assert.equal(animation.sampleAt(-5).strike, 0, 'before the start clamps to the first');
});

test('a preview with no strike duration has one frame and samples it', () => {
	const still = preview({ strikeDuration: 0 });
	assert.equal(still.duration, 0);
	assert.equal(still.frames.length, 4, 'the frames still exist as data');
	assert.equal(still.sampleAt(0).strike, 3, 'with no clock, sampling shows the end state');
});

test('zero strikes is a single frame and no damage', () => {
	const none = preview({ strikes: 0 });
	assert.equal(none.frames.length, 1);
	assert.equal(none.totalDamage, 0);
	assert.equal(none.defenderKilled, false);
});
