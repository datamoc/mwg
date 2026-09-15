import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitResolution } from '../src/two-d/ResolutionFit.ts';

/**
 * Measured on a device rather than imagined: an emulator reporting a `MAX_TEXTURE_SIZE` of 4096
 * against a full-window canvas of 816x1812 css pixels at `devicePixelRatio` 2.625 asked for a
 * 2121x4709 backing store and was given a drawing buffer clamped to 2121x4096. Note what that
 * investigation did *not* establish: that process also painted a black screen, but the failure
 * never reproduced (every later start reported 8192) and a deliberately clamped 1050x10500
 * request rendered correctly, so the black screen has no cause attributed to it here. The
 * clamped request itself is the fact these tests pin down.
 */
test('a canvas whose backing store would exceed the device limit is fitted down', () => {
	assert.equal(fitResolution(816, 1812, 2.625, 4096), 2);
	// and the fitted value is what keeps it inside: 1812 * 2 is under the 4096 limit
	assert.ok(1812 * 2 <= 4096);
});

test('a device that can afford what was asked for keeps the exact resolution it asked for', () => {
	assert.equal(fitResolution(400, 800, 2.625, 4096), 2.625);
	assert.equal(fitResolution(1920, 1080, 1, 4096), 1);
	// fractional ratios are preserved, not rounded: a display that genuinely reports 1.5
	// should get 1.5, and rounding it to 1 or 2 would be a change of its own
	assert.equal(fitResolution(1000, 700, 1.5, 4096), 1.5);
});

test('the fitting is a whole number, so pixel art still lands on whole device pixels', () => {
	// 4096 / 1812 is 2.26: the floor is deliberate, not a rounding
	assert.equal(fitResolution(1080, 1812, 3, 4096), 2);
	assert.ok(Number.isInteger(fitResolution(1080, 1812, 3, 4096)));
});

test('an exactly-affordable canvas is affordable: the boundary is inclusive', () => {
	assert.equal(fitResolution(1024, 1024, 4, 4096), 4);
	assert.equal(fitResolution(1025, 1024, 4, 4096), 3);
});

test('a canvas longer than the limit even at 1x keeps 1x rather than dropping to 0', () => {
	assert.equal(fitResolution(100, 9000, 2, 4096), 1);
});

test('a limit of zero, infinity or NaN means no cap, so an unknown device is never constrained', () => {
	// a WebGPU renderer has no WebGL context to ask, and a game must still start
	assert.equal(fitResolution(816, 1812, 2.625, Number.POSITIVE_INFINITY), 2.625);
	assert.equal(fitResolution(816, 1812, 2.625, Number.NaN), 2.625);
	assert.equal(fitResolution(816, 1812, 2.625, 0), 2.625);
	assert.equal(fitResolution(816, 1812, 2.625, -1), 2.625);
});

test('a zero-sized viewport is left alone: there is nothing to fit against', () => {
	// happens for a canvas inside a display:none parent, before the first real layout
	assert.equal(fitResolution(0, 0, 2, 4096), 2);
});
