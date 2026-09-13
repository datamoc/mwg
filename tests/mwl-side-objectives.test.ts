import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime } from '../src/mwl/runtime.ts';

/**
 * A side may carry its own `[victory]`/`[defeat]` conditions, which is how a scenario says
 * "side 2 loses when its leader dies" or "side 1 wins by surviving". The scenario-wide
 * `[objectives]` conditions keep their old precedence, a side's own conditions record into
 * `world.sideStatus`, and the aggregate `world.status` ends the scenario the same way a
 * scenario-wide condition does.
 */

const game = (body: string) => `[{ tag: 'game', children: [${body}] }]`;

const runtimeFor = (body: string) => new MwlRuntime(compile(game(body)));

const hero = (side: number) => `{ tag: 'unit', id: 'hero', side: ${side}, hp: 10, x: 1, y: 1 },`;

test('a side with no conditions of its own keeps no sideStatus entry', () => {
	const runtime = runtimeFor(`{ tag: 'side', id: 1, controller: 'human' }, ${hero(1)}`);

	assert.equal(runtime.evaluate(), 'playing');
	assert.deepEqual(runtime.world.sideStatus, {});
});

test('a side own defeat fires when its own units are gone and ends the scenario lost', () => {
	const runtime = runtimeFor(`{ tag: 'side', id: 1, controller: 'human', children: [
			{ tag: 'defeat', condition: 'units_dead' },
		] },
		{ tag: 'side', id: 2 },
		${hero(1)}
		{ tag: 'unit', id: 'foe', side: 2, hp: 10, x: 5, y: 5 },
		{ tag: 'event', on: 'wait', children: [{ tag: 'kill', unit: 'hero' }] },`);

	assert.equal(runtime.evaluate(), 'playing', 'the hero is still standing');

	runtime.run('wait');

	assert.equal(runtime.world.status, 'lost');
	assert.deepEqual(runtime.world.sideStatus, { '1': 'lost' }, 'side 1 lost; side 2 wrote nothing');
});

test('a side can win with its own condition, and the scenario follows', () => {
	const runtime = runtimeFor(`{ tag: 'side', id: 1, controller: 'human', children: [
			{ tag: 'victory', condition: 'turns_elapsed', turns: 2 },
		] },
		${hero(1)}
		{ tag: 'event', on: 'wait', children: [{ tag: 'end_turn' }] },`);

	assert.equal(runtime.evaluate(), 'playing', 'the turn counter starts below the condition');

	runtime.run('wait'); // end_turn makes it turn 2, which is when turns=2 is met
	assert.equal(runtime.world.status, 'won');
	assert.deepEqual(runtime.world.sideStatus, { '1': 'won' });
});

test('a side condition under [side] is not read as a scenario-wide one', () => {
	// if the side's victory leaked into the scenario-wide set it would still end 'won', so the
	// distinguishing check is that a scenario-wide defeat wins the race when both are met
	const runtime = runtimeFor(`{ tag: 'objectives', children: [
			{ tag: 'defeat', condition: 'turns_elapsed', turns: 1 },
		] },
		{ tag: 'side', id: 1, controller: 'human', children: [
			{ tag: 'victory', condition: 'turns_elapsed', turns: 1 },
		] },
		${hero(1)}
		{ tag: 'event', on: 'wait', children: [{ tag: 'end_turn' }] },`);

	runtime.run('wait');
	assert.equal(runtime.world.status, 'lost', 'the scenario-wide defeat keeps its precedence');
	assert.deepEqual(runtime.world.sideStatus, {}, 'and the side condition was never evaluated');
});

test('win and lose commands record the side they name', () => {
	const win = runtimeFor(`{ tag: 'side', id: 1 },
		{ tag: 'side', id: 2 },
		{ tag: 'event', on: 'wait', children: [{ tag: 'win', side: 2 }] },`);
	win.run('wait');
	assert.equal(win.world.status, 'won');
	assert.deepEqual(win.world.sideStatus, { '2': 'won' });

	const lose = runtimeFor(`{ tag: 'side', id: 1 },
		{ tag: 'unit', id: 'hero', side: 1, hp: 5, x: 1, y: 1 },
		{ tag: 'event', on: 'wait', children: [{ tag: 'lose', side: 1 }] },`);
	lose.run('wait');
	assert.equal(lose.world.status, 'lost');
	assert.deepEqual(lose.world.sideStatus, { '1': 'lost' });
});

test('sideStatus survives a save and restore', () => {
	const runtime = runtimeFor(`{ tag: 'side', id: 1, controller: 'human', children: [
			{ tag: 'defeat', condition: 'units_dead' },
		] },
		${hero(1)}
		{ tag: 'event', on: 'wait', children: [{ tag: 'kill', unit: 'hero' }] },`);
	runtime.run('wait');
	const snapshot = runtime.snapshot();

	const restored = runtimeFor(`{ tag: 'side', id: 1 },`);
	restored.restore(snapshot);
	assert.equal(restored.world.status, 'lost');
	assert.deepEqual(restored.world.sideStatus, { '1': 'lost' });
});
