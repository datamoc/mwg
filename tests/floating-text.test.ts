import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floatingTextAlpha, floatingTextRise } from '../src/two-d/ui/FloatingText.ts';
import { floatingTextStackOffset } from '../src/two-d/ui/FloatingTextStack.ts';

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

test('a pop-up with no key always stands alone', () => {
	assert.equal(floatingTextStackOffset([entry('a', 0, 0, 10)], entry(undefined, 0, 0, 10)), 0);
});

test('stacking lifts a newcomer clear of every live pop-up sharing its key and origin', () => {
	const live = [entry('hero', 8, 16, 10), entry('hero', 8, 16, 12)];
	//measured heights, not a fixed guess: 10 + 1 then 12 + 1
	assert.equal(floatingTextStackOffset(live, entry('hero', 8, 16, 10)), 24);
});

test('a different key or a different origin is not stacked against', () => {
	const live = [entry('hero', 8, 16, 10)];
	assert.equal(floatingTextStackOffset(live, entry('rat', 8, 16, 10)), 0);
	assert.equal(floatingTextStackOffset(live, entry('hero', 9, 16, 10)), 0);
	assert.equal(floatingTextStackOffset(live, entry('hero', 8, 17, 10)), 0);
});

test('an empty stack needs no offset', () => {
	assert.equal(floatingTextStackOffset([], entry('hero', 0, 0, 10)), 0);
});
