import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToPixel, pixelToHex, type HexOffset, type HexOrientation } from '../src/core/Hex.ts';

/**
 * The projection options: the two orientations and the two offset parities, each round-tripping
 * through the other function, since a projection whose inverse disagrees with it puts a click one
 * cell away from where the player aimed and looks like a gameplay bug rather than a layout one.
 *
 * The round-trip is the test that matters here, and it is a property rather than a table: every
 * cell in a grid, not a few hand-checked examples.
 */

const shapes: { orientation: HexOrientation; offset: HexOffset }[] = [
	{ orientation: 'flat-top', offset: 'odd' },
	{ orientation: 'flat-top', offset: 'even' },
	{ orientation: 'pointy-top', offset: 'odd' },
	{ orientation: 'pointy-top', offset: 'even' },
];

test('every orientation and offset round-trips, cell centre back to cell', () => {
	for (const shape of shapes) {
		for (let x = -3; x <= 3; x++) {
			for (let y = -3; y <= 3; y++) {
				const pixel = hexToPixel(x, y, 32, 28, shape);
				assert.deepEqual(
					pixelToHex(pixel.x, pixel.y, 32, 28, shape),
					{ x, y },
					`${shape.orientation}/${shape.offset} round-trip failed for (${x},${y})`,
				);
			}
		}
	}
});

test('a nudge away from a centre still resolves to that cell, in every shape', () => {
	for (const shape of shapes) {
		const centre = hexToPixel(2, 1, 32, 28, shape);
		assert.deepEqual(
			pixelToHex(centre.x + 2, centre.y + 2, 32, 28, shape),
			{ x: 2, y: 1 },
			`${shape.orientation}/${shape.offset}`,
		);
	}
});

test('the default shape is the one this module always projected', () => {
	assert.deepEqual(hexToPixel(1, 2, 32, 28), hexToPixel(1, 2, 32, 28, { orientation: 'flat-top', offset: 'odd' }));
});

test('flat-top steps three quarters of a tile across and a whole tile down', () => {
	const origin = hexToPixel(0, 0, 32, 28);
	const nextColumn = hexToPixel(1, 0, 32, 28);
	const nextRow = hexToPixel(0, 1, 32, 28);

	assert.equal(nextColumn.x - origin.x, 24);
	assert.equal(nextColumn.y - origin.y, 14, 'an odd column sits half a row lower');
	assert.equal(nextRow.y - origin.y, 28);
	assert.equal(nextRow.x, origin.x);
});

test('pointy-top is the transpose: a whole tile across, three quarters down', () => {
	const origin = hexToPixel(0, 0, 32, 28, { orientation: 'pointy-top' });
	const nextColumn = hexToPixel(1, 0, 32, 28, { orientation: 'pointy-top' });
	const nextRow = hexToPixel(0, 1, 32, 28, { orientation: 'pointy-top' });

	assert.equal(nextColumn.x - origin.x, 32);
	assert.equal(nextRow.y - origin.y, 21);
	assert.equal(nextRow.x - origin.x, 16, 'an odd row sits half a tile right');
});

test('the offset parity decides which lines are pushed, not whether they are', () => {
	const odd = hexToPixel(1, 0, 32, 28, { offset: 'odd' });
	const even = hexToPixel(1, 0, 32, 28, { offset: 'even' });

	assert.equal(odd.y - even.y, 14, 'column 1 is the pushed one under odd, and the straight one under even');
	assert.equal(hexToPixel(0, 0, 32, 28, { offset: 'odd' }).y, 14, 'column 0 is the other way round');
	assert.equal(hexToPixel(0, 0, 32, 28, { offset: 'even' }).y, 28, 'which is the whole of what parity decides');
});
