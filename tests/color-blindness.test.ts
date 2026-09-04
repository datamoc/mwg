import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLOR_BLINDNESS_MATRICES } from '../src/render/ColorBlindness.ts';

//`createColorBlindnessFilter` itself needs a real WebGL context even to construct (like
//`BitmapText`), so this verifies the matrix data directly instead - see ColorBlindness.ts

test('every colour blindness matrix is a valid Pixi 5x4 (20-value) ColorMatrix', () => {
	for (const [type, matrix] of Object.entries(COLOR_BLINDNESS_MATRICES)) {
		assert.equal(matrix.length, 20, `${type} matrix must have exactly 20 values`);
		for (const value of matrix) assert.equal(typeof value, 'number', `${type} matrix must be all numbers`);
	}
});

test('the alpha row is untouched (identity), so transparency is preserved', () => {
	for (const [type, matrix] of Object.entries(COLOR_BLINDNESS_MATRICES)) {
		assert.deepEqual(matrix.slice(15, 20), [0, 0, 0, 1, 0], `${type} must leave alpha alone`);
	}
});

test('each output channel row sums close to 1, so a matrix does not darken or brighten the image overall', () => {
	for (const [type, matrix] of Object.entries(COLOR_BLINDNESS_MATRICES)) {
		for (let row = 0; row < 3; row++) {
			const sum = matrix[row * 5] + matrix[row * 5 + 1] + matrix[row * 5 + 2];
			assert.ok(Math.abs(sum - 1) < 1e-9, `${type} row ${row} sums to ${sum}, expected 1`);
		}
	}
});

test('protanopia, deuteranopia, and tritanopia are three genuinely different matrices', () => {
	const { protanopia, deuteranopia, tritanopia } = COLOR_BLINDNESS_MATRICES;
	assert.notDeepEqual(protanopia, deuteranopia);
	assert.notDeepEqual(deuteranopia, tritanopia);
	assert.notDeepEqual(protanopia, tritanopia);
});
