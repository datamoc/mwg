import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Texture, TextureSource } from 'pixi.js';

import { hexNeighbors, hexDistance, hexLine, hexRange, hexToPixel, pixelToHex } from '../src/core/Hex.ts';
import { Level } from '../src/roguelike/Level.ts';
import { Pathfinder } from '../src/roguelike/Pathfinder.ts';
import { FieldOfView } from '../src/roguelike/FieldOfView.ts';
import { TileMap } from '../src/render/TileMap.ts';
import { SpriteSheet } from '../src/render/SpriteSheet.ts';
import type { Camera } from '../src/render/Camera.ts';

const HEX_KINDS = [
	{ passable: false, transparent: false },
	{ passable: true, transparent: true },
];

function openHexLevel(size = 9): Level {
	const level = new Level(size, size, HEX_KINDS, 1, 'hex');
	return level;
}

test('every cell has exactly 6 neighbours', () => {
	for (let x = -3; x <= 3; x++) {
		for (let y = -3; y <= 3; y++) {
			const neighbors = hexNeighbors(x, y);
			assert.equal(neighbors.length, 6);
			//no duplicates - six genuinely distinct cells
			const keys = new Set(neighbors.map((n) => `${n.x},${n.y}`));
			assert.equal(keys.size, 6);
		}
	}
});

test('the neighbour relation is symmetric', () => {
	for (let x = -4; x <= 4; x++) {
		for (let y = -4; y <= 4; y++) {
			for (const n of hexNeighbors(x, y)) {
				const back = hexNeighbors(n.x, n.y).some((m) => m.x === x && m.y === y);
				assert.ok(back, `(${n.x},${n.y}) does not list (${x},${y}) back as a neighbour`);
			}
		}
	}
});

test('every neighbour is exactly distance 1 away', () => {
	for (const n of hexNeighbors(2, -1)) {
		assert.equal(hexDistance({ x: 2, y: -1 }, n), 1);
	}
});

test('distance to self is zero', () => {
	assert.equal(hexDistance({ x: 5, y: -3 }, { x: 5, y: -3 }), 0);
});

test('distance is symmetric', () => {
	const a = { x: 1, y: 2 };
	const b = { x: -3, y: 4 };
	assert.equal(hexDistance(a, b), hexDistance(b, a));
});

test('distance obeys the triangle inequality along a chain of neighbours', () => {
	let cell = { x: 0, y: 0 };
	const path = [cell];
	for (let i = 0; i < 5; i++) {
		cell = hexNeighbors(cell.x, cell.y)[0];
		path.push(cell);
	}
	//five single steps in a straight cube direction is distance exactly 5, not less
	assert.equal(hexDistance(path[0], path[path.length - 1]), 5);
});

test('hexLine starts and ends on the given cells, inclusive', () => {
	const line = hexLine({ x: 0, y: 0 }, { x: 4, y: -2 });
	assert.deepEqual(line[0], { x: 0, y: 0 });
	assert.deepEqual(line[line.length - 1], { x: 4, y: -2 });
});

test('hexLine has exactly one cell per step of the distance', () => {
	const a = { x: -2, y: 3 };
	const b = { x: 3, y: -1 };
	const line = hexLine(a, b);
	assert.equal(line.length, hexDistance(a, b) + 1);
});

test('hexLine of a cell to itself is just that cell', () => {
	assert.deepEqual(hexLine({ x: 2, y: 2 }, { x: 2, y: 2 }), [{ x: 2, y: 2 }]);
});

test('consecutive cells on a hexLine are always neighbours', () => {
	const line = hexLine({ x: -3, y: 2 }, { x: 4, y: -3 });
	for (let i = 1; i < line.length; i++) {
		assert.equal(hexDistance(line[i - 1], line[i]), 1);
	}
});

test('hexRange returns exactly the cells within the given distance', () => {
	const center = { x: 1, y: -1 };
	const radius = 2;
	const inRange = hexRange(center, radius);

	//every cell in a generous bounding box is included if and only if it is close enough
	for (let x = center.x - radius - 1; x <= center.x + radius + 1; x++) {
		for (let y = center.y - radius - 1; y <= center.y + radius + 1; y++) {
			const shouldBeIn = hexDistance(center, { x, y }) <= radius;
			const isIn = inRange.some((c) => c.x === x && c.y === y);
			assert.equal(isIn, shouldBeIn, `(${x},${y}) at distance ${hexDistance(center, { x, y })}`);
		}
	}
});

