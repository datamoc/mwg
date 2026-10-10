import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Generator } from '../src/core/Random.ts';
import * as Random from '../src/core/Random.ts';
import { hexDistance, hexNeighbors } from '../src/core/Hex.ts';
import { generateCave, type CaveOptions } from '../src/roguelike/Cave.ts';
import { generateDungeonGraph, furthestRoom } from '../src/roguelike/generate.ts';
import type { Level } from '../src/roguelike/Level.ts';
import { generateOverworld } from '../src/roguelike/Overworld.ts';

const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

const caveOptions = (seed: number, extra: Partial<CaveOptions> = {}): CaveOptions => ({
	width: 40,
	height: 25,
	seed,
	chambers: [
		{ id: 'entrance', xRange: [2, 8], yRange: [2, 8], size: 14, passages: [{ to: 'depths', windiness: 40 }] },
		{
			id: 'depths',
			xRange: [30, 37],
			yRange: [17, 22],
			size: 20,
			jagged: 60,
			passages: [{ to: 'mid', chance: 30 }],
		},
		{ id: 'mid', xRange: [15, 25], yRange: [8, 16], size: 10, passages: [] },
	],
	villageDensity: 40,
	mustBeClear: [{ x: 20, y: 12 }],
	...extra,
});

/** every passable cell reachable from the first one when only hex edges connect cells */
function hexConnected(level: Level): boolean {
	const cells = level.passableCells();
	if (cells.length === 0) return true;
	const seen = new Set<number>([cells[0]]);
	const queue = [cells[0]];
	while (queue.length) {
		const cell = queue.pop()!;
		for (const next of hexNeighbors(level.xOf(cell), level.yOf(cell))) {
			if (!level.inside(next.x, next.y)) continue;
			const index = level.index(next.x, next.y);
			if (seen.has(index) || !level.passable(next.x, next.y)) continue;
			seen.add(index);
			queue.push(index);
		}
	}
	return seen.size === cells.length;
}

const cells = (level: Level): number[] => Array.from(level.terrain);

test('a hex cave carries the hex shape and stays connected across hex edges, whatever the seed', () => {
	for (const seed of SEEDS) {
		const cave = generateCave(caveOptions(seed, { shape: 'hex' }));
		assert.equal(cave.level.shape, 'hex');
		assert.ok(hexConnected(cave.level), `seed ${seed}: a floor cell is cut off`);
		assert.equal(cave.chambers[0].cells.length, 14);
		assert.equal(cave.chambers[1].cells.length, 20);
		for (const chamber of cave.chambers)
			for (const cell of chamber.cells) assert.equal(cave.level.get(cell.x, cell.y), 1);
	}
});

test('a hex cave is deterministic and differs from the square cave of the same seed', () => {
	const hex = generateCave(caveOptions(5, { shape: 'hex' }));
	assert.deepEqual(cells(hex.level), cells(generateCave(caveOptions(5, { shape: 'hex' })).level));
	assert.notDeepEqual(cells(hex.level), cells(generateCave(caveOptions(5)).level));
});

test('a hex chamber grows round: its cells sit within a tight hex radius of its centre', () => {
	for (const seed of SEEDS) {
		const cave = generateCave(
			caveOptions(seed, {
				shape: 'hex',
				chambers: [{ id: 'only', xRange: [18, 22], yRange: [10, 14], size: 19, passages: [] }],
				mustBeClear: [],
			}),
		);
		const chamber = cave.chambers[0];
		//19 cells is a centre plus two full rings; the border keeps the chamber off the edge
		for (const cell of chamber.cells) assert.ok(hexDistance(cell, chamber.centre) <= 2, `seed ${seed}`);
	}
});

test('an explicit square shape is the default square cave', () => {
	assert.deepEqual(
		cells(generateCave(caveOptions(3, { shape: 'square' })).level),
		cells(generateCave(caveOptions(3)).level),
	);
});

test('an injected random source draws the cave a seed would, and is consumed', () => {
	for (const shape of ['square', 'hex'] as const) {
		const seeded = generateCave(caveOptions(11, { shape }));
		const source = new Generator(11);
		const injected = generateCave({ ...caveOptions(11, { shape }), seed: undefined, random: source });
		assert.deepEqual(cells(injected.level), cells(seeded.level));
		assert.deepEqual(injected.villages, seeded.villages);
		//the stream moved on: it is no longer where a fresh generator of that seed starts
		assert.notEqual(source.int(1_000_000), new Generator(11).int(1_000_000));
	}
});

