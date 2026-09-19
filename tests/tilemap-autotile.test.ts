import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Container, Texture, TextureSource } from 'pixi.js';
import { EMPTY, TileMap } from '../src/two-d/render/TileMap.ts';
import { SpriteSheet } from '../src/two-d/render/SpriteSheet.ts';
import type { AutotileSet } from '../src/two-d/render/TileMap.ts';
import { TintedSprite } from '../src/two-d/render/TintedSprite.ts';

/** a raw MV A1 sheet: 16 by 12 cells of 48px, slot 0 */
function mvSheet(): SpriteSheet {
	const source = new TextureSource({ width: 768, height: 576 });
	return SpriteSheet.fromTexture(new Texture({ source }));
}

/** a raw MV A2 sheet: same grid, slot 1 */
function mvSheet2(): SpriteSheet {
	const source = new TextureSource({ width: 768, height: 576 });
	return SpriteSheet.fromTexture(new Texture({ source }));
}

/** one XP autotile image */
function xpSheet(width = 96, height = 128): SpriteSheet {
	const source = new TextureSource({ width, height });
	return SpriteSheet.fromTexture(new Texture({ source }));
}

function smallMap(sheet: SpriteSheet): TileMap {
	return new TileMap({ width: 2, height: 2, sheet, tileWidth: 48, tileHeight: 48 });
}

/** a gridded sheet for maps that also carry plain layers (autotile sets bring their own sheets) */
function gridSheet(): SpriteSheet {
	const source = new TextureSource({ width: 64, height: 64 });
	return SpriteSheet.fromTexture(new Texture({ source }), 16, 16);
}

/** every drawn sprite under the map, in build order */
function allSprites(map: TileMap): TintedSprite[] {
	const out: TintedSprite[] = [];
	const walk = (node: Container) => {
		for (const child of node.children) {
			if (child instanceof TintedSprite) out.push(child);
			if (child instanceof Container) walk(child);
		}
	};
	walk(map);
	return out;
}

/** the quadrant sprites of one cell: public children filtered to its tile box */
function cellSprites(map: TileMap, x: number, y: number): TintedSprite[] {
	const lift = map.getCellHeight(x, y) * map.heightStep;
	return allSprites(map).filter(
		(sprite) =>
			sprite.x >= x * map.tileWidth &&
			sprite.x < (x + 1) * map.tileWidth &&
			sprite.y >= y * map.tileHeight - lift &&
			sprite.y < (y + 1) * map.tileHeight - lift,
	);
}

function frameOf(sprite: TintedSprite): [number, number, number, number] {
	const frame = sprite.texture.frame;
	return [frame.x, frame.y, frame.width, frame.height];
}

test('an MV autotile cell builds four quadrant sprites, no atlas canvas', () => {
	const map = smallMap(mvSheet());
	map.addAutotileLayer('sea', [2048, 2049, EMPTY, 2096], { sheet: mvSheet(), slot: 0 });

	assert.equal(map.layerCount, 1);
	assert.equal(map.getTile('sea', 0, 0), 2048);
	assert.equal(map.getTile('sea', 1, 0), 2049);
	assert.equal(map.getTile('sea', 0, 1), EMPTY);

	const sprites = cellSprites(map, 0, 0);
	assert.equal(sprites.length, 4);
	assert.deepEqual(
		sprites.map((sprite) => [sprite.x, sprite.y]),
		[
			[0, 0],
			[24, 0],
			[0, 24],
			[24, 24],
		],
	);
	for (const sprite of sprites) assert.deepEqual([sprite.scale.x, sprite.scale.y], [1, 1]);
	//tile 2048 is kind 0, shape 0: the template's second row, sampled raw
	assert.deepEqual(sprites.map(frameOf), [
		[48, 96, 24, 24],
		[24, 96, 24, 24],
		[48, 72, 24, 24],
		[24, 72, 24, 24],
	]);
	assert.deepEqual(cellSprites(map, 0, 1), []);
});

test('tints, adds and lifts reach every quadrant sprite', () => {
	const map = smallMap(mvSheet());
	map.addAutotileLayer('sea', [2048, EMPTY, EMPTY, EMPTY], { sheet: mvSheet(), slot: 0 });

	map.setCellColor(0, 0, 0xff0000, 0x000011);
	for (const sprite of cellSprites(map, 0, 0)) {
		assert.equal(sprite.tint, 0xff0000);
		assert.equal(sprite.colorAdd, 0x000011);
	}

	const bases = cellSprites(map, 0, 0).map((sprite) => sprite.y);
	map.setCellHeight(0, 0, 2);
	cellSprites(map, 0, 0).forEach((sprite, i) => {
		assert.equal(sprite.y, bases[i] - map.heightStep * 2);
	});
});

