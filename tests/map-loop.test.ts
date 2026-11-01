import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MapLoop } from '../src/two-d/render/MapLoop.ts';
import { TileMap } from '../src/two-d/render/TileMap.ts';
import { SpriteSheet } from '../src/two-d/render/SpriteSheet.ts';
import { Texture, TextureSource } from 'pixi.js';

/** a 64x64 sheet of 16px tiles, no asset load needed */
function sheet(): SpriteSheet {
	return SpriteSheet.fromTexture(new Texture({ source: new TextureSource({ width: 64, height: 64 }) }), 16);
}

test('wrapPoint folds both axes into the map and leaves unwrapped axes alone', () => {
	const loop = new MapLoop({ width: 100, height: 50, wrapX: true });
	assert.deepEqual(loop.wrapPoint(130, 10), { x: 30, y: 10 });
	assert.deepEqual(loop.wrapPoint(-10, 60), { x: 90, y: 60 });
	assert.deepEqual(loop.wrapPoint(0, 0), { x: 0, y: 0 });
});

test('nearest picks the copy a viewer on the other side of the seam should see', () => {
	const loop = new MapLoop({ width: 640, height: 480, wrapX: true, wrapY: true });
	assert.deepEqual(loop.nearest(60, 100, 620, 100), { x: 700, y: 100 });
	assert.deepEqual(loop.nearest(600, 400, 20, 20), { x: -40, y: -80 });
	//an unwrapped axis never moves
	const single = new MapLoop({ width: 640, height: 480, wrapX: true });
	assert.deepEqual(single.nearest(60, 400, 620, 20), { x: 700, y: 400 });
});

test('delta takes the short way across a seam and keeps the sign with no wrap', () => {
	const loop = new MapLoop({ width: 100, height: 100, wrapX: true, wrapY: true });
	assert.deepEqual(loop.delta(90, 10, 10, 10), { x: 20, y: 0 });
	assert.deepEqual(loop.delta(10, 90, 10, 10), { x: 0, y: 20 });
	assert.deepEqual(loop.delta(20, 20, 30, 60), { x: 10, y: 40 });

	const plain = new MapLoop({ width: 100, height: 100 });
	assert.deepEqual(plain.delta(90, 10, 10, 10), { x: -80, y: 0 });
});

test('offsets lists only the map copies a view reaches', () => {
	const loop = new MapLoop({ width: 100, height: 100, wrapX: true });
	assert.deepEqual(loop.offsets(50, 50, 20, 20), [{ x: 0, y: 0 }]);
	assert.deepEqual(loop.offsets(5, 50, 20, 20), [
		{ x: -100, y: 0 },
		{ x: 0, y: 0 },
	]);
	const both = new MapLoop({ width: 100, height: 80, wrapX: true, wrapY: true });
	assert.deepEqual(both.offsets(0, 0, 60, 50), [
		{ x: -100, y: -80 },
		{ x: 0, y: -80 },
		{ x: -100, y: 0 },
		{ x: 0, y: 0 },
	]);
	assert.deepEqual(new MapLoop({ width: 10, height: 10 }).offsets(0, 0, 100, 100), [{ x: 0, y: 0 }]);
});

test('a non-positive size is rejected loudly', () => {
	assert.throws(() => new MapLoop({ width: 0, height: 10 }), /positive width and height/);
});

test('TileMap exposes the wrap through its own world size', () => {
	const map = new TileMap({ width: 20, height: 10, sheet: sheet() });
	assert.deepEqual(map.wrap, { x: false, y: false });

	map.setWrap({ x: true });
	assert.deepEqual(map.wrap, { x: true, y: false });
	assert.equal(map.worldWidth, 320);
	assert.equal(map.worldHeight, 160);
	assert.deepEqual(map.wrapPoint(-16, 20), { x: 304, y: 20 });
	assert.deepEqual(map.nearestCopy(16, 20, 310, 20), { x: 336, y: 20 });

	map.setWrap(null);
	assert.deepEqual(map.wrapPoint(-16, 20), { x: -16, y: 20 });
});

test('wrapping a non-square projection is refused instead of drawing a seam that cannot exist', () => {
	const map = new TileMap({
		width: 20,
		height: 10,
		sheet: sheet(),
		shape: 'isometric',
	});
	assert.throws(() => map.setWrap({ x: true }), /square grid/);
});
