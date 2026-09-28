import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Texture, TextureSource } from 'pixi.js';
import { EMPTY, TileMap } from '../src/two-d/render/TileMap.ts';
import { RPGM_AUTOTILE_SLOT_BASES } from '../src/two-d/render/RpgmAutotile.ts';
import { SpriteSheet } from '../src/two-d/render/SpriteSheet.ts';
import { TintedSprite } from '../src/two-d/render/TintedSprite.ts';
import type { Container } from 'pixi.js';

function sheet(width: number, height: number, cell?: number): SpriteSheet {
	const source = new TextureSource({ width, height });
	return SpriteSheet.fromTexture(new Texture({ source }), cell, cell);
}

// ------------------------------------------------------------------ stampRect

test('stampRect copies a block into a layer and leaves the other cells alone', () => {
	const map = new TileMap({ width: 4, height: 3, sheet: sheet(64, 64, 16) });
	map.addLayer('decor', new Array(12).fill(7));
	map.stampRect('decor', 1, 1, 2, 2, [1, 2, EMPTY, 4]);
	assert.equal(map.getTile('decor', 1, 1), 1);
	assert.equal(map.getTile('decor', 2, 1), 2);
	assert.equal(map.getTile('decor', 1, 2), EMPTY);
	assert.equal(map.getTile('decor', 2, 2), 4);
	assert.equal(map.getTile('decor', 0, 0), 7);
	assert.equal(map.getTile('decor', 3, 2), 7);
});

test('stampRect refuses a block that overflows the map or has the wrong length', () => {
	const map = new TileMap({ width: 4, height: 3, sheet: sheet(64, 64, 16) });
	map.addLayer('decor');
	assert.throws(() => map.stampRect('decor', 3, 0, 2, 1, [1, 2]), /does not fit/);
	assert.throws(() => map.stampRect('decor', 0, 2, 1, 2, [1, 2]), /does not fit/);
	assert.throws(() => map.stampRect('decor', -1, 0, 1, 1, [1]), /does not fit/);
	assert.throws(() => map.stampRect('decor', 0, 0, 2, 2, [1]), /needs 4 frames/);
	assert.throws(() => map.stampRect('nope', 0, 0, 1, 1, [1]), /nope/);
});

// --------------------------------------------------------------- mixed A4 mode

function frames(map: TileMap): string[] {
	const out: string[] = [];
	const walk = (node: Container) => {
		for (const child of node.children) {
			if (child instanceof TintedSprite) out.push(JSON.stringify(child.texture.frame));
			walk(child as Container);
		}
	};
	walk(map);
	return out;
}

function a4Frames(mode: 'floor' | 'wall' | 'mixed' | undefined, kindOffset: number, shape: number): string[] {
	const map = new TileMap({ width: 1, height: 1, sheet: sheet(64, 64, 16), tileWidth: 48, tileHeight: 48 });
	map.addAutotileLayer('walls', [RPGM_AUTOTILE_SLOT_BASES[3] + kindOffset * 48 + shape], {
		sheet: sheet(768, 720),
		slot: 3,
		mode,
	});
	return frames(map);
}

test('mixed mode reads even A4 kind rows with the floor table and odd rows with the wall table', () => {
	//kind 80 sits on row 10 (a wall top), kind 88 on row 11 (a wall face)
	for (const shape of [0, 5, 16, 47]) {
		assert.deepEqual(a4Frames('mixed', 0, shape), a4Frames('floor', 0, shape), `top row, shape ${shape}`);
		assert.deepEqual(a4Frames('mixed', 8, shape), a4Frames('wall', 8, shape), `face row, shape ${shape}`);
	}
	assert.notDeepEqual(a4Frames('floor', 0, 5), a4Frames('wall', 0, 5));
});

test('the default for an A4 sheet stays the wall table', () => {
	assert.deepEqual(a4Frames(undefined, 0, 5), a4Frames('wall', 0, 5));
});
