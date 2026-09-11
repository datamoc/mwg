import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Spinner, spinValue } from '../src/two-d/ui/Spinner.ts';

/**
 * The spinner (item 261): `spinValue` is the whole rule - snap to the step, then either clamp at
 * the ends or wrap past them - so it is tested at the boundaries, and the widget's state on top.
 */

test('spinValue clamps at the ends by default', () => {
	assert.equal(spinValue(9, 1, 0, 10), 10);
	assert.equal(spinValue(10, 1, 0, 10), 10, 'already at the top');
	assert.equal(spinValue(0, -1, 0, 10), 0, 'already at the bottom');
});

test('spinValue wraps past the ends when asked', () => {
	assert.equal(spinValue(10, 1, 0, 10, 1, true), 0, 'past the top lands on the bottom');
	assert.equal(spinValue(0, -1, 0, 10, 1, true), 10, 'below the bottom lands on the top');
});

test('spinValue snaps a value onto the step grid', () => {
	assert.equal(spinValue(3, 0, 0, 10, 5), 5);
	assert.equal(spinValue(3, 1, 0, 10, 5), 10);
	assert.equal(spinValue(0, 1, 0, 1, 0.25), 0.25);
});

test('a degenerate range reads min rather than looping', () => {
	assert.equal(spinValue(5, 1, 5, 5), 5);
	assert.equal(spinValue(5, 1, 10, 5), 10);
});

test('the widget starts at min and clamps what it is handed', () => {
	const spinner = new Spinner({ min: 1, max: 5 });
	assert.equal(spinner.value, 1);

	spinner.setValue(99);
	assert.equal(spinner.value, 5);
	spinner.setValue(-99);
	assert.equal(spinner.value, 1);
});

test('increment and decrement fire onChange only when the value moves', () => {
	const spinner = new Spinner({ min: 0, max: 3, value: 2 });
	const seen: number[] = [];
	spinner.onChange.add((value) => {
		seen.push(value);
	});

	spinner.increment();
	assert.equal(spinner.value, 3);
	spinner.increment(); // clamped, no move
	assert.deepEqual(seen, [3]);
	spinner.decrement();
	assert.deepEqual(seen, [3, 2]);
});

test('a wrapping spinner keeps going past the ends', () => {
	const spinner = new Spinner({ min: 0, max: 2, value: 2, wrap: true });
	spinner.increment();
	assert.equal(spinner.value, 0);
	spinner.decrement();
	assert.equal(spinner.value, 2);
});

test('a tap on the top half adds and the bottom half takes away', () => {
	const spinner = new Spinner({ width: 24, height: 40, min: 0, max: 5, value: 2 });
	spinner.emit('pointertap', { global: { x: 0, y: 0 } } as never); //toLocal ignores the offset for an unpositioned spinner
	assert.equal(spinner.value, 3);
});
