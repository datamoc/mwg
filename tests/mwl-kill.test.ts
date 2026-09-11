import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, type MwlWorld } from '../src/mwl/runtime.ts';

/**
 * `[kill]` comes in two shapes and they fail differently on purpose: naming a unit that is not
 * there is a content error, while a *filter* that matches nobody is a no-op, which is what WML's
 * own `[kill]` does. The tests below are mostly about that difference, because the runtime used to
 * answer both with the same exception.
 */

const source = (command: string) => `[game]
[side]
id=1
controller=human
[/side]
[event]
id=purge
${command}
[/event]
[/game]`;

const runtimeWith = (command: string) => {
	const runtime = new MwlRuntime(compile(source(command)));
	//entries rather than the whole map: `world.units` itself is readonly, as the world shape should be
	const standing: MwlWorld['units'] = {
		hero: { hp: 10, x: 1, y: 1, alive: true, side: 1, type: 'Swordsman' },
		buddy: { hp: 8, x: 2, y: 1, alive: true, side: 1, type: 'Bowman' },
		rat: { hp: 3, x: 3, y: 3, alive: true, side: 2, type: 'Rat' },
		corpse: { hp: 0, x: 4, y: 4, alive: false, side: 2, type: 'Rat' },
	};
	for (const [id, unit] of Object.entries(standing)) runtime.world.units[id] = unit;
	return runtime;
};

const aliveIds = (runtime: MwlRuntime) =>
	Object.entries(runtime.world.units)
		.filter(([, unit]) => unit.alive)
		.map(([id]) => id)
		.sort();

test('a kill filter that matches nobody is a no-op, not an error', () => {
	const runtime = runtimeWith('[kill]\nside=9\n[/kill]');

	assert.equal(runtime.fireEvent('purge'), true, 'the event ran');
	assert.deepEqual(aliveIds(runtime), ['buddy', 'hero', 'rat'], 'everyone the filter did not name lives');
});

test('a kill filter takes exactly the units it matches, alive ones only', () => {
	const runtime = runtimeWith('[kill]\nside=2\n[/kill]');

	runtime.fireEvent('purge');

	assert.deepEqual(aliveIds(runtime), ['buddy', 'hero'], 'the rat died; the dead one was not resurrected');
});

test('naming a unit that is not there is still an error, because that is a content mistake', () => {
	const runtime = runtimeWith('[kill]\nunit=ghost\n[/kill]');

	assert.throws(() => runtime.fireEvent('purge'), /MWL unit is not alive: ghost/);
});

test('naming a unit that is there kills that one and nobody else', () => {
	const runtime = runtimeWith('[kill]\nunit=hero\n[/kill]');

	runtime.fireEvent('purge');

	assert.deepEqual(aliveIds(runtime), ['buddy', 'rat']);
});

test('an empty kill filter matches every unit, as it does in WML', () => {
	const runtime = runtimeWith('[kill]\n[/kill]');

	runtime.fireEvent('purge');

	assert.deepEqual(aliveIds(runtime), [], 'the dead stay dead and everyone else joins them');
});

test('a kill filter reads the same attributes an event filter does', () => {
	const runtime = runtimeWith('[kill]\nx=2\ny=1\n[/kill]');

	runtime.fireEvent('purge');

	assert.deepEqual(aliveIds(runtime), ['hero', 'rat'], 'only the unit standing on 2,1 fell');
});
