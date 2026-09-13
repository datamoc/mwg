import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime } from '../src/mwl/runtime.ts';

/**
 * The WML action vocabulary (item 250): unit bookkeeping (`store_unit`/`unstore_unit`/`recall`/
 * `modify_unit`/`heal_unit`), the map and scenario layer (`set_terrain`/`capture_village`/
 * `clear_shroud`/`role`/`object`/`story`) and `fire_event`. Each is data the game reads; the
 * framework sequences it and keeps it in the save.
 */

const source = (body: string) => `[{ tag: 'game', children: [
	{ tag: 'side', id: 1, controller: 'human' },
	{ tag: 'side', id: 2, controller: 'ai' },
	{ tag: 'unit', id: 'hero', hp: 10, x: 1, y: 1, side: 1, type: 'Swordsman' },
	{ tag: 'unit', id: 'grunt', hp: 6, x: 3, y: 3, side: 2, type: 'Grunt' },
	{ tag: 'map', id: 'm', file: 'm.map' },
	${body}
] }]`;

const MAP = ['Gg,Gg,Gg,Gg', 'Gg,Gg,Gg,Gg'].join('\n');

const runtimeFor = (body: string) => new MwlRuntime(compile(source(body)), { resolveMap: () => MAP });

const event = (inner: string, on = 'go') => `{ tag: 'event', on: '${on}', children: [${inner}] },`;

test('fire_event runs another event by id', () => {
	const runtime = runtimeFor(
		event(`{ tag: 'fire_event', id: 'ping' },`) +
			`{ tag: 'event', id: 'ping', on: 'ping', children: [{ tag: 'gold', side: 1, delta: 5 }] },`,
	);

	runtime.run('go');

	assert.equal(runtime.world.gold['1'], 5);
});

test('store_unit captures matching units and unstore_unit puts them back', () => {
	const runtime = runtimeFor(
		event(
			`{ tag: 'store_unit', variable: 'party', children: [{ tag: 'filter', side: 1 }] }, { tag: 'kill', side: 1 }, { tag: 'unstore_unit', variable: 'party' },`,
		),
	);

	runtime.run('go');

	assert.equal(runtime.world.units.hero.alive, true, 'the killed hero came back from the store');
	assert.deepEqual(runtime.world.variables.party, [
		{ id: 'hero', hp: 10, x: 1, y: 1, alive: true, type: 'Swordsman', side: '1' },
	]);
});

test('recall places a stored unit at a chosen hex and side', () => {
	const runtime = runtimeFor(
		event(
			`{ tag: 'store_unit', variable: 'party' }, { tag: 'recall', variable: 'party', id: 'grunt', x: 0, y: 0, side: 1 },`,
		),
	);

	runtime.run('go');

	assert.deepEqual(runtime.world.units.grunt, {
		hp: 6,
		x: 0,
		y: 0,
		alive: true,
		type: 'Grunt',
		side: '1',
	});
});

test('modify_unit changes only what [set] names, on the units [filter] selects', () => {
	const runtime = runtimeFor(
		event(
			`{ tag: 'modify_unit', children: [{ tag: 'filter', type: 'Swordsman' }, { tag: 'set', hp: 3, moves: 1, side: 2 }] },`,
		),
	);

	runtime.run('go');

	assert.equal(runtime.world.units.hero.hp, 3);
	assert.equal(runtime.world.units.hero.moves, 1);
	assert.equal(runtime.world.units.hero.side, '2');
	assert.equal(runtime.world.units.grunt.hp, 6, 'the filter left the other unit alone');
});

test('heal_unit adds its amount to the units it matches', () => {
	const runtime = runtimeFor(event(`{ tag: 'heal_unit', amount: 4, children: [{ tag: 'filter', unit: 'hero' }] },`));

	runtime.run('go');

	assert.equal(runtime.world.units.hero.hp, 14);
	assert.equal(runtime.world.units.grunt.hp, 6);
});

test('heal_unit without amount or hp is a named content error', () => {
	const runtime = runtimeFor(event(`{ tag: 'heal_unit' },`));
	assert.throws(() => runtime.run('go'), /\[heal_unit\] requires amount or hp/);
});

test('set_terrain changes one cell of the primary map', () => {
	const runtime = runtimeFor(event(`{ tag: 'set_terrain', terrain: 'Ww', x: 1, y: 0 },`));

	runtime.run('go');

	assert.equal(runtime.world.map?.codes[1], 'Ww');
	assert.equal(runtime.world.map?.codes[0], 'Gg', 'the rest of the row is untouched');
	assert.equal(runtime.world.map?.codes[5], 'Gg', 'and so is the next row');
});

test('capture_village records who holds a village, and a later capture changes it', () => {
	const runtime = runtimeFor(event(`{ tag: 'capture_village', side: 1, x: 2, y: 1, name: 'Mill' },`));
	runtime.run('go');
	assert.deepEqual(runtime.world.villages?.['2,1'], { x: 2, y: 1, side: '1', name: 'Mill' });

	const recaptured = runtimeFor(event(`{ tag: 'capture_village', side: 2, x: 2, y: 1 },`));
	recaptured.run('go');
	assert.equal(recaptured.world.villages?.['2,1'].side, '2');
});

test('clear_shroud records the hexes a side has uncovered', () => {
	const runtime = runtimeFor(event(`{ tag: 'clear_shroud', side: 1, x: 2, y: 2, radius: 1 },`));

	runtime.run('go');

	const cleared = runtime.world.clearedShroud?.['1'] ?? [];
	assert.equal(cleared.length, 9, 'a radius-1 square around 2,2');
	assert.ok(cleared.includes('1,1') && cleared.includes('2,2') && cleared.includes('3,3'));
});

