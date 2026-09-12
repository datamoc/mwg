import assert from 'node:assert/strict';
import test from 'node:test';
import { paletteRangeMapping, remapPixels } from '../src/two-d/render/PaletteRemap.ts';

test("remapPixels defaults to 'exact': only a pixel matching a from-colour exactly is repainted", () => {
	const pixels = new Uint8ClampedArray([
		255,
		0,
		255,
		255, // exact magenta
		250,
		5,
		250,
		255, // near magenta, but not exact
		0,
		0,
		0,
		255, // exact black
	]);
	const out = remapPixels(pixels, { from: [0xff00ff, 0x000000], to: [0xff0000, 0x0000ff] });
	assert.deepEqual([...out.slice(0, 4)], [255, 0, 0, 255], 'exact magenta repainted red');
	assert.deepEqual([...out.slice(4, 8)], [250, 5, 250, 255], 'near-magenta left untouched, not repainted');
	assert.deepEqual([...out.slice(8, 12)], [0, 0, 255, 255], 'exact black repainted blue');
});

test("remapPixels in 'nearest' mode repaints every opaque pixel with its closest from-colour's to-colour", () => {
	const pixels = new Uint8ClampedArray([
		255,
		0,
		255,
		255, // exact magenta
		250,
		5,
		250,
		255, // near magenta
		0,
		0,
		0,
		255, // black
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

test('paletteRangeMapping anchors the reference first colour on mid and shades the rest by brightness', () => {
	const reference = [0x808080, 0x404040, 0xc0c0c0]; // the anchor, then a darker and a brighter entry
	const mapping = paletteRangeMapping(reference, { min: 0x000000, mid: 0xff0000, max: 0xffffff });

	assert.deepEqual(mapping.from, reference);
	assert.equal(mapping.to[0], 0xff0000, 'the anchor colour becomes mid exactly');
	//40 has half the anchor's brightness (64 against 128), so it blends half way to min:
	//trunc(0.5 * 255) = 127, where rounding would give 128
	assert.equal(mapping.to[1], 0x7f0000);
	//c0 is brighter than the anchor, so it blends towards max by (255-192)/(255-128): the
	//highlights come out trunc((64/127) * 255) = 128, again one below what rounding gives
	assert.equal(mapping.to[2], 0xff8080);
});

test('paletteRangeMapping reads brightness, so the reference after its anchor needs no order', () => {
	const range = { min: 0x000000, mid: 0xff0000, max: 0xffffff };
	const sorted = paletteRangeMapping([0x808080, 0x404040, 0xc0c0c0], range);

	assert.deepEqual(
		paletteRangeMapping([0x808080, 0xc0c0c0, 0x404040], range).to,
		[sorted.to[0], sorted.to[2], sorted.to[1]],
		'the same three colours map the same way, wherever they sit after the anchor',
	);
});

test('paletteRangeMapping averages a colour by floor, not by rounding', () => {
	//0x800102 averages 43.67 over its channels: floored to 43, where rounding would take it to
	//44 and every shade derived from it with it. Against an all-white mid on black, that is
	//floor(43 / 128 * 255) = 85 per channel, where 44 would have given 87.
	const to = paletteRangeMapping([0x808080, 0x800102], { min: 0x000000, mid: 0xffffff, max: 0xffffff }).to;

	assert.equal(to[1], 0x555555);
});

test('paletteRangeMapping has no ratio to divide by at a fully black or fully white anchor', () => {
	const range = { min: 0x000000, mid: 0xff0000, max: 0xffffff };

	//a black anchor is the bottom of its own scale, so mid is the top of it and nothing reaches min
	assert.deepEqual(paletteRangeMapping([0x000000, 0xffffff], range).to, [0xff0000, 0xffffff]);
	//a white anchor is at least as bright as everything, so the range only ever opens downwards
	assert.deepEqual(paletteRangeMapping([0xffffff, 0x000000], range).to, [0xff0000, 0x000000]);
});

test('paletteRangeMapping handles a single-entry reference by mapping it to mid', () => {
	const mapping = paletteRangeMapping([0x123456], { min: 0xff0000, mid: 0x00ff00, max: 0x0000ff });
	assert.deepEqual(mapping.to, [0x00ff00]);
	assert.deepEqual(paletteRangeMapping([], { min: 0xff0000, mid: 0x00ff00, max: 0x0000ff }).to, []);
});

test("paletteRangeMapping pairs with the 'exact' remap: only pixels painted in the reference move", () => {
	const mapping = paletteRangeMapping([0x808080, 0x404040], { min: 0x000000, mid: 0xff0000, max: 0xffffff });
	const pixels = new Uint8ClampedArray([
		0x80,
		0x80,
		0x80,
		0xff, // an exact palette colour
		0x81,
		0x80,
		0x80,
		0xff, // an anti-aliased near-miss, one step off
	]);

	assert.deepEqual([...remapPixels(pixels, mapping, 'exact')], [255, 0, 0, 255, 0x81, 0x80, 0x80, 255]);
});
