import assert from 'node:assert/strict';
import test from 'node:test';
import {
	applyImageModifiers,
	applyTextureModifiers,
	blendMatrix,
	blendPixels,
	channelScaleMatrix,
	channelSwapMatrix,
	colorShiftMatrix,
	imageModifier,
	maskPixels,
	parseColorPairs,
	parseImagePath,
	parsePaletteLists,
	rotatePixels,
} from '../src/two-d/render/ImageModifiers.ts';
import { Sprite, Texture } from 'pixi.js';

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

test('parseColorPairs parses plain hex pairs with no resolver needed', () => {
	const mapping = parseColorPairs(['ff00ff>ff0000', '#000000>#0000ff']);
	assert.deepEqual(mapping, { from: [0xff00ff, 0x000000], to: [0xff0000, 0x0000ff] });
});

test('parseColorPairs resolves a named colour through the given resolver', () => {
	const resolve = (name: string) => (name === 'magenta' ? 0xff00ff : name === 'red' ? 0xff0000 : undefined);
	const mapping = parseColorPairs(['magenta>red'], resolve);
	assert.deepEqual(mapping, { from: [0xff00ff], to: [0xff0000] });
});

test('parseColorPairs drops a pair whose colour is neither hex nor resolvable', () => {
	const mapping = parseColorPairs(['magenta>red', 'ff00ff>ff0000']);
	assert.deepEqual(
		mapping,
		{ from: [0xff00ff], to: [0xff0000] },
		'the unresolvable magenta>red pair is dropped, not aborting the rest',
	);
});

test('parsePaletteLists reconstructs two comma-separated colour lists split by parseImagePath', () => {
	//parseImagePath's own naive comma split turns "ff0000,00ff00>0000ff,ffff00" into four
	//separate args before parsePaletteLists ever sees it - this is what it has to undo
	const parsed = parseImagePath('unit.png~PAL(ff0000,00ff00>0000ff,ffff00)');
	const pal = imageModifier(parsed, 'PAL')!;
	assert.deepEqual(
		pal.args,
		['ff0000', '00ff00>0000ff', 'ffff00'],
		'confirms the naive split really does split mid-list',
	);

	const mapping = parsePaletteLists(pal.args);
	assert.deepEqual(mapping, { from: [0xff0000, 0x00ff00], to: [0x0000ff, 0xffff00] });
});

test('parsePaletteLists resolves named colours through the given resolver', () => {
	const resolve = (name: string) => (name === 'magenta' ? 0xff00ff : undefined);
	const mapping = parsePaletteLists(['magenta>ff0000']);
	assert.deepEqual(mapping, { from: [], to: [0xff0000] }, 'unresolved without a resolver');
	assert.deepEqual(parsePaletteLists(['magenta>ff0000'], resolve), { from: [0xff00ff], to: [0xff0000] });
});

test('parsePaletteLists with no > is empty rather than throwing', () => {
	assert.deepEqual(parsePaletteLists(['ff0000', '00ff00']), { from: [], to: [] });
});

test('applyTextureModifiers passes ~BLIT/~MASK the full raw argument, nested modifiers included, not a bare path', () => {
	const seen: string[] = [];
	const probe = {
		resolveTexture: (pathWithModifiers: string) => {
			seen.push(pathWithModifiers);
			return Texture.EMPTY;
		},
	};

	const blitParsed = parseImagePath('base.png~BLIT(unit.png~RC(magenta>red),4,4)');
	applyTextureModifiers(Texture.EMPTY, blitParsed, probe);
	assert.deepEqual(seen, ['unit.png~RC(magenta>red)'], '~BLIT must not strip the nested ~RC before resolving');

	seen.length = 0;
	const maskParsed = parseImagePath('base.png~MASK(overlay.png~FL(horiz),0,0)');
	applyTextureModifiers(Texture.EMPTY, maskParsed, probe);
	assert.deepEqual(seen, ['overlay.png~FL(horiz)'], '~MASK must not strip the nested ~FL before resolving');
});

