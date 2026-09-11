import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	FloatingText,
	floatingTextAgeAtLeast,
	floatingTextAlpha,
	floatingTextRise,
} from '../src/two-d/ui/FloatingText.ts';
import {
	FLOATING_TEXT_STACK_GAP,
	floatingTextStackLifePenalty,
	floatingTextStackLift,
	floatingTextStackMoves,
} from '../src/two-d/ui/FloatingTextStack.ts';

/**
 * `FloatingText` itself cannot be built here - its `Label` measures text through a DOM, which
 * this suite deliberately has none of - so the parts worth checking are exported as arithmetic:
 * the fade curve, the rise, and the stacking rule. The container halves are thin wrappers whose
 * wiring is what the visual smoke runs cover.
 */

test('without a hold, the text fades linearly across its whole life', () => {
	assert.equal(floatingTextAlpha(0, 0), 1);
	assert.equal(floatingTextAlpha(0.25, 0), 0.75);
	assert.equal(floatingTextAlpha(0.5, 0), 0.5);
	assert.equal(floatingTextAlpha(1, 0), 0);
});

test('a hold keeps the text fully opaque for that share of its life, then fades it', () => {
	assert.equal(floatingTextAlpha(0.25, 0.5), 1);
	assert.equal(floatingTextAlpha(0.5, 0.5), 1);
	assert.equal(floatingTextAlpha(0.75, 0.5), 0.5);
	assert.equal(floatingTextAlpha(1, 0.5), 0);
});

test('a full hold never divides by the nothing left to fade over', () => {
	assert.equal(floatingTextAlpha(0.5, 1), 1);
	assert.equal(floatingTextAlpha(1, 1), 1);
});

test('the rise is negative, proportional, and dropped entirely under reduced motion', () => {
	assert.equal(floatingTextRise(0, 24), 0);
	assert.equal(floatingTextRise(0.5, 24), -12);
	assert.equal(floatingTextRise(1, 24), -24);
	assert.equal(floatingTextRise(0.5, 24, true), 0);
});

const entry = (key: string | number | undefined, x: number, y: number, height: number) => ({ key, x, y, height });

test('a line already clear of the one below it is not moved', () => {
	// 10 tall centred at 0 (bottom 5) and 8 tall centred at 20 (top 16): 5 + 4 is short of 16
	assert.equal(floatingTextStackLift(entry('hero', 0, 0, 10), entry('hero', 0, 20, 8)), 0);
});

test('an overlapping line is lifted above the newer one, by its own height plus the gap', () => {
	const older = entry('hero', 0, 0, 10);
	const below = entry('hero', 0, 0, 8);

	// below.top = 0 - 4 = -4, so the older line goes to -4 - 5 - 4 = -13
	assert.equal(floatingTextStackLift(older, below), -13);
	// and the direction is the point: the newcomer stays on the target, the older line moves UP
	assert.ok(floatingTextStackLift(older, below) < older.y, 'the older line moves up, never the newcomer down');
});

test("the gap is Java's 4, honoured exactly at the boundary", () => {
	assert.equal(FLOATING_TEXT_STACK_GAP, 4);

	const below = entry('hero', 0, 0, 8); // top = -4
	const clear = -4 - FLOATING_TEXT_STACK_GAP - 5; // bottom exactly one gap above the other's top
	assert.equal(floatingTextStackLift(entry('hero', 0, clear, 10), below), clear, 'exactly clear means untouched');
	assert.equal(
		floatingTextStackLift(entry('hero', 0, clear + 1, 10), below),
		clear,
		'a pixel lower and it moves to clear',
	);
});

test("the lift takes the two boxes it is given; which ones stack is the stack's business", () => {
	assert.equal(floatingTextStackLift(entry('rat', 0, 0, 10), entry('hero', 0, 0, 8)), -13);
});

test('a nudged line loses a fifth of a second of life per line it is pushed above', () => {
	assert.equal(floatingTextStackLifePenalty(0), 0);
	assert.equal(floatingTextStackLifePenalty(1), 0.2);
	assert.equal(floatingTextStackLifePenalty(5), 1);
	assert.equal(floatingTextStackLifePenalty(-3), 0, 'a nonsense depth is not a life sentence');
});

