import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Container } from 'pixi.js';
import { toneMatrix, normalizeTone, lerpTone, ToneFilter } from '../src/two-d/render/Tone.ts';
import { ScreenEffects } from '../src/two-d/render/ScreenEffects.ts';
import { TintedSprite } from '../src/two-d/render/TintedSprite.ts';
import { PICTURE_BLEND_MODES, Picture } from '../src/two-d/render/PictureLayer.ts';
import { createPixiNamespace, attachPixiFilter } from '../src/two-d/pixi-interop.ts';
import { Filter } from 'pixi.js';

/** apply a 5x4 colour matrix to one opaque colour, the way the shader does */
function apply(matrix: readonly number[], r: number, g: number, b: number, a = 1): [number, number, number, number] {
	return [
		matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4],
		matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9],
		matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14],
		matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19],
	];
}

const close = (actual: number, expected: number, epsilon = 1e-9): void => {
	assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

test('gray 255 collapses every channel to its luminance', () => {
	const matrix = toneMatrix({ gray: 255 });
	const red = apply(matrix, 1, 0, 0);
	close(red[0], 0.299);
	close(red[1], 0.299);
	close(red[2], 0.299);
	const white = apply(matrix, 1, 1, 1);
	close(white[0], 1);
	close(white[1], 1);
	close(white[2], 1);
});

test('adding 255 to every channel turns black white, and the alpha row is untouched', () => {
	const matrix = toneMatrix({ red: 255, green: 255, blue: 255 });
	assert.deepEqual(apply(matrix, 0, 0, 0), [1, 1, 1, 1]);
	const shifted = apply(toneMatrix({ red: -255 }), 1, 1, 1);
	close(shifted[0], 0);
	close(shifted[1], 1);
	close(shifted[2], 1);
});

test('a tone combines desaturation and offsets, and channels are clamped', () => {
	const cool = toneMatrix({ gray: 255, red: -20 });
	const value = apply(cool, 0, 0, 1);
	close(value[2], 0.114, 1e-9);
	close(value[0], 0.114 - 20 / 255, 1e-9);
	const white = apply(toneMatrix({ gray: 255, red: -20 }), 1, 1, 1);
	close(white[0], 1 - 20 / 255, 1e-9);
	close(white[1], 1, 1e-9);

	assert.deepEqual(normalizeTone({ red: 999, green: -999, gray: Number.NaN }), {
		red: 255,
		green: -255,
		blue: 0,
		gray: 0,
	});
});

test('lerpTone walks each channel from one tone to the other', () => {
	assert.deepEqual(lerpTone({}, { red: 100, gray: 200 }, 0.5), {
		red: 50,
		green: 0,
		blue: 0,
		gray: 100,
	});
});

test('ToneFilter keeps its tone and rebuilds the matrix in place', () => {
	const filter = new ToneFilter({ gray: 100 });
	close(filter.matrix[0], 1 - 100 / 255 + 0.299 * (100 / 255));
	filter.tone = { red: 10 };
	assert.equal(filter.tone.red, 10);
	assert.equal(filter.tone.gray, 0);
	close(filter.matrix[4], 10 / 255);
});

test('TintedSprite.setTone stores the tone and composes with tint, and null clears it', () => {
	const sprite = new TintedSprite();
	sprite.setTone({ gray: 255 });
	assert.equal(sprite.tone.gray, 255);
	sprite.setTone({ blue: 40 });
	assert.equal(sprite.tone.blue, 40);
	assert.equal(sprite.tone.gray, 0, 'the same tone is replaced rather than stacked');
	sprite.tint = 0x808080;
	sprite.setTone(null);
	assert.equal(sprite.tone.gray, 0);
	assert.equal(sprite.tint, 0x808080, 'removing a tone leaves the sprite tint alone');
});

test('ScreenEffects.tone filters its target and eases over the duration', () => {
	const world = new Container();
	const effects = new ScreenEffects({ width: 320, height: 180, toneTarget: world });
	effects.tone({ gray: 255 }, 1);
	assert.equal(effects.isBusy, true);

	effects.update(0.5);
	const midway = effects.currentTone.gray;
	assert.ok(midway > 0 && midway < 255, 'the tone is partway there');

	assert.equal(effects.update(0.5), true);
	assert.equal(effects.isBusy, false);
	assert.equal(effects.currentTone.gray, 255);

	effects.clear();
	assert.equal(effects.currentTone.gray, 0);
});

test('ScreenEffects.tone without a target warns instead of filtering the wrong layer', () => {
	const effects = new ScreenEffects({ width: 10, height: 10 });
	const warnings: string[] = [];
	const original = console.warn;
	console.warn = (message: string) => void warnings.push(message);
	try {
		effects.tone({ gray: 255 });
	} finally {
		console.warn = original;
	}
	assert.equal(effects.isBusy, false);
	assert.ok(warnings.some((message) => message.includes('toneTarget')));
});

test('a picture carries its own live tone, separate from its tint', () => {
	const picture = new Picture('memory');
	picture.setTone({ gray: 180, blue: 20 });
	assert.equal(picture.tone.gray, 180);
	assert.equal(picture.tone.blue, 20);
	picture.setTint(0x808080);
	assert.equal(picture.tone.gray, 180, 'a tint does not disturb the tone');
	picture.setTone(null);
	assert.equal(picture.tone.gray, 0);
	assert.equal(picture.tint, 0x808080, 'clearing the tone leaves the tint alone');
});

test('a picture can name subtract, and an unknown blend mode fails by name', () => {
	assert.ok((PICTURE_BLEND_MODES as readonly string[]).includes('subtract'));
	const picture = new Picture('fog');
	assert.doesNotThrow(() => picture.setBlendMode('subtract'));
	assert.equal(picture.blendMode, 'subtract');
	assert.throws(() => picture.setBlendMode('shatter'), /not one of/);
});

test('the bounded Pixi namespace hands out constructors and attaches a filter once', () => {
	const PIXI = createPixiNamespace();
	assert.equal(PIXI.Container, Container);
	assert.equal(PIXI.Filter, Filter);
	assert.equal(typeof PIXI.GlProgram, 'function');

	const target = new Container();
	const filter = { tag: 'fake' } as unknown as Filter;
	assert.equal(attachPixiFilter(target, filter), true);
	assert.equal(attachPixiFilter(target, filter), false);
	assert.deepEqual(target.filters, [filter]);
});
