import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/world/World.ts';
import { Overworld } from '../src/world/Overworld.ts';
import { TurnClock } from '../src/world/TurnClock.ts';
import { rollEncounter, type EncounterTable } from '../src/world/Encounters.ts';
import * as Random from '../src/core/Random.ts';

test('entering an undefined map throws', () => {
	const world = new World<object>();
	assert.throws(() => world.enter('nowhere'));
});

test('a map persists between visits - state set on it survives leaving and returning', () => {
	const world = new World<{ hp: number }>();
	world.define('dungeon', () => ({ hp: 10 }));
	world.define('town', () => ({ hp: 0 }));

	const dungeon = world.enter('dungeon');
	dungeon.hp = 3; // the player fought something

	world.enter('town');
	assert.equal(world.current?.hp, 0);

	const dungeonAgain = world.enter('dungeon');
	assert.equal(dungeonAgain, dungeon, 'should be the same instance, not rebuilt');
	assert.equal(dungeonAgain.hp, 3);
});

test('a map defined persistent: false is rebuilt fresh on every entry', () => {
	let builds = 0;
	const world = new World<{ hp: number; build: number }>();
	world.define('floor', () => ({ hp: 10, build: ++builds }), { persistent: false });
	world.define('town', () => ({ hp: 0, build: 0 }));

	const first = world.enter('floor');
	first.hp = 3; // fought something on this floor

	world.enter('town');
	const second = world.enter('floor');

	assert.notEqual(second, first, 'should be rebuilt, not the same instance');
	assert.equal(second.hp, 10, 'should be fresh state, not carried over');
	assert.equal(second.build, 2);
});

test('isPersistent reports what a map was defined with, defaulting to true', () => {
	const world = new World<object>();
	world.define('town', () => ({}));
	world.define('floor', () => ({}), { persistent: false });

	assert.equal(world.isPersistent('town'), true);
	assert.equal(world.isPersistent('floor'), false);
});

test('current and currentMapId track the active map', () => {
	const world = new World<object>();
	world.define('a', () => ({}));
	world.define('b', () => ({}));

	world.enter('a');
	assert.equal(world.currentMapId, 'a');

	world.enter('b', 'north-gate');
	assert.equal(world.currentMapId, 'b');
	assert.equal(world.spawn, 'north-gate');
});

test('unloading the current map is refused', () => {
	const world = new World<object>();
	world.define('a', () => ({}));
	world.enter('a');
	assert.throws(() => world.unload('a'));
});

test('unloading a map makes the next entry rebuild it', () => {
	let builds = 0;
	const world = new World<{ id: number }>();
	world.define('a', () => ({ id: ++builds }));
	world.define('b', () => ({ id: 0 }));

	const a = world.enter('a');
	world.enter('b');
	world.unload('a');

	const aAgain = world.enter('a');
	assert.notEqual(aAgain, a);
	assert.equal(aAgain.id, 2);
});

test('an overworld location is found by its coordinates', () => {
	const overworld = new Overworld();
	overworld.add({ id: 'cave', x: 3, y: 4, leadsTo: 'cave-map' });

	assert.equal(overworld.at(3, 4)?.leadsTo, 'cave-map');
	assert.equal(overworld.at(0, 0), undefined);
});

test('a turn clock ticks every registered effect on advance', () => {
	const clock = new TurnClock();
	const seen: number[] = [];
	clock.add({ tick: (turn) => seen.push(turn) });

	clock.advance();
	clock.advance(2);

	assert.deepEqual(seen, [1, 3]);
});

test('a timed effect removes itself once its duration elapses', () => {
	const clock = new TurnClock();
	const id = clock.add({ tick: () => {}, duration: 2 });

	clock.advance();
	assert.ok(clock.has(id));

	clock.advance();
	assert.ok(!clock.has(id));
});

test('rollEncounter never fires below its rate, over enough trials', () => {
	Random.reset();
	const table: EncounterTable<string> = { rate: 0, entries: [{ value: 'rat', weight: 1 }] };
	for (let i = 0; i < 50; i++) assert.equal(rollEncounter(table), null);
});

test('rollEncounter draws from entries in proportion to weight', () => {
	Random.reset();
	const table: EncounterTable<string> = {
		rate: 1,
		entries: [
			{ value: 'common', weight: 9 },
			{ value: 'rare', weight: 1 },
		],
	};

	const counts = { common: 0, rare: 0 };
	for (let i = 0; i < 2000; i++) {
		const result = rollEncounter(table);
		if (result) counts[result as 'common' | 'rare']++;
	}

	assert.ok(counts.common > counts.rare * 3, 'the common entry should dominate the rare one');
});