test('a scenario-level role names the units it matches, and stamps the role on them', () => {
	const runtime = runtimeFor(`{ tag: 'role', role: 'courier', type: 'Swordsman' },`);

	assert.deepEqual(runtime.world.roles, { courier: ['hero'] });
	assert.equal(runtime.world.units.hero.role, 'courier', 'the matched unit learns the role it was given');
});

test('a role assigned from an event matches by the attributes it names, not the role being set', () => {
	//`role`/`name` on the tag assign the role; reading them back as a filter would require every
	//unit to already carry the role it is about to be given, and match nobody
	const runtime = runtimeFor(event(`{ tag: 'role', role: 'courier', type: 'Swordsman' },`));
	runtime.run('go');

	assert.deepEqual(runtime.world.roles, { courier: ['hero'] });
	assert.equal(runtime.world.units.hero.role, 'courier', 'the event-level role stamps the unit too');
});

test('a scenario-level object and story beat are kept as data', () => {
	const runtime = runtimeFor(
		[
			`{ tag: 'object', id: 'chest', name: 'Chest', image: 'items/chest.png', side: 1, x: 4, y: 1 },`,
			`{ tag: 'story', title: _("Prologue"), text: _("The war begins."), image: 'story/intro.png', music: 'main.ogg' },`,
		].join('\n'),
	);

	assert.deepEqual(runtime.world.objects, [
		{ x: 4, y: 1, id: 'chest', name: 'Chest', image: 'items/chest.png', side: '1' },
	]);
	assert.deepEqual(runtime.world.story, [
		{ text: 'The war begins.', title: 'Prologue', image: 'story/intro.png', music: 'main.ogg' },
	]);
});

test('unstore_unit on a variable that is not a stored unit list is a named error', () => {
	const runtime = runtimeFor(event(`{ tag: 'unstore_unit', variable: 'missing' },`));
	assert.throws(() => runtime.run('go'), /not a stored unit list/);
});

test('village ownership and scenario data survive a save and restore', () => {
	const compiled = compile(
		source(
			event(`{ tag: 'capture_village', side: 1, x: 2, y: 1 },`) +
				`{ tag: 'role', role: 'guard', type: 'Grunt' },`,
		),
	);
	const runtime = new MwlRuntime(compiled);
	runtime.run('go');

	const restored = new MwlRuntime(compiled);
	restored.restore(runtime.save());

	assert.deepEqual(restored.world.villages, { '2,1': { x: 2, y: 1, side: '1' } });
	assert.deepEqual(restored.world.roles, { guard: ['grunt'] });
});

/** one named leader (name/role/can_recruit) and one plain unit, for the attribute tests below */
const namedSource = (body: string) => `[{ tag: 'game', children: [
	{ tag: 'side', id: 1, controller: 'human' },
	{ tag: 'side', id: 2, controller: 'ai' },
	{ tag: 'unit', id: 'hero', hp: 10, x: 1, y: 1, side: 1, type: 'Swordsman', name: 'Kalenz', role: 'courier', can_recruit: true },
	{ tag: 'unit', id: 'grunt', hp: 6, x: 3, y: 3, side: 2, type: 'Grunt' },
	{ tag: 'map', id: 'm', file: 'm.map' },
	${body}
] }]`;

test('a unit carries its own name, role and leader flag, and a filter selects by all three', () => {
	const runtime = new MwlRuntime(
		compile(
			namedSource(
				event(
					`{ tag: 'store_unit', variable: 'leaders', children: [{ tag: 'filter', can_recruit: true, role: 'courier', name: 'Kalenz' }] }, { tag: 'store_unit', variable: 'others', children: [{ tag: 'filter', can_recruit: false }] },`,
				),
			),
		),
		{ resolveMap: () => MAP },
	);
	runtime.run('go');

	assert.equal(runtime.world.units.hero.name, 'Kalenz');
	assert.equal(runtime.world.units.hero.role, 'courier');
	assert.equal(runtime.world.units.hero.can_recruit, true);
	const ids = (variable: string) =>
		(runtime.world.variables[variable] as Array<{ id: string }>).map((unit) => unit.id);
	assert.deepEqual(ids('leaders'), ['hero'], 'only the unit matching every named attribute');
	assert.deepEqual(ids('others'), ['grunt'], 'can_recruit=no reads a missing flag as a non-leader');
});

test('store_unit and unstore_unit accept a dotted variable path', () => {
	const runtime = new MwlRuntime(
		compile(
			namedSource(
				event(
					`{ tag: 'store_unit', variable: 'party.units', children: [{ tag: 'filter', unit: 'hero' }] }, { tag: 'kill', unit: 'hero' }, { tag: 'unstore_unit', variable: 'party.units' },`,
				),
			),
		),
		{ resolveMap: () => MAP },
	);
	runtime.run('go');

	assert.equal(runtime.world.units.hero.alive, true, 'the dotted variable is read back where it was written');
	assert.deepEqual(Object.keys(runtime.world.variables.party as Record<string, unknown>), ['units']);
});

test('store_unit keeps a unit s name, role and leader flag, and unstore_unit puts them back', () => {
	const runtime = new MwlRuntime(
		compile(
			namedSource(
				event(
					`{ tag: 'store_unit', variable: 'party', children: [{ tag: 'filter', unit: 'hero' }] }, { tag: 'kill', unit: 'hero' }, { tag: 'unstore_unit', variable: 'party' },`,
				),
			),
		),
		{ resolveMap: () => MAP },
	);
	runtime.run('go');

	assert.deepEqual(runtime.world.units.hero, {
		hp: 10,
		x: 1,
		y: 1,
		alive: true,
		type: 'Swordsman',
		side: '1',
		name: 'Kalenz',
		role: 'courier',
		can_recruit: true,
	});
});
