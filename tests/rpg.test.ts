import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameState } from '../src/rpg/GameState.ts';
import { activePage, type MapEvent } from '../src/rpg/Event.ts';
import { EventRunner, type EventCommand } from '../src/rpg/EventRunner.ts';
import { WindowStack } from '../src/ui/WindowStack.ts';
import { loadTiledMap, type TiledMapData } from '../src/rpg/TiledMap.ts';
import { SpriteSheet } from '../src/render/SpriteSheet.ts';
import { EMPTY, tileFrame, tileFrameSheet, tileFrameIndex } from '../src/render/TileMap.ts';
import { GridMover } from '../src/rpg/GridMover.ts';
import { AnimatedSprite } from '../src/render/AnimatedSprite.ts';
import { Texture, TextureSource } from 'pixi.js';

test('switches and variables default to false/0, and round-trip through JSON', () => {
	const state = new GameState();
	assert.equal(state.switch('metPrincess'), false);
	assert.equal(state.variable('gold'), 0);

	state.setSwitch('metPrincess', true);
	state.setVariable('gold', 50);

	const restored = GameState.fromJSON(JSON.parse(JSON.stringify(state.toJSON())));
	assert.equal(restored.switch('metPrincess'), true);
	assert.equal(restored.variable('gold'), 50);
});

test('activePage picks the last page whose conditions all hold', () => {
	const state = new GameState();
	const event: MapEvent = {
		id: 'npc',
		x: 0,
		y: 0,
		pages: [
			{ trigger: 'action', commands: [], frame: 0 },
			{ trigger: 'action', commands: [], frame: 1, conditions: [{ switch: 'questDone', equals: true }] },
		],
	};

	assert.equal(activePage(event, state)?.frame, 0);

	state.setSwitch('questDone', true);
	assert.equal(activePage(event, state)?.frame, 1);
});

test('activePage returns undefined when no page matches', () => {
	const state = new GameState();
	const event: MapEvent = {
		id: 'npc',
		x: 0,
		y: 0,
		pages: [{ trigger: 'action', commands: [], conditions: [{ variable: 'level', atLeast: 5 }] }],
	};
	assert.equal(activePage(event, state), undefined);
});

test('EventRunner sets and reads switches and variables', async () => {
	const state = new GameState();
	const runner = new EventRunner({ windows: new WindowStack(), game: state });

	await runner.run([
		{ setSwitch: 'doorOpen', value: true },
		{ setVariable: 'gold', value: 10 },
		{ addVariable: 'gold', amount: 5 },
	]);

	assert.equal(state.switch('doorOpen'), true);
	assert.equal(state.variable('gold'), 15);
});

test('EventRunner branches on a condition', async () => {
	const state = new GameState();
	const runner = new EventRunner({ windows: new WindowStack(), game: state });
	state.setSwitch('hasKey', true);

	const commands: EventCommand[] = [
		{
			if: { switch: 'hasKey', equals: true },
			then: [{ setVariable: 'result', value: 1 }],
			else: [{ setVariable: 'result', value: 2 }],
		},
	];
	await runner.run(commands);
	assert.equal(state.variable('result'), 1);
});

test('EventRunner runs a call command with the shared state', async () => {
	const state = new GameState();
	const runner = new EventRunner({ windows: new WindowStack(), game: state });

	let sawGame: GameState | undefined;
	await runner.run([{ call: (s) => void (sawGame = s.game) }]);

	assert.equal(sawGame, state);
});

test('EventRunner stops running once cancelled', async () => {
	const state = new GameState();
	const runner = new EventRunner({ windows: new WindowStack(), game: state });

	await runner.run([
		{ call: () => runner.cancel() },
		{ setVariable: 'shouldNotRun', value: 1 },
	]);

	assert.equal(state.variable('shouldNotRun'), 0);
});

function tinyTilesetSheet(): SpriteSheet {
	//a blank source sized for a few 16px frames; this test never renders, only cuts frames
	const source = new TextureSource({ width: 64, height: 16 });
	return SpriteSheet.fromTexture(new Texture({ source }), 16, 16);
}

test('loadTiledMap converts a csv tile layer into TileMap frames, gid offset by firstgid', () => {
	const data: TiledMapData = {
		width: 2,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 1 }],
		layers: [{ type: 'tilelayer', name: 'ground', data: [0, 2] }],
	};

	const { map } = loadTiledMap(data, tinyTilesetSheet());
	assert.equal(map.getTile('ground', 0, 0), EMPTY);
	assert.equal(map.getTile('ground', 1, 0), 1); // gid 2 - firstgid 1 = frame 1
});

