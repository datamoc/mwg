import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture, TextureSource } from 'pixi.js';

import { ClothSprite } from '../src/two-d/render/ClothSprite.ts';

/**
 * Item 423, the GPU half: a `Cloth` simulation driving a textured mesh. Headless, like
 * the 414 tests: the vertex buffers are plain `Float32Array`s until a renderer uploads
 * them, and the browser check (`tools/check-cloth-browser.mjs`) proves the same drape
 * renders through the real GPU path.
 */

function garmentTexture(): Texture {
	return new Texture({ source: new TextureSource({ width: 64, height: 48 }) });
}

function positionsOf(sprite: ClothSprite): Float32Array {
	return Float32Array.from(sprite.geometry.getAttribute('aPosition').buffer.data as Float32Array);
}

function uvsOf(sprite: ClothSprite): Float32Array {
	return Float32Array.from(sprite.geometry.getAttribute('aUV').buffer.data as Float32Array);
}

test('a garment starts at rest with its top edge pinned and no whole-sprite rotation', () => {
	const tunic = new ClothSprite(garmentTexture(), { segmentsX: 4, segmentsY: 3 });
	assert.equal(tunic.pointCount, 5 * 4);
	assert.equal(tunic.movedCount(), 0);
	for (let column = 0; column <= 4; column++) {
		assert.equal(tunic.isPinned(tunic.indexOf(column, 0)), true);
	}
	assert.equal(tunic.isPinned(tunic.indexOf(2, 3)), false);
	assert.equal(tunic.rotation, 0);
});

test('gravity drapes the hem downward while the waistband stays bit-identical', () => {
	const tunic = new ClothSprite(garmentTexture(), {
		segmentsX: 4,
		segmentsY: 3,
		gravity: { x: 0, y: 900 },
	});
	const before = positionsOf(tunic);
	const uvs = uvsOf(tunic);
	for (let i = 0; i < 60; i++) tunic.update(1 / 60);
	const hem = tunic.pointPosition(tunic.indexOf(2, 3));
	assert.ok(hem.y > 48, 'the free hem falls below its rest height');
	assert.ok(tunic.movedCount() > 0, 'everything below the pinned edge travelled');
	const after = positionsOf(tunic);
	for (let column = 0; column <= 4; column++) {
		const index = tunic.indexOf(column, 0);
		assert.equal(after[index * 2], before[index * 2], `waistband point ${index} keeps its x`);
		assert.equal(after[index * 2 + 1], before[index * 2 + 1], `waistband point ${index} keeps its y`);
	}
	assert.deepEqual(uvsOf(tunic), uvs);
	assert.equal(tunic.rotation, 0);
});

test('pinning a corner holds it and unpinning drops it', () => {
	const scarf = new ClothSprite(garmentTexture(), {
		segmentsX: 2,
		segmentsY: 2,
		gravity: { x: 0, y: 900 },
	});
	const corner = scarf.indexOf(0, 2);
	scarf.pinPoint(corner);
	const held = scarf.pointPosition(corner);
	for (let i = 0; i < 10; i++) scarf.update(1 / 60);
	assert.deepEqual(scarf.pointPosition(corner), held);
	scarf.unpinPoint(corner);
	for (let i = 0; i < 60; i++) scarf.update(1 / 60);
	assert.ok(scarf.pointPosition(corner).y > held.y, 'the released corner falls');
});

test('a gust shoves the cloth downwind through setWind', () => {
	const banner = new ClothSprite(garmentTexture(), { segmentsX: 2, segmentsY: 1 });
	banner.setWind(600, 0);
	const before = banner.pointPosition(banner.indexOf(1, 1));
	banner.update(1 / 60);
	assert.ok(banner.pointPosition(banner.indexOf(1, 1)).x > before.x, 'the gust moves cloth downwind');
});
