import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Container, Graphics, Texture, TextureSource } from 'pixi.js';
import { TileMap, EMPTY } from '../src/render/TileMap.ts';
import { SpriteSheet } from '../src/render/SpriteSheet.ts';

/** diamond tiles, the isometric proportion: twice as wide as tall */
function diamondSheet(): SpriteSheet {
	const source = new TextureSource({ width: 128, height: 64 });
	return SpriteSheet.fromTexture(new Texture({ source }), 32, 16);
}

function squareSheet(): SpriteSheet {
	const source = new TextureSource({ width: 64, height: 64 });
	return SpriteSheet.fromTexture(new Texture({ source }), 16, 16);
}

/** every Graphics under the map, wherever chunks hide it */
function facesOf(map: TileMap): Graphics[] {
	const out: Graphics[] = [];
	const walk = (node: Container) => {
		for (const child of node.children) {
			if (child instanceof Graphics) out.push(child);
			if (child instanceof Container) walk(child);
		}
	};
	walk(map);
	return out;
}

test('heights default to ground, and only whole levels stick', () => {
	const map = new TileMap({ width: 2, height: 2, sheet: diamondSheet(), shape: 'isometric' });
	map.addLayer('ground', [0, 0, 0, 0]);

	assert.equal(map.getCellHeight(0, 0), 0);
	assert.equal(map.getCellHeight(9, 9), 0);

	map.setCellHeight(0, 0, 2);
	map.setCellHeight(9, 9, 5); //off the map: ignored, not an error
	assert.equal(map.getCellHeight(0, 0), 2);

	assert.throws(() => map.setCellHeight(1, 0, 1.5), /whole number/);
	assert.equal(map.getCellHeight(1, 0), 0);
});

test('a raised tile moves up one step per level, and reports its lifted top', () => {
	const map = new TileMap({ width: 2, height: 2, sheet: diamondSheet(), shape: 'isometric' });
	map.addLayer('ground', [0, 0, 0, 0]);
	assert.equal(map.heightStep, 8); //half the 16px tile, the classic block proportion

	const base = map.tileCenter(0, 0).y;
	const neighbour = map.tileCenter(1, 0).y;
	map.setCellHeight(0, 0, 2);

	assert.equal(map.tileCenter(0, 0).y, base - 16);
	assert.equal(map.tileCenter(1, 0).y, neighbour, 'the neighbour stays put');
	assert.equal(map.getTile('ground', 0, 0), 0, 'the frame is unchanged, only its drawing moved');
});

test('a custom step scales the lift', () => {
	const map = new TileMap({ width: 1, height: 1, sheet: diamondSheet(), shape: 'isometric', heightStep: 4 });
	map.addLayer('ground', [0]);

	const base = map.tileCenter(0, 0).y;
	map.setCellHeight(0, 0, 3);
	assert.equal(map.tileCenter(0, 0).y, base - 12);
});

test('a raised diamond cell grows one face object spanning every level', () => {
	const map = new TileMap({ width: 2, height: 2, sheet: diamondSheet(), shape: 'isometric' });
	map.addLayer('ground', [0, 0, 0, 0]);
	assert.equal(map.faceCount, 0);

	map.setCellHeight(0, 0, 2);
	assert.equal(map.faceCount, 1);
	assert.equal(facesOf(map).length, 1);

	map.setCellHeight(0, 0, 0);
	assert.equal(map.faceCount, 0);
	assert.equal(facesOf(map).length, 0);
});

test('faces span exactly the bands between the base diamond and the lifted top', () => {
	const map = new TileMap({ width: 2, height: 2, sheet: diamondSheet(), shape: 'isometric' });
	map.addLayer('ground', [0, 0, 0, 0]);
	map.setCellHeight(0, 0, 2);

	//cell (0,0) of a 2x2 isometric map of 32x16 diamonds sits at origin (16, 0);
	//two levels at step 8 hang the faces from y -8 down to the diamond foot at y 16
	const bounds = facesOf(map)[0].getBounds();
	assert.equal(bounds.x, 16);
	assert.equal(bounds.width, 32);
	assert.equal(bounds.y, -8);
	assert.equal(bounds.height, 24);
});

test('no bottom tile, no block: empty cells grow no faces until tiled', () => {
	const map = new TileMap({ width: 2, height: 1, sheet: diamondSheet(), shape: 'isometric' });
	map.addLayer('ground', [EMPTY, 0]);

	map.setCellHeight(0, 0, 2);
	assert.equal(map.faceCount, 0, 'raised but empty');

	map.setTile('ground', 0, 0, 1);
	assert.equal(map.faceCount, 1, 'tiled at height: the block appears');

	map.setTile('ground', 0, 0, EMPTY);
	assert.equal(map.faceCount, 0, 'tile removed: the block goes with it');
});

test('upper layers ride the lift but draw no faces of their own', () => {
	const map = new TileMap({ width: 1, height: 1, sheet: diamondSheet(), shape: 'isometric' });
	map.addLayer('ground', [0]);
	map.addLayer('roof', [1]);
	map.setCellHeight(0, 0, 1);

	assert.equal(map.faceCount, 1);
});

test('faces dim with their cell, and staggered diamonds get them too', () => {
	const map = new TileMap({ width: 2, height: 2, sheet: diamondSheet(), shape: 'staggered' });
	map.addLayer('ground', [0, 0, 0, 0]);
	map.setCellHeight(0, 0, 1);
	assert.equal(map.faceCount, 1);

	map.setCellColor(0, 0, 0x808080);
	assert.equal(facesOf(map)[0].tint, 0x808080);

	map.clearColors();
	assert.equal(facesOf(map)[0].tint, 0xffffff);
});

test('square cells lift without faces, and pits sink faceless', () => {
	const map = new TileMap({ width: 2, height: 1, sheet: squareSheet(), shape: 'square' });
	map.addLayer('ground', [0, 0]);

	const base = map.tileCenter(0, 0).y;
	map.setCellHeight(0, 0, 2);
	assert.equal(map.tileCenter(0, 0).y, base - 16);
	assert.equal(map.faceCount, 0, 'square tiles raise no walls');

	map.setCellHeight(1, 0, -1);
	assert.equal(map.tileCenter(1, 0).y, base + 8, 'a pit sinks one step with no faces');
	assert.equal(map.faceCount, 0);
});

test('a bad step is refused up front', () => {
	assert.throws(
		() => new TileMap({ width: 1, height: 1, sheet: squareSheet(), heightStep: 0 }),
		/heightStep/
	);
});
