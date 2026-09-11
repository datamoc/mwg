import assert from 'node:assert/strict';
import test from 'node:test';
import { paletteRangeMapping, remapPixels } from '../src/two-d/render/PaletteRemap.ts';

test("remapPixels defaults to 'exact': only a pixel matching a from-colour exactly is repainted", () => {
	const pixels = new Uint8ClampedArray([
		255, 0, 255, 255, // exact magenta
		250, 5, 250, 255, // near magenta, but not exact
		0, 0, 0, 255, // exact black
	]);
	const out = remapPixels(pixels, { from: [0xff00ff, 0x000000], to: [0xff0000, 0x0000ff] });
	assert.deepEqual([...out.slice(0, 4)], [255, 0, 0, 255], 'exact magenta repainted red');
	assert.deepEqual([...out.slice(4, 8)], [250, 5, 250, 255], 'near-magenta left untouched, not repainted');
	assert.deepEqual([...out.slice(8, 12)], [0, 0, 255, 255], 'exact black repainted blue');
});

test("remapPixels in 'nearest' mode repaints every opaque pixel with its closest from-colour's to-colour", () => {
	const pixels = new Uint8ClampedArray([
		255, 0, 255, 255, // exact magenta
		250, 5, 250, 255, // near magenta
		0, 0, 0, 255, // black
	]);
	const out = remapPixels(pixels, { from: [0xff00ff, 0x000000], to: [0xff0000, 0x0000ff] }, 'nearest');
	assert.deepEqual([...out.slice(0, 4)], [255, 0, 0, 255]);
	assert.deepEqual([...out.slice(4, 8)], [255, 0, 0, 255]);
	assert.deepEqual([...out.slice(8, 12)], [0, 0, 255, 255]);
});

test('remapPixels leaves fully transparent pixels untouched', () => {
	const pixels = new Uint8ClampedArray([12, 34, 56, 0]);
	const out = remapPixels(pixels, { from: [0xff00ff], to: [0x00ff00] });
	assert.deepEqual([...out], [12, 34, 56, 0]);
});

test('remapPixels preserves alpha on a repainted pixel', () => {
	const pixels = new Uint8ClampedArray([255, 0, 255, 128]);
	const out = remapPixels(pixels, { from: [0xff00ff], to: [0x00ff00] });
	assert.deepEqual([...out], [0, 255, 0, 128]);
});

test('remapPixels with an empty palette is a no-op', () => {
	const pixels = new Uint8ClampedArray([10, 20, 30, 255]);
	const out = remapPixels(pixels, { from: [], to: [] });
	assert.deepEqual([...out], [10, 20, 30, 255]);
});

test('paletteRangeMapping places each reference entry along min -> mid -> max by its order', () => {
	const reference = [0xffffff, 0x808080, 0x000000];
	const mapping = paletteRangeMapping(reference, { min: 0xff0000, mid: 0x00ff00, max: 0x0000ff });
	assert.deepEqual(mapping.from, reference);
	assert.equal(mapping.to[0], 0xff0000); // lightest -> min
	assert.equal(mapping.to[2], 0x0000ff); // darkest -> max
	// midpoint reference entry lands exactly on mid
	assert.equal(mapping.to[1], 0x00ff00);
});

test('paletteRangeMapping interpolates smoothly between stops', () => {
	const reference = [0xffffff, 0x7f7f7f, 0x404040, 0x000000];
	const mapping = paletteRangeMapping(reference, { min: 0x000000, mid: 0x808080, max: 0xffffff });
	// monotonically increasing red channel as the reference darkens, min -> mid -> max
	const reds = mapping.to.map((color) => (color >> 16) & 0xff);
	for (let i = 1; i < reds.length; i += 1) assert.ok(reds[i] >= reds[i - 1]);
});

test('paletteRangeMapping handles a single-entry reference by using mid', () => {
	const mapping = paletteRangeMapping([0x123456], { min: 0xff0000, mid: 0x00ff00, max: 0x0000ff });
	assert.deepEqual(mapping.to, [0x00ff00]);
});