test('loadTiledMap converts object layers into tile coordinates', () => {
	const data: TiledMapData = {
		width: 4,
		height: 4,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 1 }],
		layers: [
			{ type: 'tilelayer', name: 'ground', data: new Array(16).fill(0) },
			{ type: 'objectgroup', name: 'events', objects: [{ id: 1, x: 32, y: 48, name: 'npc' }] },
		],
	};

	const { objects } = loadTiledMap(data, tinyTilesetSheet());
	assert.equal(objects.length, 1);
	assert.equal(objects[0].tileX, 2);
	assert.equal(objects[0].tileY, 3);
});

test('loadTiledMap strips Tiled flip/rotation flags from a gid', () => {
	const FLIPPED_HORIZONTALLY = 0x80000000;
	const data: TiledMapData = {
		width: 1,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 1 }],
		layers: [{ type: 'tilelayer', name: 'ground', data: [(2 | FLIPPED_HORIZONTALLY) >>> 0] }],
	};

	const { map } = loadTiledMap(data, tinyTilesetSheet());
	assert.equal(map.getTile('ground', 0, 0), 1);
});

test('loadTiledMap reads isometric and staggered orientations, choosing the matching TileMap shape', () => {
	const base = {
		width: 2,
		height: 2,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 1 }],
		layers: [],
	};

	assert.equal(loadTiledMap({ ...base, orientation: 'isometric' }, tinyTilesetSheet()).map.shape, 'isometric');
	assert.equal(loadTiledMap({ ...base, orientation: 'staggered' }, tinyTilesetSheet()).map.shape, 'staggered');
});

test('loadTiledMap refuses an orientation it does not read yet', () => {
	const data: TiledMapData = {
		width: 1,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		orientation: 'hexagonal',
		tilesets: [{ firstgid: 1 }],
		layers: [],
	};
	assert.throws(() => loadTiledMap(data, tinyTilesetSheet()));
});

test('loadTiledMap refuses a staggered map on an axis or index it does not read yet', () => {
	const base = {
		width: 1,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		orientation: 'staggered',
		tilesets: [{ firstgid: 1 }],
		layers: [],
	};

	assert.throws(() => loadTiledMap({ ...base, staggeraxis: 'x' }, tinyTilesetSheet()));
	assert.throws(() => loadTiledMap({ ...base, staggerindex: 'even' }, tinyTilesetSheet()));
});

test('tileFrame packs a sheet and frame, and plain indices decode as sheet 0', () => {
	assert.equal(tileFrameSheet(tileFrame(2, 17)), 2);
	assert.equal(tileFrameIndex(tileFrame(2, 17)), 17);
	assert.equal(tileFrameSheet(5), 0);
	assert.equal(tileFrameIndex(5), 5);
	assert.throws(() => tileFrame(-1, 0), /sheet index/);
	assert.throws(() => tileFrame(0, -1), /frame index/);
});

test('loadTiledMap reads a map mixing two tilesets, one of them external', () => {
	const data: TiledMapData = {
		width: 3,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 1 }, { firstgid: 100, source: 'tiles/walls.json' }],
		layers: [{ type: 'tilelayer', name: 'ground', data: [1, 100, 102] }],
	};

	//sheets in either order - they match tilesets by firstgid, not position
	const { map } = loadTiledMap(data, [
		{ firstgid: 100, sheet: tinyTilesetSheet() },
		{ firstgid: 1, sheet: tinyTilesetSheet() },
	]);
	assert.equal(map.getTile('ground', 0, 0), 0); // gid 1 - firstgid 1, single-owner plain index
	assert.equal(map.getTile('ground', 1, 0), tileFrame(1, 0)); // gid 100 - firstgid 100
	assert.equal(map.getTile('ground', 2, 0), tileFrame(1, 2)); // gid 102 - firstgid 100
});

