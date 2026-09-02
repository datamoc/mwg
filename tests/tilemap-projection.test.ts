import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture, TextureSource } from 'pixi.js';

import { TileMap } from '../src/render/TileMap.ts';
import { SpriteSheet } from '../src/render/SpriteSheet.ts';
import type { Camera } from '../src/render/Camera.ts';

function tinySheet(width = 32, height = 16): SpriteSheet {
	const source = new TextureSource({ width, height });
	return SpriteSheet.fromTexture(new Texture({ source }), width, height);
}

for (const shape of ['isometric', 'staggered'] as const) {
	test(`${shape} TileMap.toTile is the inverse of tileCenter, across the whole grid`, () => {
		const map = new TileMap({ width: 6, height: 6, sheet: tinySheet(), shape });
		map.addLayer('ground', new Array(36).fill(0));

		for (let x = 0; x < 6; x++) {
			for (let y = 0; y < 6; y++) {
				const center = map.tileCenter(x, y);
				assert.deepEqual(map.toTile(center.x, center.y), { x, y }, `round-trip failed for (${x},${y})`);
			}
		}
	});

	test(`${shape} TileMap keeps every cell's centre within a non-negative bounding box`, () => {
		const map = new TileMap({ width: 5, height: 5, sheet: tinySheet(), shape });
		map.addLayer('ground', new Array(25).fill(0));

		for (let x = 0; x < 5; x++) {
			for (let y = 0; y < 5; y++) {
				const center = map.tileCenter(x, y);
				assert.ok(center.x >= 0, `(${x},${y}) centre.x = ${center.x}`);
				assert.ok(center.y >= 0, `(${x},${y}) centre.y = ${center.y}`);
				assert.ok(center.x <= map.worldWidth, `(${x},${y}) centre.x = ${center.x} > worldWidth`);
				assert.ok(center.y <= map.worldHeight, `(${x},${y}) centre.y = ${center.y} > worldHeight`);
			}
		}
	});

	test(`cull() on a ${shape} TileMap never throws and lights up at least one chunk near the origin`, () => {
		const map = new TileMap({ width: 20, height: 20, sheet: tinySheet(), shape });
		map.addLayer('ground', new Array(400).fill(0));

		const camera = { view: { x: 0, y: 0, width: 300, height: 300 } } as unknown as Camera;
		assert.doesNotThrow(() => map.cull(camera));
		assert.ok(map.visibleChunks > 0);
	});
}

test('isometric adjacent columns land at different pixel x, same shape as a diamond grid', () => {
	const map = new TileMap({ width: 6, height: 6, sheet: tinySheet(), shape: 'isometric' });
	map.addLayer('ground', new Array(36).fill(0));

	const a = map.tileCenter(2, 2);
	const b = map.tileCenter(3, 2);
	const c = map.tileCenter(2, 3);
	//moving along x and moving along y move opposite ways horizontally, the same way, vertically
	assert.notEqual(a.x, b.x);
	assert.notEqual(a.x, c.x);
	assert.equal(b.y, c.y); // (3,2) and (2,3) sit on the same diamond row
});

test('staggered rows alternate a half-tile horizontal offset', () => {
	const map = new TileMap({ width: 6, height: 4, sheet: tinySheet(), shape: 'staggered' });
	map.addLayer('ground', new Array(24).fill(0));

	const evenRow = map.tileCenter(2, 2);
	const oddRow = map.tileCenter(2, 3);
	assert.equal(Math.abs(oddRow.x - evenRow.x), map.tileWidth / 2);
});

test('a square TileMap is unaffected by the projection refactor', () => {
	const map = new TileMap({ width: 4, height: 4, sheet: tinySheet() });
	map.addLayer('ground', new Array(16).fill(0));

	assert.deepEqual(map.tileCenter(1, 2), { x: 1.5 * map.tileWidth, y: 2.5 * map.tileHeight });
	assert.deepEqual(map.toTile(1.5 * map.tileWidth, 2.5 * map.tileHeight), { x: 1, y: 2 });
	assert.equal(map.worldWidth, 4 * map.tileWidth);
	assert.equal(map.worldHeight, 4 * map.tileHeight);
});