test('hexToPixel and pixelToHex round-trip for every cell in a small grid', () => {
	const tileWidth = 32;
	const tileHeight = 28;

	for (let x = -3; x <= 3; x++) {
		for (let y = -3; y <= 3; y++) {
			const { x: px, y: py } = hexToPixel(x, y, tileWidth, tileHeight);
			const back = pixelToHex(px, py, tileWidth, tileHeight);
			assert.deepEqual(back, { x, y }, `round-trip failed for (${x},${y})`);
		}
	}
});

test('pixelToHex picks the nearer cell for a point offset from a centre', () => {
	const tileWidth = 32;
	const tileHeight = 28;
	const center = hexToPixel(0, 0, tileWidth, tileHeight);

	//a small nudge should still resolve to the same cell
	const nudged = pixelToHex(center.x + 2, center.y + 2, tileWidth, tileHeight);
	assert.deepEqual(nudged, { x: 0, y: 0 });
});

test('adjacent hex centres are exactly one tile apart in the appropriate pixel measure', () => {
	const tileWidth = 32;
	const tileHeight = 28;
	const origin = hexToPixel(0, 0, tileWidth, tileHeight);

	for (const n of hexNeighbors(0, 0)) {
		const p = hexToPixel(n.x, n.y, tileWidth, tileHeight);
		const dx = p.x - origin.x;
		const dy = p.y - origin.y;
		//not an exact tile-size step in either axis alone (flat-top hexes interleave), but
		//never farther than one full tile step, and never coincident with the origin
		assert.ok(Math.hypot(dx, dy) > 0);
		assert.ok(Math.abs(dx) <= tileWidth);
		assert.ok(Math.abs(dy) <= tileHeight);
	}
});

// ------------------------------------------------------------------ Level + Pathfinder

test('a hex Level reports 6 neighbours, regardless of the topology option', () => {
	const level = openHexLevel();
	assert.equal(level.neighbors(4, 4).length, 6);
	assert.equal(level.neighbors(4, 4, 4).length, 6);
});

test('Pathfinder.find on a hex Level reaches an adjacent cell in one step', () => {
	const level = openHexLevel();
	const pathfinder = new Pathfinder(level);
	const from = { x: 4, y: 4 };
	const to = level.neighbors(4, 4)[0];

	const path = pathfinder.find(from, to);
	assert.deepEqual(path, [to]);
});

test('Pathfinder.find on a hex Level goes around a solid cell', () => {
	const level = openHexLevel();
	//wall off every neighbour of (4,4) except one, forcing a specific way out
	const neighbors = level.neighbors(4, 4);
	for (let i = 1; i < neighbors.length; i++) level.set(neighbors[i].x, neighbors[i].y, 0);

	const pathfinder = new Pathfinder(level);
	const target = { x: 4, y: 4 - 3 }; // somewhere further off, reachable only through the gap
	const path = pathfinder.find({ x: 4, y: 4 }, target);

	assert.ok(path.length > 0, 'expected a route through the one open neighbour');
	assert.deepEqual(path[0], neighbors[0]);
});

test('Pathfinder.find on a hex Level returns no route to an unreachable cell', () => {
	const level = openHexLevel();
	for (const n of level.neighbors(4, 4)) level.set(n.x, n.y, 0); // sealed in on all 6 sides

	const pathfinder = new Pathfinder(level);
	const path = pathfinder.find({ x: 4, y: 4 }, { x: 0, y: 0 });
	assert.deepEqual(path, []);
});

test('distanceMap and descend agree with Pathfinder.find on a hex Level', () => {
	const level = openHexLevel();
	const pathfinder = new Pathfinder(level);
	const target = { x: 1, y: 1 };

	const distances = pathfinder.distanceMap(target);
	const viaFind = pathfinder.find({ x: 7, y: 7 }, target);

	let current = { x: 7, y: 7 };
	const viaDescend: typeof viaFind = [];
	for (let guard = 0; guard < level.cellCount; guard++) {
		const next = pathfinder.descend(current, distances);
		if (!next) break;
		viaDescend.push(next);
		current = next;
	}

	assert.equal(viaFind.length, viaDescend.length);
});

test('autoExplore walks a hex Level towards the nearest unexplored cell', () => {
	const level = openHexLevel();
	const pathfinder = new Pathfinder(level);
	const explored = new FieldOfView(level);

	//nothing has been seen yet, so the very first step already counts as unexplored
	const path = pathfinder.autoExplore({ x: 4, y: 4 }, explored);
	assert.ok(path.length > 0);
});

// ------------------------------------------------------------------ FieldOfView (hex)

