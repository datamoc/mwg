import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linesToDrop, takeLastEntries } from '../src/two-d/ui/MessageLog.ts';

/**
 * P38: the log readback contract, renderer-free. A `MessageLog` builds Pixi `Label`s,
 * which measure through a canvas `node --test` has no document for (the same reason
 * `bitmap-label.test.ts` tests the style mapping, not the widget), so the budget and
 * the readback slice live in pure functions and the widget method delegates to them.
 * The widget path itself is verified visually in a browser like every other
 * Pixi-text-backed widget.
 */

test('the budget drops the oldest entries first and always keeps the newest', () => {
	assert.equal(linesToDrop([1, 2, 2], 3), 2, 'the two oldest go, leaving one 2-line entry');
	assert.equal(linesToDrop([1, 1, 1], 3), 0, 'a fitting log drops nothing');
	assert.equal(linesToDrop([1, 1, 1], 2), 1);
	assert.equal(linesToDrop([5], 3), 0, 'an over-budget newest entry still stays');
	assert.equal(linesToDrop([], 3), 0, 'an empty log drops nothing');
	assert.equal(linesToDrop([2, 2, 2], 4), 1, 'the budget counts wrapped lines, not entries');
});

test('the readback slice is the newest entries oldest-first, bounded by what is retained', () => {
	const retained = ['a', 'b', 'c'];
	assert.deepEqual(takeLastEntries(retained, 2), ['b', 'c']);
	assert.deepEqual(takeLastEntries(retained, 3), ['a', 'b', 'c']);
	assert.deepEqual(takeLastEntries(retained, 99), ['a', 'b', 'c'], 'past the end reads everything retained');
	assert.deepEqual(takeLastEntries(retained, 0), [], 'zero reads nothing');
	assert.deepEqual(takeLastEntries(retained, -2), [], 'negative reads nothing');
	assert.deepEqual(takeLastEntries([], 2), [], 'an empty log reads empty');
	assert.deepEqual(takeLastEntries(retained, 2.9), ['b', 'c'], 'a fractional count floors');
	assert.deepEqual(retained, ['a', 'b', 'c'], 'slicing never disturbs the log');
});