test('setTile edits autotile cells by raw id', () => {
	const map = smallMap(mvSheet());
	map.addAutotileLayer('sea', [2048, EMPTY, EMPTY, EMPTY], { sheet: mvSheet(), slot: 0 });

	map.setTile('sea', 0, 0, 2049);
	assert.equal(map.getTile('sea', 0, 0), 2049);
	assert.equal(cellSprites(map, 0, 0).length, 4);
	assert.deepEqual(frameOf(cellSprites(map, 0, 0)[0]).slice(0, 2), [48, 0]);

	map.setTile('sea', 0, 0, 2048);
	map.setTile('sea', 1, 0, 2048);
	assert.deepEqual(
		cellSprites(map, 1, 0).map(frameOf),
		cellSprites(map, 0, 0).map(frameOf),
		'the same id samples the same sources anywhere',
	);

	map.setTile('sea', 0, 0, EMPTY);
	assert.equal(map.getTile('sea', 0, 0), EMPTY);
	assert.deepEqual(cellSprites(map, 0, 0), []);

	assert.throws(() => map.setTile('sea', 1, 0, 3000), /matches none of its sets/);
	assert.throws(() => map.setTile('nope', 0, 0, 2048), /no such layer/);
	map.setTile('sea', 9, 9, 2048); //off the map: ignored, not an error
});

test('setAutotileFrame advances kind cycles and nothing else', () => {
	const map = smallMap(mvSheet());
	map.addAutotileLayer('sea', [2048, 2288, EMPTY, EMPTY], { sheet: mvSheet(), slot: 0, animation: [[0, 1, 2]] });

	const plain = smallMap(mvSheet());
	plain.addAutotileLayer('still', [2096, 2288, EMPTY, EMPTY], { sheet: mvSheet(), slot: 0 });

	map.setAutotileFrame('sea', 1);
	assert.equal(map.getAutotileFrame('sea'), 1);
	assert.deepEqual(
		cellSprites(map, 0, 0).map(frameOf),
		cellSprites(plain, 0, 0).map(frameOf),
		'kind 0 at frame 1 samples kind 1',
	);
	assert.deepEqual(
		cellSprites(map, 1, 0).map(frameOf),
		cellSprites(plain, 1, 0).map(frameOf),
		'kind 5 sits outside the cycle: its sources never move',
	);

	const textures = cellSprites(map, 0, 0).map((sprite) => sprite.texture);
	map.setAutotileFrame('sea', 1);
	assert.deepEqual(
		cellSprites(map, 0, 0).map((sprite) => sprite.texture),
		textures,
		'a repeated frame re-points nothing',
	);

	assert.throws(() => map.setAutotileFrame('sea', -1), /at or above zero/);
	assert.throws(() => map.setAutotileFrame('sea', 1.5), /at or above zero/);
	assert.throws(() => map.setAutotileFrame('missing', 1), /no such layer/);
});

test('setAutotileFrame refuses plain layers, and animationFrame sets the start', () => {
	const map = new TileMap({ width: 2, height: 2, sheet: gridSheet(), tileWidth: 48, tileHeight: 48 });
	map.addLayer('ground', [0, 0, 0, 0]);
	map.addAutotileLayer('sea', [2048, EMPTY, EMPTY, EMPTY], { sheet: mvSheet(), slot: 0, animationFrame: 2 });

	assert.equal(map.getAutotileFrame('sea'), 2);
	assert.throws(() => map.setAutotileFrame('ground', 1), /not an autotile layer/);
	assert.throws(() => map.getAutotileFrame('ground'), /not an autotile layer/);
});