test('an injected source leaves the ambient stream alone, and a seed is not needed with one', () => {
	Random.push(99);
	try {
		const before = Random.active().int(1_000_000);
		Random.pop();
		Random.push(99);
		generateCave({ ...caveOptions(1), seed: undefined, random: new Generator(4) });
		assert.equal(Random.active().int(1_000_000), before);
	} finally {
		Random.pop();
	}
});

test('a cave with neither a seed nor a source is refused by name', () => {
	assert.throws(() => generateCave({ ...caveOptions(1), seed: undefined }), /seed or a random source/);
});

test('the injected source decides the cave: two sources of different seeds draw different caves', () => {
	const a = generateCave({ ...caveOptions(1), seed: undefined, random: new Generator(100) });
	const b = generateCave({ ...caveOptions(1), seed: undefined, random: new Generator(101) });
	assert.notDeepEqual(cells(a.level), cells(b.level));
});

test('a hex dungeon carries the hex shape and every floor cell is reachable across hex edges', () => {
	for (const seed of SEEDS) {
		Random.push(seed);
		try {
			const { level } = generateDungeonGraph({ width: 50, height: 34, rooms: 10, shape: 'hex' });
			assert.equal(level.shape, 'hex');
			assert.ok(level.rooms.length > 1);
			assert.ok(hexConnected(level), `seed ${seed}: a floor cell is cut off`);
		} finally {
			Random.pop();
		}
	}
});

test('a hex dungeon is deterministic per seed, and an explicit square shape is the default dungeon', () => {
	const make = (seed: number, shape?: 'square' | 'hex') => {
		Random.push(seed);
		try {
			return generateDungeonGraph({ width: 40, height: 28, rooms: 8, shape }).level;
		} finally {
			Random.pop();
		}
	};
	assert.deepEqual(cells(make(6, 'hex')), cells(make(6, 'hex')));
	assert.deepEqual(cells(make(6, 'square')), cells(make(6)));
	assert.notDeepEqual(cells(make(6, 'hex')), cells(make(6)));
});

test('furthestRoom measures in hex steps on a hex level', () => {
	Random.push(2);
	try {
		const { level } = generateDungeonGraph({ width: 50, height: 34, rooms: 10, shape: 'hex' });
		const from = { x: level.rooms[0].left, y: level.rooms[0].top };
		const far = furthestRoom(level, from)!;
		const reach = (room: (typeof level.rooms)[number]): number =>
			hexDistance(
				{ x: Math.floor((room.left + room.right) / 2), y: Math.floor((room.top + room.bottom) / 2) },
				from,
			);
		for (const room of level.rooms) assert.ok(reach(far) >= reach(room));
	} finally {
		Random.pop();
	}
});

test('a hex overworld steps across hex edges for every river and road cell', () => {
	for (const seed of [1, 2, 3, 4, 5]) {
		const realm = generateOverworld({ width: 64, height: 48, seed, shape: 'hex' });
		for (const path of [...realm.rivers, ...realm.roads])
			for (let index = 1; index < path.length; index++)
				assert.equal(hexDistance(path[index - 1], path[index]), 1, `seed ${seed}: a step skips a cell`);
	}
});

test('a hex overworld spaces settlements in hex steps, drains rivers downhill, and joins every settlement', () => {
	for (const seed of [1, 2, 3, 4, 5]) {
		const realm = generateOverworld({ width: 64, height: 48, seed, shape: 'hex' });
		assert.ok(realm.settlements.length >= 2, `seed ${seed}`);
		for (let a = 0; a < realm.settlements.length; a++)
			for (let b = a + 1; b < realm.settlements.length; b++)
				assert.ok(hexDistance(realm.settlements[a], realm.settlements[b]) >= 8, `seed ${seed}`);
		assert.equal(realm.roads.length, realm.settlements.length - 1, `seed ${seed}: a settlement has no road`);
		for (const river of realm.rivers)
			for (let index = 1; index < river.length - 1; index++) {
				const before = realm.elevation[river[index - 1].y * 64 + river[index - 1].x];
				const here = realm.elevation[river[index].y * 64 + river[index].x];
				assert.ok(here < before, `seed ${seed}: a river climbs`);
			}
	}
});

test('a hex overworld is deterministic, differs from the square one, and an explicit square shape changes nothing', () => {
	const options = { width: 64, height: 48, seed: 9 };
	const hex = generateOverworld({ ...options, shape: 'hex' });
	assert.deepEqual(hex, generateOverworld({ ...options, shape: 'hex' }));
	assert.notDeepEqual(hex.terrain, generateOverworld(options).terrain);
	assert.deepEqual(generateOverworld({ ...options, shape: 'square' }), generateOverworld(options));
});
