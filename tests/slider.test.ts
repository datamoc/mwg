import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Slider, sliderFraction, sliderValueAt } from '../src/two-d/ui/Slider.ts';

/**
 * The slider (item 261): the arithmetic that turns a value into a track position and a track
 * position back into a value is where the boundary lives - clamping, the step grid, and the
 * degenerate range - so it is tested as plain arithmetic, and the widget's own state on top.
 */

test('sliderFraction maps a value into 0..1 and clamps past the ends', () => {
	assert.equal(sliderFraction(30, 0, 60), 0.5);
	assert.equal(sliderFraction(-10, 0, 60), 0);
	assert.equal(sliderFraction(100, 0, 60), 1);
	assert.equal(sliderFraction(0.5), 0.5, 'the default range is 0..1');
});

test('a degenerate range reads 0 rather than dividing by zero', () => {
	assert.equal(sliderFraction(5, 5, 5), 0);
	assert.equal(sliderFraction(5, 10, 5), 0);
});

test('sliderValueAt is continuous without a step and the exact inverse of sliderFraction', () => {
	assert.equal(sliderValueAt(0.5, 0, 60), 30);
	assert.equal(sliderValueAt(0, 10, 20), 10);
	assert.equal(sliderValueAt(1, 10, 20), 20);
	assert.equal(sliderValueAt(0.25, 0, 8), 2);
});

test('sliderValueAt snaps to the step and clamps to the ends', () => {
	assert.equal(sliderValueAt(0.34, 0, 10, 1), 3);
	assert.equal(sliderValueAt(0.36, 0, 10, 1), 4);
	assert.equal(sliderValueAt(0.99, 0, 10, 1), 10, 'the top of the track is max, not one step below it');
	assert.equal(sliderValueAt(0, 0, 10, 3), 0);
});

test('a fractional step reads as its own decimal, not a float artefact', () => {
	assert.equal(sliderValueAt(0.3, 0, 1, 0.1), 0.3);
	assert.equal(sliderValueAt(0.55, 0, 1, 0.25), 0.5);
});

test('the widget starts at min and clamps what it is handed', () => {
	const slider = new Slider({ width: 100, min: 0, max: 10, step: 1 });
	assert.equal(slider.value, 0);

	slider.setValue(50);
	assert.equal(slider.value, 10, 'past the top');
	slider.setValue(-50);
	assert.equal(slider.value, 0, 'past the bottom');
});

test('setValue snaps to the step and fires onChange only when the value moves', () => {
	const slider = new Slider({ width: 100, min: 0, max: 10, step: 2, value: 4 });
	const seen: number[] = [];
	slider.onChange.add((value) => {
		seen.push(value);
	});

	slider.setValue(4); // already there, no move
	assert.deepEqual(seen, []);
	slider.setValue(5); // snaps up to 6
	assert.deepEqual(seen, [6]);
	slider.setValue(6); // already there, no move
	assert.deepEqual(seen, [6]);
	assert.equal(slider.value, 6);
});

test('setFraction places the value at a position on the track', () => {
	const slider = new Slider({ width: 100, min: 0, max: 10, step: 1 });
	slider.setFraction(0.5);
	assert.equal(slider.value, 5);
	assert.equal(slider.fraction, 0.5);
});

test('a disabled slider ignores setValue from the pointer but still reports its value', () => {
	const slider = new Slider({ width: 100, min: 0, max: 10, disabled: true });
	assert.equal(slider.disabled, true);
	slider.setValue(3);
	assert.equal(slider.value, 3, 'programmatic changes still work; only the pointer is blocked');
});
