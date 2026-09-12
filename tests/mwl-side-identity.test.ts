import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../src/mwl/compiler.ts';
import { endLevelCarryover } from '../src/mwl/carryover.ts';
import { MwlRuntime } from '../src/mwl/runtime.ts';

/**
 * One side identity (item 277): the `id` a `[side]` declares keys `world.sides` and `world.gold`
 * and is what `unit.side` holds. Nothing has to be a number, so a named side survives a map
 * `<side> <code>` marker, a `[kill]` filter, a side condition and an `[endlevel]` carry-over.
 */

const NAMED = `[game]
[unit_type]
id=Spearman
hitpoints=20
movement=5
[/unit_type]
[side]
id=rebels
controller=human
leader=Spearman
gold=100
[defeat]
condition=units_dead
[/defeat]
[/side]
[map]
id=field
terrain=rebels Kh,Gg
[/map]
[event]
id=finish
on=finish
[endlevel]
result=victory
side=rebels
bonus=10
[/endlevel]
[/event]
[event]
id=purge
on=purge
[kill]
side=rebels
[/kill]
[/event]
[/game]`;

test('a named side marks its keep, and its leader carries the same id', () => {
	const runtime = new MwlRuntime(compile(NAMED));

	assert.deepEqual(runtime.world.map?.starts, { rebels: [{ x: 0, y: 0 }] });
	const leader = Object.values(runtime.world.units)[0];
	assert.equal(leader.side, 'rebels', 'not a number derived from the id');
	assert.equal(leader.type, 'Spearman');
	assert.equal(leader.leader, true, 'the unit the side named, without recomputing sides.leader === id');

	assert.deepEqual(Object.keys(runtime.world.sides), ['rebels']);
	assert.equal(runtime.world.gold['rebels'], undefined, 'gold is keyed by the id, declared in the side');
	assert.equal(runtime.world.sides['rebels'].gold, 100);
});

test('a leader=yes filter selects the side leader through the unit flag', () => {
	const runtime = new MwlRuntime(
		compile(
			NAMED.replace(
				'[/game]',
				`[event]
id=mark
on=mark
[store_unit]
variable=only
[filter]
leader=yes
[/filter]
[/store_unit]
[/event]
[/game]`,
			),
		),
	);
	runtime.fireEvent('mark');

	assert.deepEqual(
		(runtime.world.variables.only as Array<{ id: string }>).map((unit) => unit.id),
		[Object.keys(runtime.world.units)[0]],
	);
});

test('a kill filter matches a named side', () => {
	const runtime = new MwlRuntime(compile(NAMED));
	runtime.fireEvent('purge');

	assert.equal(
		Object.values(runtime.world.units).every((unit) => !unit.alive),
		true,
	);
});

test('a side condition with no side_filter reads as the named side itself', () => {
	const runtime = new MwlRuntime(compile(NAMED));
	runtime.fireEvent('purge');

	assert.equal(runtime.evaluate(), 'lost', 'the rebels have no units left');
	assert.deepEqual(runtime.world.sideStatus, { rebels: 'lost' });
});

test('[endlevel] side=rebels carries that named side, without guessing a number', () => {
	const runtime = new MwlRuntime(compile(NAMED));
	runtime.world.gold['rebels'] = 200;

	runtime.fireEvent('finish');

	assert.equal(runtime.world.status, 'won');
	assert.deepEqual(runtime.world.carryover, {
		result: 'victory',
		gold: 170,
		add: false,
		recall: [Object.keys(runtime.world.units)[0]],
		nextScenario: null,
	});
});

test('carry-over over a named side recalls the units whose side is that id', () => {
	const runtime = new MwlRuntime(compile(NAMED));
	runtime.world.gold['rebels'] = 200;

	const carried = endLevelCarryover(runtime.world, { id: 'rebels' }, { result: 'victory', bonus: 10 });

	assert.equal(carried.gold, 170);
	assert.deepEqual(carried.recall, [Object.keys(runtime.world.units)[0]]);
});
