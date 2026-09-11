import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Campaign } from '../src/simulation/Campaign.ts';
import { CampaignSave } from '../src/simulation/CampaignSave.ts';
import { SimulationRuntime } from '../src/simulation/Runtime.ts';
import type { SimulationSnapshot } from '../src/simulation/Runtime.ts';
import { Scheduler } from '../src/roguelike/Scheduler.ts';
import { Generator } from '../src/core/Random.ts';
import type { SaveStorage } from '../src/core/Save.ts';

type CampaignState = { gold: number };
type World = { terrain: string; turn: number };
type SimState = { hp: number };
type Command = 'tick';
type Event = { kind: string };
interface Fighter {
	id: string;
	speed?: number;
}

function memoryStorage(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

function campaign(): Campaign<CampaignState, number> {
	return new Campaign<CampaignState, number>({
		levels: [
			{ id: 'intro', run: (state) => ({ outcome: 'completed' as const, state, next: 'battle' }) },
			{ id: 'battle', run: (state) => ({ outcome: 'completed' as const, state, next: null }) },
		],
		start: 'intro',
		state: { gold: 0 },
	});
}

/** what `SimulationRuntime.snapshot()` produces, without needing the whole scheduler in every test */
const simulation = (hp: number) => ({
	snapshot: (): SimulationSnapshot<SimState> => ({
		version: 1,
		state: { hp },
		scheduler: { now: 0, sequence: 0, entries: [] },
		random: [1, 2, 3, 4],
	}),
});

const save = (storage = memoryStorage()) =>
	new CampaignSave<CampaignState, number, World, SimState>({ namespace: 'campaign', version: 1, storage });

test('a campaign, a world and a simulation save and load together', () => {
	const saves = save();
	const run = campaign();
	run.completeCurrent({ outcome: 'completed', state: { gold: 10 }, next: 'battle' });

	saves.save(
		'slot1',
		{ campaign: run, world: { terrain: 'ff', turn: 3 }, simulation: simulation(7) },
		'Chapter 2, 10 gold',
	);

	const loaded = saves.load('slot1');
	assert.ok(loaded);
	assert.equal(loaded.campaign.currentLevel, 'battle');
	assert.deepEqual(loaded.campaign.state, { gold: 10 });
	assert.deepEqual(loaded.world, { terrain: 'ff', turn: 3 });
	assert.deepEqual(loaded.simulation?.state, { hp: 7 });
	assert.deepEqual(loaded.simulation?.random, [1, 2, 3, 4]);
});

test('a campaign with no turn-level simulation stores null rather than a missing field', () => {
	const saves = save();
	saves.save('slot1', { campaign: campaign(), world: { terrain: 'gg', turn: 1 } });

	const loaded = saves.load('slot1');
	assert.equal(loaded?.simulation, null);
});

test('list and delete are SaveSystem own, and a preview is kept', () => {
	const saves = save();
	saves.save('a', { campaign: campaign(), world: { terrain: 'a', turn: 1 } }, 'A');
	saves.save('b', { campaign: campaign(), world: { terrain: 'b', turn: 2 } }, 'B');

	const listed = saves.list().sort((left, right) => left.slot.localeCompare(right.slot));
	assert.deepEqual(
		listed.map((entry) => entry.slot),
		['a', 'b'],
	);
	assert.equal(listed[0].meta.preview, 'A');
	assert.equal(listed[0].meta.version, 1);

	saves.delete('a');
	assert.equal(saves.load('a'), null);
	assert.deepEqual(
		saves.list().map((entry) => entry.slot),
		['b'],
	);
});

test('two slots hold two independent campaigns', () => {
	const saves = save();
	const first = campaign();
	first.completeCurrent({ outcome: 'completed', state: { gold: 5 }, next: 'battle' });
	const second = campaign();

	saves.save('first', { campaign: first, world: { terrain: '1', turn: 1 } });
	saves.save('second', { campaign: second, world: { terrain: '2', turn: 2 } });

	assert.equal(saves.load('first')?.campaign.currentLevel, 'battle');
	assert.equal(saves.load('second')?.campaign.currentLevel, 'intro');
});

test('a version migration rewrites the whole campaign save, not one piece of it', () => {
	const storage = memoryStorage();
	save(storage).save('slot1', { campaign: campaign(), world: { terrain: 'old', turn: 1 } });

	const migrated = new CampaignSave<CampaignState, number, World & { name?: string }, SimState>({
		namespace: 'campaign',
		version: 2,
		storage,
		migrations: {
			1: (state) => {
				const value = state as { world: World };
				return { ...value, world: { ...value.world, name: 'renamed' } };
			},
		},
	});

	const loaded = migrated.load('slot1');
	assert.equal(loaded?.world.name, 'renamed');
	assert.equal(loaded?.world.terrain, 'old');
});

test('the loaded campaign half restores a real Campaign', () => {
	const saves = save();
	const run = campaign();
	run.completeCurrent({ outcome: 'completed', state: { gold: 42 }, next: 'battle' });
	saves.save('slot1', { campaign: run, world: { terrain: 'x', turn: 1 } });

	const loaded = saves.load('slot1');
	assert.ok(loaded);
	const restored = Campaign.restore<CampaignState, number>(loaded.campaign, {
		levels: [
			{ id: 'intro', run: (state) => ({ outcome: 'completed' as const, state, next: 'battle' }) },
			{ id: 'battle', run: (state) => ({ outcome: 'completed' as const, state, next: null }) },
		],
	});
	assert.equal(restored.currentLevel, 'battle');
	assert.deepEqual(restored.state, { gold: 42 });

	const finished = restored.playCurrent();
	assert.equal(finished.outcome, 'completed');
	assert.equal(restored.currentLevel, null);
});

test('the loaded simulation half restores a real SimulationRuntime', () => {
	const saves = save();
	const scheduler = new Scheduler<Fighter>();
	scheduler.add({ id: 'hero' });
	const rule = (state: SimState, _command: Command): { state: SimState; events: Event[]; status: 'ready' } => ({
		state: { hp: state.hp - 1 },
		events: [{ kind: 'hit' }],
		status: 'ready',
	});
	const runtime = new SimulationRuntime<SimState, Command, Event, Fighter>({
		state: { hp: 9 },
		scheduler,
		random: new Generator(3),
		rule,
		actorId: (fighter) => fighter.id,
	});
	runtime.dispatch('tick');
	saves.save('slot1', { campaign: campaign(), world: { terrain: 'z', turn: 1 }, simulation: runtime });

	const loaded = saves.load('slot1');
	assert.ok(loaded?.simulation);
	const restored = SimulationRuntime.restore<SimState, Command, Event, Fighter>(loaded.simulation, {
		rule,
		actorOf: () => ({ id: 'hero' }),
		actorId: (fighter) => fighter.id,
	});
	assert.equal(restored.state.hp, 8, 'the turn the save captured');
	restored.dispatch('tick');
	assert.equal(restored.state.hp, 7, 'and the resumed runtime keeps going');
});