test('addAutotileLayer validates names, lengths, sets and cells up front', () => {
	const map = new TileMap({ width: 2, height: 2, sheet: gridSheet(), tileWidth: 48, tileHeight: 48 });
	map.addLayer('ground', [0, 0, 0, 0]);

	assert.throws(
		() => map.addAutotileLayer('ground', [2048, 2048, 2048, 2048], { sheet: mvSheet(), slot: 0 }),
		/already has a layer/,
	);
	assert.throws(
		() => map.addAutotileLayer('sea', [2048, 2048], { sheet: mvSheet(), slot: 0 }),
		/has 2 cells, but the map has 4/,
	);
	assert.throws(() => map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], []), /at least one set/);
	assert.throws(() => map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], { sheet: mvSheet() }), /needs a slot/);
	assert.throws(
		() =>
			map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], {
				sheet: mvSheet(),
				slot: 0,
				mode: 'steep' as never,
			}),
		/unknown mode/,
	);
	assert.throws(
		() =>
			map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], {
				sheet: mvSheet(),
				slot: 0,
				format: 'rpgm-ace' as never,
			}),
		/unknown format/,
	);
	assert.throws(
		() => map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], { sheet: mvSheet(), slot: 0, animation: [[]] }),
		/at least one kind/,
	);
	assert.throws(
		() =>
			map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], { sheet: mvSheet(), slot: 0, animation: [[0, 99]] }),
		/outside slot 0/,
	);
	assert.throws(
		() =>
			map.addAutotileLayer(
				'sea',
				[2048, 2048, 2048, 2048],
				[
					{ sheet: mvSheet(), slot: 0 },
					{ sheet: mvSheet(), slot: 0 },
				],
			),
		/two sets for slot 0/,
	);
	assert.throws(
		() =>
			map.addAutotileLayer(
				'sea',
				[2048, 2048, 2048, 2048],
				[
					{ sheet: mvSheet(), slot: 0, animationFrame: 1 },
					{ sheet: mvSheet2(), slot: 1, animationFrame: 2 },
				],
			),
		/disagree on their initial animation frame/,
	);
	assert.throws(
		() => map.addAutotileLayer('sea', [3000, 2048, 2048, 2048], { sheet: mvSheet(), slot: 0 }),
		/matches none of its sets/,
	);
	//nothing registered when validation fails: the name stays free and the count holds
	assert.equal(map.layerCount, 1);
	map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], { sheet: mvSheet(), slot: 0 });
	assert.equal(map.layerCount, 2);
});

test('one layer can span several MV families, routing cells by slot', () => {
	const first = mvSheet();
	const second = mvSheet2();
	const map = smallMap(first);
	map.addAutotileLayer(
		'mixed',
		[2048, 2816, EMPTY, EMPTY],
		[
			{ sheet: first, slot: 0 },
			{ sheet: second, slot: 1 },
		],
	);

	const fromFirst = cellSprites(map, 0, 0)[0];
	const fromSecond = cellSprites(map, 1, 0)[0];
	assert.notEqual(fromFirst.texture.source, fromSecond.texture.source);
	assert.equal(fromFirst.texture.source, first.texture.source);
	assert.equal(fromSecond.texture.source, second.texture.source);
	//slot 1 defaults to the floor table: tile 2816 is kind 16, shape 0
	assert.deepEqual(frameOf(fromSecond).slice(0, 2), [48, 96]);
});

test('an XP template layer samples mini-blocks at tile halves', () => {
	const sheet = xpSheet();
	const map = smallMap(sheet);
	//tile 129 is autotile 2, pattern 33: mini-blocks 14, 15, 44, 45
	map.addAutotileLayer('water', [129, EMPTY, EMPTY, EMPTY], { sheet, format: 'rpgm-xp', index: 2 });

	const sprites = cellSprites(map, 0, 0);
	assert.equal(sprites.length, 4);
	assert.deepEqual(sprites.map(frameOf), [
		[32, 32, 16, 16],
		[48, 32, 16, 16],
		[32, 112, 16, 16],
		[48, 112, 16, 16],
	]);
	assert.deepEqual(
		sprites.map((sprite) => [sprite.x, sprite.y]),
		[
			[0, 0],
			[24, 0],
			[0, 24],
			[24, 24],
		],
	);
	for (const sprite of sprites) assert.deepEqual([sprite.scale.x, sprite.scale.y], [1.5, 1.5]);

	map.setCellColor(0, 0, 0x00ff00, 0);
	for (const sprite of cellSprites(map, 0, 0)) assert.equal(sprite.tint, 0x00ff00);

	assert.throws(() => map.setTile('water', 0, 0, 49), /matches none of its sets/);
	assert.throws(() => map.setTile('water', 0, 0, 384), /matches none of its sets/);
});

test('XP frame stripes advance together and wrap around', () => {
	const sheet = xpSheet(192, 128);
	const map = smallMap(sheet);
	map.addAutotileLayer('water', [129, EMPTY, EMPTY, EMPTY], { sheet, format: 'rpgm-xp', index: 2 });

	const still = [
		[32, 32, 16, 16],
		[48, 32, 16, 16],
		[32, 112, 16, 16],
		[48, 112, 16, 16],
	];
	assert.deepEqual(cellSprites(map, 0, 0).map(frameOf), still);
	map.setAutotileFrame('water', 1);
	assert.deepEqual(
		cellSprites(map, 0, 0).map(frameOf),
		still.map(([x, y, w, h]) => [x + 96, y, w, h]),
	);
	map.setAutotileFrame('water', 2);
	assert.deepEqual(cellSprites(map, 0, 0).map(frameOf), still);
});