test('loadTiledMap refuses one sheet for several tilesets, and a sheet count that matches none', () => {
	const data: TiledMapData = {
		width: 1,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 1 }, { firstgid: 100 }],
		layers: [],
	};
	assert.throws(() => loadTiledMap(data, tinyTilesetSheet()), /one sheet per tileset/);
	assert.throws(
		() => loadTiledMap(data, [{ firstgid: 1, sheet: tinyTilesetSheet() }]),
		/one sheet per tileset/
	);
	assert.throws(
		() =>
			loadTiledMap(data, [
				{ firstgid: 1, sheet: tinyTilesetSheet() },
				{ firstgid: 2, sheet: tinyTilesetSheet() },
			]),
		/no sheet for the tileset at firstgid 100/
	);
});

test('loadTiledMap refuses a sheet cut to another tile size, and a gid no tileset owns', () => {
	const sized = (w: number, h: number) => {
		const source = new TextureSource({ width: 64, height: 16 });
		return SpriteSheet.fromTexture(new Texture({ source }), w, h);
	};
	const data: TiledMapData = {
		width: 1,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 5 }, { firstgid: 100 }],
		layers: [{ type: 'tilelayer', name: 'ground', data: [3] }],
	};

	assert.throws(
		() =>
			loadTiledMap(data, [
				{ firstgid: 5, sheet: sized(8, 8) },
				{ firstgid: 100, sheet: tinyTilesetSheet() },
			]),
		/firstgid 5.*8x8.*16x16/
	);
	assert.throws(
		() =>
			loadTiledMap(data, [
				{ firstgid: 5, sheet: tinyTilesetSheet() },
				{ firstgid: 100, sheet: tinyTilesetSheet() },
			]),
		/below every tileset's firstgid/
	);
});

test('loadTiledMap refuses compressed layer data', () => {
	const data: TiledMapData = {
		width: 1,
		height: 1,
		tilewidth: 16,
		tileheight: 16,
		tilesets: [{ firstgid: 1 }],
		layers: [{ type: 'tilelayer', name: 'ground', encoding: 'base64', data: [] }],
	};
	assert.throws(() => loadTiledMap(data, tinyTilesetSheet()));
});

test('GridMover interpolates position across update() and snaps to the target tile', () => {
	const sprite = new AnimatedSprite();
	const mover = new GridMover(sprite, 0, 0, { tileWidth: 16, tileHeight: 16, speed: 2 });

	assert.equal(mover.moveBy(1, 0), true);
	assert.equal(mover.isMoving, true);

	mover.update(0.25); // halfway across the tile at speed 2 tiles/sec
	assert.ok(Math.abs(sprite.x - 8) < 0.001);
	assert.equal(mover.facing, 'right');

	mover.update(0.25); // completes the move
	assert.equal(mover.isMoving, false);
	assert.equal(mover.x, 1);
	assert.equal(sprite.x, 16);
});

test('GridMover.turnTo faces a direction without moving', () => {
	const sprite = new AnimatedSprite();
	const mover = new GridMover(sprite, 2, 2, { tileWidth: 16, tileHeight: 16 });

	mover.turnTo(1, 0);
	assert.equal(mover.facing, 'right');
	assert.equal(mover.isMoving, false);
	assert.equal(mover.x, 2); // position is unchanged - only the facing turned
	assert.equal(sprite.x, 32);
});

test('turnTo is ignored while a move is already in progress', () => {
	const sprite = new AnimatedSprite();
	const mover = new GridMover(sprite, 0, 0, { tileWidth: 16, tileHeight: 16 });

	mover.moveBy(1, 0); // facing becomes 'right'
	mover.turnTo(0, 1); // should not override mid-move
	assert.equal(mover.facing, 'right');
});

test('GridMover refuses a second move while already moving', () => {
	const sprite = new AnimatedSprite();
	const mover = new GridMover(sprite, 0, 0, { tileWidth: 16, tileHeight: 16 });

	assert.equal(mover.moveBy(0, 1), true);
	assert.equal(mover.moveBy(1, 0), false);
});

test('GridMover plays the walk/idle animation for the facing direction, when present', () => {
	const sprite = new AnimatedSprite();
	sprite.add('walk-right', [Texture.WHITE]);
	sprite.add('idle-right', [Texture.WHITE]);

	const mover = new GridMover(sprite, 0, 0, {
		tileWidth: 16,
		tileHeight: 16,
		speed: 100,
		walkAnimation: (d) => `walk-${d}`,
		idleAnimation: (d) => `idle-${d}`,
	});

	mover.moveBy(1, 0);
	assert.equal(sprite.playing, 'walk-right');

	mover.update(1); // finishes immediately at speed 100
	assert.equal(sprite.playing, 'idle-right');
});
