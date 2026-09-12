import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Texture, TextureSource } from 'pixi.js';
import { SpriteSheet } from '../src/two-d/render/SpriteSheet.ts';

/**
 * Most sheets are grids, and `SpriteSheet` has always cut those. The rest are not: a
 * hand-packed icon atlas, a strip of bar segments, an item whose art is smaller than its
 * cell. Those declare their own rectangles, which are frames like any other - cached,
 * nameable, and read through `region` - so a game stops hand-building a `Texture` per site.
 */

function texture(width = 64, height = 64): Texture {
	return new Texture({ source: new TextureSource({ width, height }) });
}

test('a declared rect is cut once and served from the same cache as a grid frame', () => {
	const sheet = SpriteSheet.fromTexture(texture(), 16, 16);

	sheet.rect(100, 4, 8, 12, 9);

	assert.equal(sheet.get(100), sheet.get(100), 'the second ask returns the same Texture');
	assert.deepEqual(sheet.region(100).frame, { x: 4, y: 8, width: 12, height: 9 });
	assert.deepEqual(sheet.region(100).texture, sheet.get(100));
});

test('a declared rect takes a name and is picked like any other frame', () => {
	const sheet = SpriteSheet.fromTexture(texture(), 16, 16);

	sheet.rect(100, 0, 0, 12, 9).name('cross', 100);
	sheet.name('dot', 1);

	assert.equal(sheet.get('cross'), sheet.get(100));
	assert.deepEqual(sheet.pick('cross', 'dot'), [sheet.get(100), sheet.get(1)]);
});

test('a rect may tighten a grid frame without moving it, which is what a sub-rect is', () => {
	const sheet = SpriteSheet.fromTexture(texture(), 16, 16);
	assert.deepEqual(sheet.region(5).frame, { x: 16, y: 16, width: 16, height: 16 }, 'frame 5 is its grid cell');

	sheet.rect(5, 17, 17, 14, 14); // the item art inside that cell, smaller than the cell

	assert.deepEqual(sheet.region(5).frame, { x: 17, y: 17, width: 14, height: 14 });
	assert.deepEqual(
		sheet.region(6).frame,
		{ x: 32, y: 16, width: 16, height: 16 },
		'the neighbouring cell is untouched',
	);
});

test('a sheet built with no frame size has no grid, and only the rects declared on it', () => {
	const sheet = SpriteSheet.fromTexture(texture());

	assert.equal(sheet.columns, 0);
	assert.equal(sheet.rows, 0);
	assert.equal(sheet.count, 0);
	assert.throws(() => sheet.get(0), /outside this sheet, which holds 0/);

	sheet.rect(0, 2, 3, 10, 10);

	assert.deepEqual(sheet.region(0).frame, { x: 2, y: 3, width: 10, height: 10 });
});

test('a rect with no area is refused rather than cut', () => {
	const sheet = SpriteSheet.fromTexture(texture(), 16, 16);

	assert.throws(() => sheet.rect(100, 0, 0, 0, 8), /positive width and height/);
	assert.throws(() => sheet.rect(100, 0, 0, 8, -1), /positive width and height/);
});