test('XP single-tile strips draw one whole tile per frame', () => {
	const sheet = xpSheet(128, 32);
	const map = smallMap(sheet);
	map.addAutotileLayer('flowers', [3, EMPTY, EMPTY, EMPTY], { sheet, format: 'rpgm-xp', index: 0 });

	const sprites = cellSprites(map, 0, 0);
	assert.equal(sprites.length, 1);
	assert.deepEqual(frameOf(sprites[0]), [0, 0, 32, 32]);
	assert.deepEqual([sprites[0].x, sprites[0].y], [0, 0]);
	assert.deepEqual([sprites[0].scale.x, sprites[0].scale.y], [1.5, 1.5]);

	map.setAutotileFrame('flowers', 3);
	assert.deepEqual(frameOf(cellSprites(map, 0, 0)[0]), [96, 0, 32, 32]);
	map.setAutotileFrame('flowers', 4);
	assert.deepEqual(frameOf(cellSprites(map, 0, 0)[0]), [0, 0, 32, 32]);
});

test('XP sets validate index, frames and image shape', () => {
	const map = smallMap(xpSheet());
	const cells: AutotileSet = { sheet: xpSheet(), format: 'rpgm-xp', index: 2 };

	assert.throws(() => map.addAutotileLayer('bad', [129, 129, 129, 129], { ...cells, index: 8 }), /0-7/);
	assert.throws(() => map.addAutotileLayer('bad', [129, 129, 129, 129], { ...cells, frames: 0 }), /at least 1/);
	assert.throws(() => map.addAutotileLayer('bad', [129, 129, 129, 129], { ...cells, frames: 2 }), /fits 1/);
	assert.throws(
		() =>
			map.addAutotileLayer('bad', [129, 129, 129, 129], { sheet: xpSheet(96, 64), format: 'rpgm-xp', index: 2 }),
		/128px templates or 32px single-tile strips/,
	);
	assert.throws(
		() =>
			map.addAutotileLayer('bad', [129, 129, 129, 129], { sheet: xpSheet(96, 192), format: 'rpgm-xp', index: 2 }),
		/128px templates or 32px single-tile strips/,
	);
	assert.throws(
		() => map.addAutotileLayer('bad', [129, 129, 129, 129], [{ ...cells }, { ...cells }]),
		/two sets for autotile 2/,
	);
	assert.throws(() => map.addAutotileLayer('bad', [49, 129, 129, 129], cells), /matches none of its sets/);
	assert.equal(map.layerCount, 0);
});

test('elevation faces follow an autotile bottom layer too', () => {
	//faces only exist on isometric maps, like the plain-layer elevation tests
	const map = new TileMap({
		width: 2,
		height: 2,
		sheet: mvSheet(),
		tileWidth: 48,
		tileHeight: 24,
		shape: 'isometric',
	});
	map.addAutotileLayer('sea', [2048, 2048, 2048, 2048], { sheet: mvSheet(), slot: 0 });
	assert.equal(map.faceCount, 0);

	const before = allSprites(map).map((sprite) => sprite.y);
	map.setCellHeight(0, 0, 1);
	assert.equal(map.faceCount, 1);
	const after = allSprites(map).map((sprite) => sprite.y);
	assert.equal(after.filter((y, i) => y !== before[i]).length, 4);
	after.forEach((y, i) => {
		if (y !== before[i]) assert.equal(y, before[i] - map.heightStep);
	});

	map.setTile('sea', 0, 0, EMPTY);
	assert.equal(map.faceCount, 0);
});

test('one layer can mix XP template and single-tile images', () => {
	const template = xpSheet(96, 128);
	const strip = xpSheet(128, 32);
	const map = smallMap(template);
	map.addAutotileLayer(
		'mixed',
		[129, 3, EMPTY, EMPTY],
		[
			{ sheet: template, format: 'rpgm-xp', index: 2 },
			{ sheet: strip, format: 'rpgm-xp', index: 0 },
		],
	);

	assert.equal(cellSprites(map, 0, 0).length, 4);
	assert.equal(cellSprites(map, 1, 0).length, 1);

	//editing across sets rebuilds the sprite count, inside one set re-points it
	map.setTile('mixed', 0, 0, 3);
	assert.equal(cellSprites(map, 0, 0).length, 1);
	assert.deepEqual(frameOf(cellSprites(map, 0, 0)[0]), [0, 0, 32, 32]);
	map.setTile('mixed', 0, 0, 129);
	assert.equal(cellSprites(map, 0, 0).length, 4);
});