test('the age a lifted line is forced to is a floor, not a subtraction', () => {
	// Java: `above.timeLeft = Math.min(above.timeLeft, LIFESPAN - numBelow/5f)`, then clamped at 0.
	// Capping what is left is the same as putting a floor under the age, so a line already past the
	// floor keeps the age it has. Subtracting the floor instead would shorten that line twice and
	// cut a nearly-finished pop-up dead, which is what the first version of this did.
	assert.equal(floatingTextAgeAtLeast(0, 1, 0.2), 0.2, 'a fresh line is pushed forward to the floor');
	assert.equal(floatingTextAgeAtLeast(0.5, 1, 0.2), 0.5, 'a line past the floor is left alone');
	assert.equal(floatingTextAgeAtLeast(0.5, 1, 4), 1, 'a floor past the lifetime finishes the pop-up');
	assert.equal(floatingTextAgeAtLeast(0.5, 1, 0), 0.5, 'no floor at all changes nothing');
});

test('a pop-up with no key moves nothing, however crowded the target is', () => {
	const live = [entry('hero', 0, 0, 10), entry('hero', 0, 0, 10)];
	assert.deepEqual(floatingTextStackMoves(live, entry(undefined, 0, 0, 8)), []);
});

test('the line a newcomer overlaps moves, and the move carries the age it is forced to', () => {
	const moves = floatingTextStackMoves([entry('hero', 0, 0, 10)], entry('hero', 0, 0, 8));

	assert.deepEqual(moves, [{ index: 0, y: -13, ageAtLeast: 0.2 }]);
});

test('a burst moves the lines newest first, each a line and a gap above the last, each older', () => {
	const live = [entry('hero', 0, 0, 10), entry('hero', 0, 0, 10), entry('hero', 0, 0, 10)];
	const moves = floatingTextStackMoves(live, entry('hero', 0, 0, 8));

	assert.deepEqual(
		moves.map((move) => move.index),
		[2, 1, 0],
		'newest first, so each line is measured against the one that just moved',
	);
	assert.deepEqual(
		moves.map((move) => move.y),
		[-13, -27, -41],
		'each one a full line plus the gap above the line below it',
	);
	assert.deepEqual(
		moves.map((move) => move.ageAtLeast),
		[0.2, 0.4, 0.6],
		'the deeper a line ends up, the older it is forced to be',
	);
});

test('a stack that already clears the newcomer is left alone', () => {
	// a line 13 up is exactly one gap clear of a newcomer 8 tall on the target
	assert.deepEqual(floatingTextStackMoves([entry('hero', 0, -13, 10)], entry('hero', 0, 0, 8)), []);
});

test('a different key is never moved, however close it is', () => {
	const live = [entry('rat', 0, 0, 10), entry('hero', 0, 0, 10)];
	const moves = floatingTextStackMoves(live, entry('hero', 0, 0, 8));

	assert.deepEqual(
		moves.map((move) => move.index),
		[1],
		'the rat line shares the position, not the key',
	);
});

test('a pop-up is placed by its caller, and the placement survives the frame that follows', () => {
	// The bug this pins, measured in the browser before it was fixed: `update` used to write `y`
	// from a base it captured on the first frame, so a line `FloatingTextStack` had just lifted
	// snapped back one frame later, straight onto the newcomer (166.6 back to 194.4, beside a
	// newcomer at 200). The rise moves the pop-up's inner layer now, so `y` belongs to whoever
	// placed it, and `riseOffset` is the animation's own contribution to where it is drawn.
	const popup = new FloatingText({ text: '+1', duration: 1, rise: 24 });
	popup.position.set(0, 100);
	popup.update(0.016);

	popup.y = 40; // what a stack does to lift a line out of a newcomer's way
	popup.update(0.016);

	assert.equal(popup.y, 40, 'the position is still the caller s');
	assert.equal(popup.riseOffset, floatingTextRise(0.032, 24), 'and the rise carried on rising');
});
