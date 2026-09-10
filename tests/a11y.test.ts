import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ScreenReader, screenReader } from '../src/two-d/ui/a11y.ts';

/**
 * There is no DOM under `node --test`, which is the point: the bridge has to be callable from
 * ordinary scene code without a guard, so these tests prove it no-ops rather than throws.
 */

test('announcing without a DOM is a no-op, not a crash', () => {
	assert.doesNotThrow(() => screenReader.announce('You found a rusty key.'));
	assert.doesNotThrow(() => screenReader.announce('Alarm!', { assertive: true }));
	assert.doesNotThrow(() => screenReader.clear());
	assert.doesNotThrow(() => screenReader.destroy());
});

test('a fresh ScreenReader is usable the same way', () => {
	const reader = new ScreenReader();
	assert.doesNotThrow(() => reader.announce('hello'));
	assert.doesNotThrow(() => reader.announce('again'));
	reader.destroy();
});
