import assert from 'node:assert/strict';
import test from 'node:test';
import { FieldOfView } from '../src/roguelike/FieldOfView.ts';
import { FLOOR, Level, WALL } from '../src/roguelike/Level.ts';
import { Scheduler } from '../src/roguelike/Scheduler.ts';
import { ballistica } from '../src/roguelike/Targeting.ts';
import { StateRegistry } from '../src/core/State.ts';
import { ActionJournal } from '../src/core/ActionJournal.ts';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, type MwlTraceEvent } from '../src/mwl/runtime.ts';

const MWL_TRACE_GAME = `[game]
schema=0.1
[side]
id=1
controller=human
gold=0
[/side]
[map]
id=arena
terrain=Gg,Gg
[/map]
`;

test('TerrainKind carries game-defined flags and extras through kindAt', () => {
	const kind = { passable: true, transparent: true, flags: 32, extras: { flammable: true, liquid: false } };
	const level = new Level(2, 1, [kind], 0);
	assert.equal(level.kindAt(1, 0).flags, 32);
	assert.deepEqual(level.kindAt(1, 0).extras, { flammable: true, liquid: false });
});

test('FieldOfView uses Level.viewDistance when radius is omitted and saves it', () => {
	const level = new Level(9, 1, [WALL, FLOOR], 1, 'square', 2);
	const fov = new FieldOfView(level);
	fov.update(4, 0);
	assert.equal(fov.isVisible(2, 0), true);
	assert.equal(fov.isVisible(1, 0), false);
	assert.equal(level.toJSON().viewDistance, 2);
	const restored = Level.fromJSON([WALL, FLOOR], level.toJSON());
	assert.equal(restored.viewDistance, 2);
});

test('Scheduler resolves higher priority actors first at the same time', () => {
	const scheduler = new Scheduler<{ name: string; priority?: number }>();
	const ordinary = { name: 'ordinary' };
	const effect = { name: 'telegraph', priority: 10 };
	scheduler.add(ordinary);
	scheduler.add(effect);
	assert.equal(scheduler.peek(), effect);
	const snapshot = scheduler.toJSON((actor) => actor.name);
	assert.equal(snapshot.entries.find((entry) => entry.id === 'telegraph')?.priority, 10);
});

test('ballistica returns the first opaque collision, including the collision cell', () => {
	const level = new Level(6, 1, [WALL, FLOOR], 1);
	level.set(3, 0, 0);
	assert.deepEqual(ballistica(level, { x: 0, y: 0 }, { x: 5, y: 0 }), {
		cells: [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 3, y: 0 },
		],
		stop: { x: 3, y: 0 },
	});
	assert.equal(ballistica(level, { x: 0, y: 0 }, { x: 5, y: 0 }, { stop: 'none' }).stop, null);
});

test('ballistica follows hex lines and supports impassable stopping', () => {
	const level = new Level(5, 5, [WALL, FLOOR], 1, 'hex');
	level.set(2, 2, 0);
	const result = ballistica(level, { x: 0, y: 0 }, { x: 4, y: 4 }, { stop: 'impassable' });
	assert.equal(result.stop?.x, 2);
	assert.equal(result.stop?.y, 2);
	assert.deepEqual(result.cells.at(-1), result.stop);
});

test('StateRegistry snapshots extensions and rolls back failed transactions', () => {
	let inventory = { gold: 10 };
	let quests = { opened: false };
	const state = new StateRegistry();
	state.register({ id: 'inventory', capture: () => inventory, restore: (saved) => (inventory = saved) });
	state.register({ id: 'quests', capture: () => quests, restore: (saved) => (quests = saved) });
	assert.throws(() =>
		state.transaction(() => {
			inventory.gold = 0;
			quests.opened = true;
			throw new Error('reject');
		}),
	);
	assert.deepEqual(inventory, { gold: 10 });
	assert.deepEqual(quests, { opened: false });
	const snapshot = state.snapshot();
	inventory.gold = 4;
	state.restore(snapshot);
	assert.equal(inventory.gold, 10);
});

test('StateRegistry migrates extensions independently and reports removed extensions', () => {
	let profile: { score: number } = { score: 3 };
	const state = new StateRegistry();
	state.register({
		id: 'profile',
		version: 2,
		migrations: { 2: (saved) => ({ score: Number((saved as { points: number }).points) }) },
		capture: () => profile,
		restore: (saved) => (profile = saved),
	});
	const diagnostics = state.restore({ extensions: { profile: { points: 8 } }, versions: { profile: 1 } });
	assert.deepEqual(profile, { score: 8 });
	assert.equal(diagnostics[0]?.status, 'migrated');
	let newData = { value: 1 };
	const missing = new StateRegistry();
	missing.register({
		id: 'new-data',
		capture: () => newData,
		restore: (saved) => (newData = saved),
		reset: () => (newData = { value: 0 }),
	});
	assert.equal(missing.restore({ extensions: {} }, { missing: 'reset' })[0]?.status, 'reset');
	assert.deepEqual(newData, { value: 0 });
	let removed = false;
	missing.register({ id: 'old-data', capture: () => null, restore: () => undefined, remove: () => (removed = true) });
	assert.equal(missing.restore({ extensions: {} }, { missing: 'remove' }).at(-1)?.status, 'removed');
	assert.equal(removed, true);
});

test('ActionJournal preserves ordered action batches and supports checkpoints', () => {
	const journal = new ActionJournal<string, { type: string }>();
	journal.append('move', [{ type: 'moved' }]);
	const checkpoint = journal.mark();
	journal.append('attack', [{ type: 'hit' }]);
	assert.deepEqual(
		journal.since(checkpoint).map((entry) => entry.action),
		['attack'],
	);
	const restored = ActionJournal.fromJSON(journal.toJSON());
	assert.deepEqual(restored.all, journal.all);
	restored.truncate(checkpoint);
	assert.deepEqual(
		restored.all.map((entry) => entry.action),
		['move'],
	);
});

test('MWL runtime traces event lifecycle and variable writes', () => {
	const traces: MwlTraceEvent[] = [];
	const game = compile(
		`${MWL_TRACE_GAME}[event]
id=trace_event
on=start
[set_variable]
name=counter
value=1
[/set_variable]
[/event]
[/game]
`,
		{ file: 'trace.mwl' },
	);
	const runtime = new MwlRuntime(game, { onTrace: (event) => traces.push(event) });
	runtime.run('start');
	assert.deepEqual(
		traces.map((event) => (event.type === 'event' ? `${event.phase}:${event.id}` : event.type)),
		['claimed:trace_event', 'variable', 'completed:trace_event'],
	);
});

test('MWL predicate registry evaluates game-defined filter conditions', () => {
	const messages: string[] = [];
	const game = compile(
		`${MWL_TRACE_GAME}[event]
id=predicate_event
on=start
[filter_condition]
[predicate]
name=can_fire
stance=ready
[/predicate]
[/filter_condition]
[message]
text=_ "predicate fired"
[/message]
[/event]
[/game]
`,
		{ file: 'predicate.mwl' },
	);
	const runtime = new MwlRuntime(game, {
		hooks: { predicate: { can_fire: (_world, context) => context.stance === 'ready' } },
		onMessage: (message) => messages.push(message.text),
	});
	runtime.run('start');
	assert.deepEqual(messages, ['predicate fired']);
});
