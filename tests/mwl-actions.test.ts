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

const source = (body: string) => `[game]
[side]
id=1
controller=human
[/side]
[side]
id=2
controller=ai
[/side]
[unit]
id=hero
hp=10
x=1
y=1
side=1
type=Swordsman
[/unit]
[unit]
id=grunt
hp=6
x=3
y=3
side=2
type=Grunt
[/unit]
[map]
id=m
file=m.map
[/map]
${body}
[/game]`;

const MAP = ['Gg,Gg,Gg,Gg', 'Gg,Gg,Gg,Gg'].join('\n');

const runtimeFor = (body: string) => new MwlRuntime(compile(source(body)), { resolveMap: () => MAP });

const event = (inner: string, on = 'go') => `[event]\non=${on}\n${inner}\n[/event]`;

test('fire_event runs another event by id', () => {
	const runtime = runtimeFor(
		event('[fire_event]\nid=ping\n[/fire_event]') +
			'\n[event]\nid=ping\non=ping\n[gold]\nside=1\ndelta=5\n[/gold]\n[/event]',
	);

	runtime.run('go');

	assert.equal(runtime.world.gold['1'], 5);
});

test('store_unit captures matching units and unstore_unit puts them back', () => {
	const runtime = runtimeFor(
		event(
			'[store_unit]\nvariable=party\n[filter]\nside=1\n[/filter]\n[/store_unit]\n[kill]\nside=1\n[/kill]\n[unstore_unit]\nvariable=party\n[/unstore_unit]',
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
			'[store_unit]\nvariable=party\n[/store_unit]\n[recall]\nvariable=party\nid=grunt\nx=0\ny=0\nside=1\n[/recall]',
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
			'[modify_unit]\n[filter]\ntype=Swordsman\n[/filter]\n[set]\nhp=3\nmoves=1\nside=2\n[/set]\n[/modify_unit]',
		),
	);

	runtime.run('go');

	assert.equal(runtime.world.units.hero.hp, 3);
	assert.equal(runtime.world.units.hero.moves, 1);
	assert.equal(runtime.world.units.hero.side, '2');
	assert.equal(runtime.world.units.grunt.hp, 6, 'the filter left the other unit alone');
});

test('heal_unit adds its amount to the units it matches', () => {
	const runtime = runtimeFor(event('[heal_unit]\namount=4\n[filter]\nunit=hero\n[/filter]\n[/heal_unit]'));

	runtime.run('go');

	assert.equal(runtime.world.units.hero.hp, 14);
	assert.equal(runtime.world.units.grunt.hp, 6);
});

test('heal_unit without amount or hp is a named content error', () => {
	const runtime = runtimeFor(event('[heal_unit]\n[/heal_unit]'));
	assert.throws(() => runtime.run('go'), /\[heal_unit\] requires amount or hp/);
});

test('set_terrain changes one cell of the primary map', () => {
	const runtime = runtimeFor(event('[set_terrain]\nterrain=Ww\nx=1\ny=0\n[/set_terrain]'));

	runtime.run('go');

	assert.equal(runtime.world.map?.codes[1], 'Ww');
	assert.equal(runtime.world.map?.codes[0], 'Gg', 'the rest of the row is untouched');
	assert.equal(runtime.world.map?.codes[5], 'Gg', 'and so is the next row');
});

test('capture_village records who holds a village, and a later capture changes it', () => {
	const runtime = runtimeFor(event('[capture_village]\nside=1\nx=2\ny=1\nname=Mill\n[/capture_village]'));
	runtime.run('go');
	assert.deepEqual(runtime.world.villages?.['2,1'], { x: 2, y: 1, side: '1', name: 'Mill' });

	const recaptured = runtimeFor(event('[capture_village]\nside=2\nx=2\ny=1\n[/capture_village]'));
	recaptured.run('go');
	assert.equal(recaptured.world.villages?.['2,1'].side, '2');
});

test('clear_shroud records the hexes a side has uncovered', () => {
	const runtime = runtimeFor(event('[clear_shroud]\nside=1\nx=2\ny=2\nradius=1\n[/clear_shroud]'));

	runtime.run('go');

	const cleared = runtime.world.clearedShroud?.['1'] ?? [];
	assert.equal(cleared.length, 9, 'a radius-1 square around 2,2');
	assert.ok(cleared.includes('1,1') && cleared.includes('2,2') && cleared.includes('3,3'));
});

test('a scenario-level role names the units it matches, and stamps the role on them', () => {
	const runtime = runtimeFor('[role]\nrole=courier\ntype=Swordsman\n[/role]');

	assert.deepEqual(runtime.world.roles, { courier: ['hero'] });
	assert.equal(runtime.world.units.hero.role, 'courier', 'the matched unit learns the role it was given');
});

test('a role assigned from an event matches by the attributes it names, not the role being set', () => {
	//`role`/`name` on the tag assign the role; reading them back as a filter would require every
	//unit to already carry the role it is about to be given, and match nobody
	const runtime = runtimeFor(event('[role]\nrole=courier\ntype=Swordsman\n[/role]'));
	runtime.run('go');

	assert.deepEqual(runtime.world.roles, { courier: ['hero'] });
	assert.equal(runtime.world.units.hero.role, 'courier', 'the event-level role stamps the unit too');
});

test('a scenario-level object and story beat are kept as data', () => {
	const runtime = runtimeFor(
		[
			'[object]\nid=chest\nname=Chest\nimage=items/chest.png\nside=1\nx=4\ny=1\n[/object]',
			'[story]\ntitle=_ "Prologue"\ntext=_ "The war begins."\nimage=story/intro.png\nmusic=main.ogg\n[/story]',
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
	const runtime = runtimeFor(event('[unstore_unit]\nvariable=missing\n[/unstore_unit]'));
	assert.throws(() => runtime.run('go'), /not a stored unit list/);
});

test('village ownership and scenario data survive a save and restore', () => {
	const compiled = compile(
		source(
			event('[capture_village]\nside=1\nx=2\ny=1\n[/capture_village]') +
				'\n[role]\nrole=guard\ntype=Grunt\n[/role]',
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
const namedSource = (body: string) => `[game]
[side]
id=1
controller=human
[/side]
[side]
id=2
controller=ai
[/side]
[unit]
id=hero
hp=10
x=1
y=1
side=1
type=Swordsman
name=Kalenz
role=courier
can_recruit=yes
[/unit]
[unit]
id=grunt
hp=6
x=3
y=3
side=2
type=Grunt
[/unit]
[map]
id=m
file=m.map
[/map]
${body}
[/game]`;

test('a unit carries its own name, role and leader flag, and a filter selects by all three', () => {
	const runtime = new MwlRuntime(
		compile(
			namedSource(
				event(
					'[store_unit]\nvariable=leaders\n[filter]\ncan_recruit=yes\nrole=courier\nname=Kalenz\n[/filter]\n[/store_unit]\n[store_unit]\nvariable=others\n[filter]\ncan_recruit=no\n[/filter]\n[/store_unit]',
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

test('store_unit keeps a unit s name, role and leader flag, and unstore_unit puts them back', () => {
	const runtime = new MwlRuntime(
		compile(
			namedSource(
				event(
					'[store_unit]\nvariable=party\n[filter]\nunit=hero\n[/filter]\n[/store_unit]\n[kill]\nunit=hero\n[/kill]\n[unstore_unit]\nvariable=party\n[/unstore_unit]',
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
