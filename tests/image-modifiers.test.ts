import assert from 'node:assert/strict';
import test from 'node:test';
import {
	blendMatrix,
	channelScaleMatrix,
	channelSwapMatrix,
	colorShiftMatrix,
	imageModifier,
	maskPixels,
	parseImagePath,
} from '../src/two-d/render/ImageModifiers.ts';

test('image modifier paths preserve nested assets and normalize modifier names', () => {
	const parsed = parseImagePath('attacks/blank-attack.png~BLIT(attacks/claws.png~FL(horiz),4,4)~CS(-20,0,30)');
	assert.equal(parsed.path, 'attacks/blank-attack.png');
	assert.deepEqual(parsed.modifiers[0], { name: 'BLIT', args: ['attacks/claws.png~FL(horiz)', '4', '4'] });
	assert.deepEqual(imageModifier(parsed, 'cs'), { name: 'CS', args: ['-20', '0', '30'] });
});

test('image modifier paths accept quoted values and shorthand scale', () => {
	const parsed = parseImagePath('"units/human.png~SCALE(48)~FL(vert)"');
	assert.equal(parsed.path, 'units/human.png');
	assert.deepEqual(
		parsed.modifiers.map((entry) => entry.name),
		['SCALE', 'FL'],
	);
	assert.deepEqual(parsed.modifiers[0].args, ['48']);
});

test('CS builds a per-channel additive matrix', () => {
	const matrix = colorShiftMatrix(-20, 0, 30);
	assert.equal(matrix.length, 20);
	assert.equal(matrix[4], -20 / 255);
	assert.equal(matrix[9], 0);
	assert.equal(matrix[14], 30 / 255);
});

test('R/G/B builds a per-channel multiplicative matrix, untouched channels left at 100%', () => {
	const matrix = channelScaleMatrix({ red: 150, blue: 50 });
	assert.equal(matrix.length, 20);
	assert.equal(matrix[0], 1.5); // R
	assert.equal(matrix[6], 1); // G untouched
	assert.equal(matrix[12], 0.5); // B
	assert.equal(matrix[18], 1); // A untouched
});

test('BLEND builds a matrix that lerps every pixel towards a colour', () => {
	const matrix = blendMatrix(0xff0000, 0.5);
	assert.equal(matrix[0], 0.5); // keep half the original red
	assert.equal(matrix[4], 0.5); // add half of the target red (255/255 * 0.5)
	assert.equal(matrix[6], 0.5); // keep half the original green
	assert.equal(matrix[9], 0); // no green added
});

test('CHAN builds a permutation matrix that swaps named channels', () => {
	const matrix = channelSwapMatrix(['B', 'G', 'R']);
	// output red row reads from B
	assert.deepEqual(matrix.slice(0, 5), [0, 0, 1, 0, 0]);
	// output green row reads from G (identity)
	assert.deepEqual(matrix.slice(5, 10), [0, 1, 0, 0, 0]);
	// output blue row reads from R
	assert.deepEqual(matrix.slice(10, 15), [1, 0, 0, 0, 0]);
	// alpha defaults to identity when not given
	assert.deepEqual(matrix.slice(15, 20), [0, 0, 0, 1, 0]);
});

test('CHAN supports constant 0/1 channels', () => {
	const matrix = channelSwapMatrix(['0', '1', 'R', 'A']);
	assert.deepEqual(matrix.slice(0, 5), [0, 0, 0, 0, 0]);
	assert.deepEqual(matrix.slice(5, 10), [0, 0, 0, 0, 1]);
});

test('maskPixels multiplies base alpha by an aligned mask, keeping base colour', () => {
	const base = new Uint8ClampedArray([10, 20, 30, 255]);
	const mask = new Uint8ClampedArray([0, 0, 0, 128]);
	const out = maskPixels(base, 1, 1, mask, 1, 1, 0, 0);
	assert.deepEqual([...out], [10, 20, 30, 128]);
});

test('maskPixels zeroes alpha outside the mask bounds after an offset', () => {
	const base = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]); // 2x1
	const mask = new Uint8ClampedArray([0, 0, 0, 255]); // 1x1, covers only x=1 after offset
	const out = maskPixels(base, 2, 1, mask, 1, 1, 1, 0);
	assert.equal(out[3], 0); // pixel 0 outside the mask
	assert.equal(out[7], 255); // pixel 1 under the mask, full alpha kept
});
