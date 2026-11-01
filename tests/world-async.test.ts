import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/world/World.ts';

interface Map {
	name: string;
	spawn?: string;
}

test('an async factory is awaited by enterAsync with the spawn it asked for', async () => {
	const world = new World<Map>();
	world.define('town', async (spawn) => ({ name: 'town', spawn }));

	const map = await world.enterAsync('town', 'square');
	assert.equal(map.name, 'town');
	assert.equal(map.spawn, 'square');
	assert.equal(world.current, map);
	assert.equal(world.currentMapId, 'town');
	assert.equal(world.spawn, 'square');
});

test('the current map stays current while the next one builds', async () => {
	const world = new World<Map>();
	world.define('town', () => ({ name: 'town' }));
	let release!: () => void;
	world.define(
		'dungeon',
		() =>
			new Promise<Map>((resolve) => {
				release = () => resolve({ name: 'dungeon' });
			}),
	);

	world.enter('town');
	const loading = world.enterAsync('dungeon');
	assert.equal(world.currentMapId, 'town');
	release();
	await loading;
	assert.equal(world.currentMapId, 'dungeon');
});

test('a persistent map is built once across concurrent and later enters', async () => {
	const world = new World<Map>();
	let builds = 0;
	world.define('town', async () => {
		builds++;
		await Promise.resolve();
		return { name: 'town' };
	});

	const [first, second] = await Promise.all([world.enterAsync('town'), world.enterAsync('town')]);
	assert.equal(builds, 1, 'two concurrent entries share one creation');
	assert.equal(first, second);
	assert.equal(await world.enterAsync('town'), first, 'a later entry reuses the loaded map');
});

test('a non-persistent map rebuilds on every async entry', async () => {
	const world = new World<Map>();
	let builds = 0;
	world.define('floor', async () => ({ name: `floor${++builds}` }), { persistent: false });

	const first = await world.enterAsync('floor');
	const second = await world.enterAsync('floor');
	assert.equal(builds, 2);
	assert.notEqual(first, second);
});

test('a late async creation does not take over a newer entry', async () => {
	const world = new World<Map>();
	let releaseSlow!: () => void;
	world.define(
		'slow',
		() =>
			new Promise<Map>((resolve) => {
				releaseSlow = () => resolve({ name: 'slow' });
			}),
	);
	world.define('fast', () => ({ name: 'fast' }));

	const slow = world.enterAsync('slow');
	await world.enterAsync('fast');
	assert.equal(world.currentMapId, 'fast');
	releaseSlow();
	const slowMap = await slow;
	assert.equal(slowMap.name, 'slow');
	assert.equal(world.currentMapId, 'fast', 'the newer request keeps the current map');
});

test('sync enter refuses an async factory with a loud message', () => {
	const world = new World<Map>();
	world.define('town', async () => ({ name: 'town' }));
	assert.throws(() => world.enter('town'), /built asynchronously - use enterAsync/);
});

test('enterAsync still rejects an unknown id', async () => {
	const world = new World<Map>();
	await assert.rejects(world.enterAsync('nowhere'), /no such map: "nowhere"/);
});