test('applyTextureModifiers skips ~BLIT/~MASK silently when no resolveTexture is given', () => {
	const parsed = parseImagePath('base.png~BLIT(unit.png,0,0)~MASK(overlay.png,0,0)');
	assert.doesNotThrow(() => applyTextureModifiers(Texture.EMPTY, parsed));
});

test('blendPixels lerps RGB towards the colour by ratio, leaving alpha untouched', () => {
	const pixels = new Uint8ClampedArray([0, 0, 0, 200]); // opaque black
	const out = blendPixels(pixels, 0xff0000, 0.5);
	assert.equal(out[0], 128);
	assert.equal(out[1], 0);
	assert.equal(out[2], 0);
	assert.equal(out[3], 200, 'alpha is not touched by a colour blend');
});

test('blendPixels with ratio 0 leaves the pixel unchanged, ratio 1 goes fully to the colour', () => {
	const pixels = new Uint8ClampedArray([10, 20, 30, 255]);
	assert.deepEqual([...blendPixels(pixels, 0x102030, 0)], [10, 20, 30, 255]);
	assert.deepEqual([...blendPixels(pixels, 0x102030, 1)], [0x10, 0x20, 0x30, 255]);
});

test('blendPixels leaves a fully transparent pixel untouched', () => {
	const pixels = new Uint8ClampedArray([9, 9, 9, 0]);
	assert.deepEqual([...blendPixels(pixels, 0xff0000, 1)], [9, 9, 9, 0]);
});

test('rotatePixels by 0 degrees is the identity', () => {
	const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // 2x1
	const rotated = rotatePixels(pixels, 2, 1, 0);
	assert.equal(rotated.width, 2);
	assert.equal(rotated.height, 1);
	assert.deepEqual([...rotated.data], [...pixels]);
});

test('rotatePixels by 90 degrees expands the surface, swapping width and height', () => {
	const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // 2 wide, 1 tall
	const rotated = rotatePixels(pixels, 2, 1, 90);
	assert.equal(rotated.width, 1);
	assert.equal(rotated.height, 2);
});

test('rotatePixels by 180 degrees reverses pixel order, dimensions unchanged', () => {
	const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // 2x1: red, green
	const rotated = rotatePixels(pixels, 2, 1, 180);
	assert.equal(rotated.width, 2);
	assert.equal(rotated.height, 1);
	// the pixel that was at x=0 (red) is now at x=1, and vice versa
	assert.deepEqual([...rotated.data.slice(0, 4)], [0, 255, 0, 255]);
	assert.deepEqual([...rotated.data.slice(4, 8)], [255, 0, 0, 255]);
});

test('rotatePixels leaves a destination pixel transparent when nothing in the source rotates onto it', () => {
	//a 2x2 opaque source rotated 45 degrees expands its bounding box to a diamond shape; the
	//expanded square canvas's corners have nothing to sample from and must come out fully
	//transparent, not garbage or opaque
	const pixels = new Uint8ClampedArray(2 * 2 * 4).fill(255);
	const rotated = rotatePixels(pixels, 2, 2, 45);
	let sawTransparent = false;
	for (let i = 3; i < rotated.data.length; i += 4) if (rotated.data[i] === 0) sawTransparent = true;
	assert.equal(sawTransparent, true);
});

test('~BLEND and ~ROTATE are no longer applied by applyImageModifiers, only by applyTextureModifiers', () => {
	const sprite = new Sprite();
	const initialRotation = sprite.rotation;
	const initialFilters = sprite.filters;
	applyImageModifiers(sprite, parseImagePath('unit.png~BLEND(ff0000,50)~ROTATE(90)'));
	assert.equal(sprite.rotation, initialRotation, '~ROTATE must not touch sprite.rotation any more');
	assert.equal(sprite.filters, initialFilters, '~BLEND must not attach a ColorMatrixFilter any more');
});
