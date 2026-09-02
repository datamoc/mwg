import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture, TextureSource } from 'pixi.js';

import { LayeredSprite } from '../src/render/LayeredSprite.ts';

function blankTexture(): Texture {
	return new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
}

test('addLayer adds a child sprite, retrievable by name', () => {
	const sprite = new LayeredSprite();
	const skin = sprite.addLayer('skin', blankTexture());

	assert.equal(sprite.layer('skin'), skin);
	assert.equal(sprite.hasLayer('skin'), true);
	assert.equal(sprite.children.length, 1);
});

test('layers stack by order, lowest first', () => {
	const sprite = new LayeredSprite();
	sprite.addLayer('hair', blankTexture(), 2);
	sprite.addLayer('skin', blankTexture(), 0);
	sprite.addLayer('garment', blankTexture(), 1);

	const names = sprite.children.map((child) => {
		for (const name of ['hair', 'skin', 'garment']) {
			if (sprite.layer(name) === child) return name;
		}
		return null;
	});
	assert.deepEqual(names, ['skin', 'garment', 'hair']);
});

test('adding a layer with an existing name replaces it rather than stacking twice', () => {
	const sprite = new LayeredSprite();
	sprite.addLayer('weapon', blankTexture());
	sprite.addLayer('weapon', blankTexture());

	assert.equal(sprite.children.length, 1);
});

test('removeLayer takes it out entirely', () => {
	const sprite = new LayeredSprite();
	sprite.addLayer('hat', blankTexture());
	sprite.removeLayer('hat');

	assert.equal(sprite.hasLayer('hat'), false);
	assert.equal(sprite.children.length, 0);
});

test('setTexture swaps a layer\'s texture without touching its identity or order', () => {
	const sprite = new LayeredSprite();
	const layer = sprite.addLayer('weapon', blankTexture(), 5);
	const next = blankTexture();

	sprite.setTexture('weapon', next);
	assert.equal(sprite.layer('weapon'), layer);
	assert.equal(layer.texture, next);
});