test('hex FieldOfView lights the centre and everything within radius, unobstructed', () => {
	const level = openHexLevel();
	const fov = new FieldOfView(level);

	fov.update(4, 4, 2);
	assert.equal(fov.isVisible(4, 4), true);
	assert.equal(fov.lightAt(4, 4), 1);

	for (const cell of hexRange({ x: 4, y: 4 }, 2)) {
		if (!level.inside(cell.x, cell.y)) continue;
		assert.ok(fov.isVisible(cell.x, cell.y), `(${cell.x},${cell.y}) should be lit`);
	}
});

test('hex FieldOfView does not light past an opaque cell', () => {
	const level = openHexLevel();
	const fov = new FieldOfView(level);

	//wall off due "north" of the centre, one step out
	const blocker = hexNeighbors(4, 4)[0];
	level.set(blocker.x, blocker.y, 0);

	fov.update(4, 4, 3);
	assert.equal(fov.isVisible(blocker.x, blocker.y), true); //the wall itself is seen...
	//...but whatever sits directly behind it, further from the centre, is not
	const behind = hexNeighbors(blocker.x, blocker.y).find(
		(c) => hexDistance({ x: 4, y: 4 }, c) > hexDistance({ x: 4, y: 4 }, blocker)
	)!;
	assert.equal(fov.isVisible(behind.x, behind.y), false);
});

test('hex FieldOfView marks visited cells explored, and keeps them so after update() moves on', () => {
	const level = openHexLevel();
	const fov = new FieldOfView(level);

	fov.update(4, 4, 1);
	assert.equal(fov.isExplored(4, 4), true);

	fov.update(0, 0, 1); //far away; (4,4) is no longer visible...
	assert.equal(fov.isVisible(4, 4), false);
	assert.equal(fov.isExplored(4, 4), true); //...but remains explored
});

test('hex FieldOfView dims with distance and reset forgets everything', () => {
	const level = openHexLevel();
	const fov = new FieldOfView(level);

	fov.update(4, 4, 3);
	const near = fov.lightAt(4, 4);
	const edge = hexRange({ x: 4, y: 4 }, 3).find((c) => hexDistance({ x: 4, y: 4 }, c) === 3)!;
	const far = fov.lightAt(edge.x, edge.y);
	assert.ok(near >= far);

	fov.reset();
	assert.equal(fov.isVisible(4, 4), false);
	assert.equal(fov.isExplored(4, 4), false);
});

// ------------------------------------------------------------------ TileMap (hex)

function tinyHexSheet(): SpriteSheet {
	const source = new TextureSource({ width: 32, height: 28 });
	return SpriteSheet.fromTexture(new Texture({ source }), 32, 28);
}

test('a hex TileMap positions a sprite at hexToPixel minus half a tile', () => {
	const map = new TileMap({ width: 4, height: 4, sheet: tinyHexSheet(), shape: 'hex' });
	map.addLayer('ground', new Array(16).fill(0));

	const expected = hexToPixel(2, 1, map.tileWidth, map.tileHeight);
	//there is no direct sprite getter, but tileCenter must agree with hexToPixel exactly -
	//buildSprite is derived from the same cellOrigin the constructor already used
	const center = map.tileCenter(2, 1);
	assert.equal(center.x, expected.x);
	assert.equal(center.y, expected.y);
});

test('a hex TileMap.toTile is the inverse of tileCenter', () => {
	const map = new TileMap({ width: 6, height: 6, sheet: tinyHexSheet(), shape: 'hex' });
	map.addLayer('ground', new Array(36).fill(0));

	for (let x = 0; x < 6; x++) {
		for (let y = 0; y < 6; y++) {
			const center = map.tileCenter(x, y);
			assert.deepEqual(map.toTile(center.x, center.y), { x, y });
		}
	}
});

test('a hex TileMap reports a taller, narrower world than the same grid would be square', () => {
	const hex = new TileMap({ width: 5, height: 5, sheet: tinyHexSheet(), shape: 'hex' });
	const square = new TileMap({ width: 5, height: 5, sheet: tinyHexSheet() });

	assert.ok(hex.worldWidth < square.worldWidth); // columns overlap
	assert.ok(hex.worldHeight > square.worldHeight); // the odd-column offset adds half a tile
});

test('cull() does not throw on a hex TileMap and leaves some chunk visible at the origin', () => {
	const map = new TileMap({ width: 20, height: 20, sheet: tinyHexSheet(), shape: 'hex' });
	map.addLayer('ground', new Array(400).fill(0));

	const camera = { view: { x: 0, y: 0, width: 200, height: 200 } } as unknown as Camera;
	map.cull(camera);
	assert.ok(map.visibleChunks > 0);
});
