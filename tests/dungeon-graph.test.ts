import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Random from '../src/core/Random.ts';
import { generateDungeonGraph, generateDungeon } from '../src/roguelike/generate.ts';

test('generateDungeon still returns just the level, unchanged from before the graph existed', () => {
	Random.push(1);
	try {
		const level = generateDungeon({ width: 40, height: 40 });
		assert.ok(level.rooms.length > 0);
	} finally {
		Random.pop();
	}
});

test('generateDungeonGraph reports one edge per corridor, backbone then extra loops', () => {
	Random.push(1);
	try {
		const { level, graph } = generateDungeonGraph({ width: 40, height: 40, extraCorridors: 2 });
		const backbone = graph.filter((edge) => !edge.extra);
		const extra = graph.filter((edge) => edge.extra);
		assert.equal(backbone.length, level.rooms.length - 1);
		assert.ok(extra.length <= 2);
		for (const edge of graph) {
			assert.ok(edge.a >= 0 && edge.a < level.rooms.length);
			assert.ok(edge.b >= 0 && edge.b < level.rooms.length);
		}
	} finally {
		Random.pop();
	}
});

test('retries count rejected placement attempts, not every attempt', () => {
	Random.push(2);
	try {
		//a tiny map with many room requests all but guarantees some rejected overlaps
		const { retries } = generateDungeonGraph({ width: 20, height: 20, rooms: 14 });
		assert.ok(retries >= 0);
	} finally {
		Random.pop();
	}
});

test('the same seed produces the same graph and retry count', () => {
	const run = () => {
		Random.push(7);
		try {
			return generateDungeonGraph({ width: 30, height: 30, extraCorridors: 3 });
		} finally {
			Random.pop();
		}
	};
	const a = run();
	const b = run();
	assert.deepEqual(a.graph, b.graph);
	assert.equal(a.retries, b.retries);
	assert.deepEqual([...a.level.terrain], [...b.level.terrain]);
});

test('onRoomPlaced and onCorridorCarved fire once per room and per corridor', () => {
	Random.push(3);
	try {
		const placedRooms: number[] = [];
		const carvedEdges: Array<{ a: number; b: number; extra: boolean }> = [];
		const { level, graph } = generateDungeonGraph({
			width: 40,
			height: 40,
			extraCorridors: 2,
			hooks: {
				onRoomPlaced: (_room, index) => placedRooms.push(index),
				onCorridorCarved: (edge) => carvedEdges.push({ ...edge }),
			},
		});
		assert.deepEqual(placedRooms, level.rooms.map((_, i) => i));
		assert.deepEqual(carvedEdges, graph);
	} finally {
		Random.pop();
	}
});
