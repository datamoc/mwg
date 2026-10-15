import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hazeField, paintHazePixels } from '../src/two-d/render/HazeLayer.ts';

/**
 * Item 425: an atmospheric haze sheet in pure arithmetic. Direction first: density
 * only ever thickens the sky (never thins it), and edges blend rather than step.
 */

test('the field is deterministic and always a density', () => {
	assert.equal(hazeField(3, 5, 1.5, 7), hazeField(3, 5, 1.5, 7));
	for (const [x, y, t, s] of [
		[0, 0, 0, 1],
		[63, 35, 12.5, 99],
		[-40, 200, 0.01, 2],
	] as const) {
		const value = hazeField(x, y, t, s);
		assert.ok(value >= 0 && value <= 1, `field(${x}, ${y}, ${t}, ${s}) escapes 0..1: ${value}`);
	}
});

test('time breathes and seeds disagree', () => {
	const a = hazeField(10, 10, 0, 4);
	const b = hazeField(10, 10, 5, 4);
	assert.notEqual(a, b, 'five seconds of drift must move the sky');
	assert.notEqual(hazeField(10, 10, 0, 4), hazeField(10, 10, 0, 5), 'two seeds must not paint the same sky');
});

test('empty density paints a clear sky and full density always shows haze', () => {
	const clear = new Uint8ClampedArray(16 * 12 * 4);
	paintHazePixels(clear, 16, 12, { time: 3, density: 0, seed: 3 });
	assert.ok(
		[...clear].every((v) => v === 0 || v === 255),
		'only white rgb, never alpha',
	);
	assert.ok(
		Array.from({ length: 16 * 12 }, (_, i) => clear[i * 4 + 3]).every((a) => a === 0),
		'density 0 leaves every alpha at 0',
	);
	const covered = new Uint8ClampedArray(16 * 12 * 4);
	paintHazePixels(covered, 16, 12, { time: 3, density: 1, seed: 3 });
	assert.ok(
		Array.from({ length: 16 * 12 }, (_, i) => covered[i * 4 + 3]).some((a) => a > 0),
		'full density always shows some haze',
	);
});

test('raising the density never thins a covered pixel', () => {
	const thin = new Uint8ClampedArray(16 * 12 * 4);
	const thick = new Uint8ClampedArray(16 * 12 * 4);
	paintHazePixels(thin, 16, 12, { time: 3, density: 0.3, seed: 3 });
	paintHazePixels(thick, 16, 12, { time: 3, density: 0.8, seed: 3 });
	for (let i = 0; i < 16 * 12; i++) {
		assert.ok(thick[i * 4 + 3] >= thin[i * 4 + 3], `pixel ${i} thins as density rises`);
	}
});

test('neighbouring pixels blend rather than step', () => {
	const pixels = new Uint8ClampedArray(32 * 24 * 4);
	paintHazePixels(pixels, 32, 24, { time: 3, density: 1, seed: 3 });
	const alpha = (x: number, y: number): number => pixels[(y * 32 + x) * 4 + 3];
	let hardest = 0;
	for (let y = 0; y < 24; y++) {
		for (let x = 0; x < 31; x++) hardest = Math.max(hardest, Math.abs(alpha(x + 1, y) - alpha(x, y)));
	}
	assert.ok(hardest < 128, `a soft sheet never jumps ${hardest} alpha between neighbours`);
});

test('wild paint jobs fail by name', () => {
	const pixels = new Uint8ClampedArray(4 * 2 * 4);
	assert.throws(
		() => paintHazePixels(new Uint8ClampedArray(3), 4, 2, { time: 0, density: 1, seed: 1 }),
		/pixel buffer/,
	);
	assert.throws(() => paintHazePixels(pixels, 4, 2, { time: 0, density: 2, seed: 1 }), /density between 0 and 1/);
	assert.throws(() => paintHazePixels(pixels, 4, 2, { time: NaN, density: 1, seed: 1 }), /finite time and seed/);
	assert.throws(() => hazeField(NaN, 0, 0, 1), /finite x, y, time and seed/);
});
