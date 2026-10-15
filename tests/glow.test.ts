import { test } from 'node:test';
import assert from 'node:assert/strict';

import { glowFalloff, paintGlowPixels } from '../src/two-d/render/NeonGlow.ts';

/**
 * Item 426: a soft neon glow in pure arithmetic. Direction first: the centre always
 * burns brighter than the rim, and intensity only ever brightens the light.
 */

test('the falloff burns full at the centre and dies at the rim', () => {
	assert.equal(glowFalloff(0, 24), 1);
	assert.equal(glowFalloff(24, 24), 0);
	assert.equal(glowFalloff(48, 24), 0);
	assert.ok(glowFalloff(6, 24) > glowFalloff(12, 24), 'light fades outward, never inward');
	assert.ok(glowFalloff(12, 24) > glowFalloff(18, 24), 'light fades outward, never inward');
});

test('the painted centre burns redder than the rim and the rim stays dark', () => {
	const size = 9;
	const pixels = new Uint8ClampedArray(size * size * 4);
	paintGlowPixels(pixels, size, { color: 0xff0000, radius: 4, intensity: 1 });
	const at = (x: number, y: number): readonly [number, number, number, number] => {
		const i = (y * size + x) * 4;
		return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
	};
	const centre = at(4, 4);
	const rim = at(8, 4);
	assert.ok(centre[0] > rim[0], 'the centre burns redder than the rim');
	assert.equal(rim[1], 0);
	assert.equal(rim[2], 0);
	assert.deepEqual(at(0, 0).slice(0, 3), [0, 0, 0], 'past the radius stays dark');
	assert.equal(at(0, 0)[3], 0);
});

test('intensity scales the light linearly and zero means dark', () => {
	const size = 9;
	const full = new Uint8ClampedArray(size * size * 4);
	const half = new Uint8ClampedArray(size * size * 4);
	const dark = new Uint8ClampedArray(size * size * 4);
	paintGlowPixels(full, size, { color: 0x37e0ff, radius: 4, intensity: 1 });
	paintGlowPixels(half, size, { color: 0x37e0ff, radius: 4, intensity: 0.5 });
	paintGlowPixels(dark, size, { color: 0x37e0ff, radius: 4, intensity: 0 });
	assert.ok(
		[...dark].every((v) => v === 0),
		'zero intensity paints nothing',
	);
	for (let i = 0; i < full.length; i++) {
		assert.ok(Math.abs(full[i] - 2 * half[i]) <= 2, `channel ${i} stops scaling with intensity`);
	}
});

test('wild falloffs and wild paint jobs fail by name', () => {
	assert.throws(() => glowFalloff(1, 0), /radius above 0/);
	assert.throws(() => glowFalloff(NaN, 4), /finite distance/);
	assert.throws(
		() => paintGlowPixels(new Uint8ClampedArray(5 * 5 * 4), 5, { color: 0xff0000, radius: 2, intensity: 2 }),
		/intensity between 0 and 1/,
	);
	assert.throws(
		() => paintGlowPixels(new Uint8ClampedArray(5 * 5 * 4), 5, { color: 0x1ffffff, radius: 2, intensity: 1 }),
		/integer color/,
	);
	assert.throws(
		() => paintGlowPixels(new Uint8ClampedArray(8), 5, { color: 0xff0000, radius: 2, intensity: 1 }),
		/pixel buffer/,
	);
});
