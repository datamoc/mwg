import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneData, uncloneablePath } from '../src/core/Clone.ts';
import { ActionJournal } from '../src/core/ActionJournal.ts';
import { CanonicalState } from '../src/core/State.ts';
import { Campaign } from '../src/simulation/Campaign.ts';
import { ReactionTable } from '../src/core/Reactions.ts';
import { Generator } from '../src/core/Random.ts';
import { Scheduler } from '../src/roguelike/Scheduler.ts';
import { SimulationRuntime, type SimulationRuntimeRule } from '../src/simulation/Runtime.ts';

class Creature {
	speed = 1;
	reactions: ReactionTable<{ hp: number }> | null = null;
	readonly id: string;
	hp: number;
	constructor(id: string, hp: number) {
		this.id = id;
		this.hp = hp;
	}
	isAlive(): boolean {
		return this.hp > 0;
	}
}

test('uncloneablePath points at the first field structuredClone refuses, not its owner', () => {
	const king = new Creature('king', 10);
	assert.equal(uncloneablePath({ target: king }, 'command'), null, 'a class instance with methods clones');
	king.reactions = new ReactionTable([{ id: 'enrage', when: (s) => s.hp < 5, action: () => {} }]);
	assert.match(uncloneablePath({ target: king }, 'command') ?? '', /^command\.target\.reactions\..*\.when$/);
	assert.equal(uncloneablePath(new Map([['a', () => 1]]), 'm'), 'm.get("a")');
	assert.equal(uncloneablePath([1, Symbol('s')], 'list'), 'list[1]');
	assert.equal(uncloneablePath({ targetId: 'king' }), null);
});

test('cloneData copies plain data and names the path when it cannot', () => {
	const value = { a: [1, { b: 2 }] };
	const copy = cloneData(value, 'value');
	assert.deepEqual(copy, value);
	assert.notEqual(copy, value);
	assert.throws(
		() => cloneData({ onHit: () => {} }, 'command'),
		(error: Error) => {
			assert.ok(error instanceof TypeError);
			assert.match(error.message, /^command\.onHit cannot be structured-cloned/);
			assert.match(error.message, /by its id/);
			return true;
		},
	);
});

test('ActionJournal.append copies the action and refuses one it cannot copy without consuming a sequence', () => {
	const journal = new ActionJournal<{ targetId: string } | { run: () => void }, never>();
	const action = { targetId: 'rat' };
	journal.append(action);
	action.targetId = 'king';
	assert.deepEqual(journal.all[0]?.action, { targetId: 'rat' }, "the log does not alias the caller's object");
	assert.throws(() => journal.append({ run: () => {} }), /action\.run cannot be structured-cloned/);
	assert.equal(journal.size, 1);
	assert.equal(journal.mark(), 1);
});

test('SimulationRuntime.dispatch commits nothing when its command cannot be journalled', () => {
	type State = { hp: Record<string, number> };
	type Command = { type: 'attack'; attacker: Creature; target: Creature } | { type: 'attack-id'; targetId: string };
	const hero = new Creature('hero', 10);
	const king = new Creature('king', 20);
	king.reactions = new ReactionTable([{ id: 'enrage', when: (s) => s.hp < 5, action: () => {} }]);
	const scheduler = new Scheduler<Creature>();
	scheduler.add(hero);
	scheduler.add(king);
	const rule: SimulationRuntimeRule<State, Command, { targetId: string; amount: number }, Creature> = (
		state,
		command,
		{ random },
	) => {
		const targetId = command.type === 'attack' ? command.target.id : command.targetId;
		const amount = random.int(3) + 1;
		return {
			state: { hp: { ...state.hp, [targetId]: state.hp[targetId] - amount } },
			events: [{ targetId, amount }],
			status: 'ready',
			cost: 1,
		};
	};
	const actors = new Map([hero, king].map((creature) => [creature.id, creature]));
	const runtime = new SimulationRuntime<State, Command, { targetId: string; amount: number }, Creature>({
		state: { hp: { hero: 10, king: 20 } },
		scheduler,
		random: new Generator(7),
		rule,
		actorId: (creature) => creature.id,
		history: { actorOf: (id) => actors.get(id)! },
	});
	const random = runtime.random.getState();
	const time = scheduler.timeOf(hero);

	assert.throws(
		() => runtime.dispatch({ type: 'attack', attacker: hero, target: king }),
		/action\.target\.reactions\..*\.when cannot be structured-cloned/,
	);
	assert.deepEqual(runtime.state, { hp: { hero: 10, king: 20 } });
	assert.deepEqual(runtime.random.getState(), random);
	assert.equal(scheduler.timeOf(hero), time);
	assert.equal(runtime.journal.size, 0);
	assert.equal(runtime.canUndo, false);

	runtime.dispatch({ type: 'attack-id', targetId: 'king' });
	assert.equal(runtime.journal.size, 1);
	assert.ok(runtime.state.hp.king < 20);
	assert.ok(runtime.canUndo);
});

test('CanonicalState and Campaign refuse non-data with a path, and Campaign stays unchanged', () => {
	assert.throws(
		() => new CanonicalState({ hero: { onDeath: () => {} } } as never),
		/initial state\.hero\.onDeath cannot be structured-cloned/,
	);
	const campaign = new Campaign<{ gold: number }, { boss: string }>({
		levels: [{ id: 'keep', run: (state) => ({ state, outcome: 'completed', next: null }) }],
		start: 'keep',
		state: { gold: 1 },
	});
	assert.throws(
		() =>
			campaign.completeCurrent({
				state: { gold: 5 },
				result: { boss: 'king', reactions: () => {} } as never,
				outcome: 'completed',
				next: null,
			}),
		/level result\.reactions cannot be structured-cloned/,
	);
	assert.deepEqual(campaign.state, { gold: 1 });
	assert.equal(campaign.currentLevel, 'keep');
});
