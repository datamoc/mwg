import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Container, Texture, TextureSource } from 'pixi.js';
import { EMPTY, TileMap } from '../src/two-d/render/TileMap.ts';
import { SpriteSheet } from '../src/two-d/render/SpriteSheet.ts';
import { autotileCellParts, rpgmTableEdgeCells, RPGM_FLOOR_AUTOTILE_TABLE } from '../src/two-d/render/RpgmAutotile.ts';
import { TintedSprite } from '../src/two-d/render/TintedSprite.ts';

/** a raw MV A2 sheet: 16 by 12 cells of 48px */
function a2Sheet(): SpriteSheet {
	return SpriteSheet.fromTexture(new Texture({ source: new TextureSource({ width: 768, height: 576 }) }));
}

function gridSheet(): SpriteSheet {
	return SpriteSheet.fromTexture(new Texture({ source: new TextureSource({ width: 64, height: 64 }) }), 16, 16);
}

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

/** A2 kind 16 (first row of the sheet), shape 47: the full tile; what a table cell holds */
const TABLE = 2816 + 47;
const FLAGS = { [TABLE]: 0x80 };

test('floor shape 46 keeps the engine bottom-left quadrant', () => {
	assert.deepEqual(RPGM_FLOOR_AUTOTILE_TABLE[46], [
		[0, 2],
		[3, 2],
		[0, 5],
		[3, 5],
	]);
});

test('rpgmTableEdgeCells marks the cell under a table unless a table or wall is there', () => {
	const at = (objects: number[], ground: number[]) =>
		Array.from(rpgmTableEdgeCells({ width: 1, height: 3, ground, objects, flags: FLAGS }));

	//table on top: the cell below gets its edge, the row under that does not
	assert.deepEqual(at([TABLE, 0, 0], [0, 0, 0]), [0, TABLE, 0]);
	//a table cell below a table is another table, so no strip between them
	assert.deepEqual(at([TABLE, TABLE, 0], [0, 0, 0]), [0, 0, TABLE]);
	//an A3/A4 wall on the ground layer suppresses the edge (Tilemap.isShadowingTile)
	assert.deepEqual(at([TABLE, 0, 0], [0, 4352, 0]), [0, 0, 0]);
	assert.deepEqual(at([TABLE, 0, 0], [0, 5888, 0]), [0, 0, 0]);
	//an A2 tile without the table flag is no table
	assert.deepEqual(at([2816 + 48, 0, 0], [0, 0, 0]), [0, 0, 0]);
	//a map row 0 has nothing above it
	assert.equal(at([0, 0, 0], [0, 0, 0])[0], 0);
});

test('a table-edge layout cuts the table bottom quadrants to their top half', () => {
	const layout = {
		format: 'rpgm-mv' as const,
		slot: 1 as const,
		table: RPGM_FLOOR_AUTOTILE_TABLE,
		tableEdge: true,
		cycles: [],
	};
	assert.deepEqual(autotileCellParts(layout, TABLE, 0), [
		{
			sourceX: 0,
			sourceY: 36,
			sourceWidth: 24,
			sourceHeight: 12,
			destX: 0,
			destY: 0,
			destWidth: 0.5,
			destHeight: 0.25,
		},
		{
			sourceX: 24,
			sourceY: 36,
			sourceWidth: 24,
			sourceHeight: 12,
			destX: 0.5,
			destY: 0,
			destWidth: 0.5,
			destHeight: 0.25,
		},
	]);
	//kind 17 (second column): the source moves one A2 cell right
	assert.equal(autotileCellParts(layout, TABLE + 48, 0)![0].sourceX, 96);
});

test('a tableEdge set draws two strips along the top of the cell', () => {
	const map = new TileMap({ width: 1, height: 2, sheet: gridSheet(), tileWidth: 48, tileHeight: 48 });
	map.addAutotileLayer('edge', [EMPTY, TABLE], { sheet: a2Sheet(), slot: 1, tableEdge: true });

	const sprites = allSprites(map);
	assert.equal(sprites.length, 2);
	assert.deepEqual(
		sprites.map((sprite) => [sprite.x, sprite.y, sprite.texture.frame.width, sprite.texture.frame.height]),
		[
			[0, 48, 24, 12],
			[24, 48, 24, 12],
		],
	);
	for (const sprite of sprites) assert.deepEqual([sprite.scale.x, sprite.scale.y], [1, 1]);
});

test('a tableEdge set refuses any slot but A2', () => {
	const map = new TileMap({ width: 1, height: 1, sheet: gridSheet(), tileWidth: 48, tileHeight: 48 });
	assert.throws(() => map.addAutotileLayer('bad', [EMPTY], { sheet: a2Sheet(), slot: 3, tableEdge: true }), /slot 1/);
});

test('a shadow layer draws one translucent quad per set bit', () => {
	const map = new TileMap({ width: 2, height: 1, sheet: gridSheet(), tileWidth: 48, tileHeight: 48 });
	map.addShadowLayer('shadow', [0b1010, 0]);

	assert.equal(map.getTile('shadow', 0, 0), 10);
	const sprites = allSprites(map);
	//bits 1 (top-right) and 3 (bottom-right)
	assert.deepEqual(
		sprites.map((sprite) => [sprite.x, sprite.y, sprite.width, sprite.height, sprite.alpha, sprite.tint]),
		[
			[24, 0, 24, 24, 0.5, 0x000000],
			[24, 24, 24, 24, 0.5, 0x000000],
		],
	);
});

test('setTile edits shadow bits, and setCellColor leaves the shadow colour alone', () => {
	const map = new TileMap({ width: 1, height: 1, sheet: gridSheet(), tileWidth: 48, tileHeight: 48 });
	map.addShadowLayer('shadow', [0], { color: 0x101010, alpha: 0.25 });
	assert.equal(allSprites(map).length, 0);

	map.setTile('shadow', 0, 0, 0b1111);
	assert.equal(allSprites(map).length, 4);
	map.setCellColor(0, 0, 0x808080);
	for (const sprite of allSprites(map)) assert.deepEqual([sprite.tint, sprite.alpha], [0x101010, 0.25]);

	map.setTile('shadow', 0, 0, 0b0001);
	assert.equal(allSprites(map).length, 1);
	map.setTile('shadow', 0, 0, EMPTY);
	assert.equal(allSprites(map).length, 0);
});

test('addShadowLayer validates its length, name and alpha', () => {
	const map = new TileMap({ width: 2, height: 1, sheet: gridSheet() });
	assert.throws(() => map.addShadowLayer('s', [1]), /2/);
	assert.throws(() => map.addShadowLayer('s', [1, 0], { alpha: 2 }), /alpha/);
	map.addShadowLayer('s', [1, 0]);
	assert.throws(() => map.addShadowLayer('s', [1, 0]), /already/);
});
