import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	advanceToInput,
	runScenario,
	SimulationRuntime,
	type SimulationRule,
	type SimulationRuntimeRule,
	type SimulationSnapshot,
} from '../src/simulation/index.ts';
import { Scheduler, type Actor } from '../src/roguelike/Scheduler.ts';
import { Generator } from '../src/core/Random.ts';
import { SaveSystem } from '../src/core/Save.ts';
import { PresentationQueue } from '../src/core/Presentation.ts';

test('scheduled actions retain speeds and leave input actors unspent', () => {
	const queue = new Scheduler<{ speed?: number; player?: boolean }>();
	const player = { player: true },
		automatic = { speed: 2 };
	queue.add(automatic);
	queue.add(player, 0.75);
	const result = advanceToInput(
		{ scheduler: queue, finished: () => false, needsInput: (a) => !!a.player, act: () => 1 },
		10,
	);
	assert.deepEqual(result, { status: 'input', actor: player, steps: 2 });
	assert.equal(queue.timeOf(player), 0.75);
});

test('finished, empty, and exhausted budget have distinct outcomes', () => {
	const rules = {
		scheduler: { peek: () => null, spend: () => assert.fail('spend') },
		finished: () => false,
		needsInput: () => false,
		act: () => 1,
	};
	assert.deepEqual(advanceToInput(rules, 10), { status: 'empty', steps: 0 });
	assert.deepEqual(advanceToInput({ ...rules, finished: () => true }, 10), { status: 'finished', steps: 0 });
	assert.deepEqual(advanceToInput(rules, 0), { status: 'limit', steps: 0 });
});

test('a bounded zero-cost loop can be resumed without inventing an input turn', () => {
	let actions = 0;
	const rules = {
		scheduler: { peek: () => 'npc', spend: (cost: number) => assert.equal(cost, 0) },
		finished: () => false,
		needsInput: () => false,
		act: () => {
			actions++;
			return 0;
		},
	};
	assert.equal(advanceToInput(rules, 3).status, 'limit');
	advanceToInput(rules, 2);
	assert.equal(actions, 5);
});

test('act can remove itself without charging a different actor', () => {
	const queue = new Scheduler<{ player?: boolean; speed?: number }>();
	const npc = {},
		player = { player: true };
	queue.add(npc);
	queue.add(player);
	const result = advanceToInput(
		{
			scheduler: queue,
			finished: () => false,
			needsInput: (a) => !!a.player,
			act: (a) => {
				queue.remove(a);
				return null;
			},
		},
		5,
	);
	assert.deepEqual(result, { status: 'input', actor: player, steps: 1 });
	assert.equal(queue.timeOf(player), 0);
});

test('cost applies to the post-action current entry when explicitly returned', () => {
	let finished = false;
	const calls: unknown[] = [];
	const result = advanceToInput(
		{
			scheduler: { peek: () => 0, spend: (c) => calls.push(c) },
			finished: () => finished,
			needsInput: () => false,
			act: () => {
				calls.push('act');
				finished = true;
				return 0.5;
			},
		},
		10,
	);
	assert.deepEqual(calls, ['act', 0.5]);
	assert.deepEqual(result, { status: 'finished', steps: 1 });
});

test('invalid budgets and costs fail explicitly; action failures propagate', () => {
	const rules = {
		scheduler: { peek: () => 'npc', spend: () => assert.fail('spend') },
		finished: () => false,
		needsInput: () => false,
		act: () => -1,
	};
	for (const budget of [-1, 0.5, Infinity, NaN]) assert.throws(() => advanceToInput(rules, budget), RangeError);
	for (const cost of [-1, Infinity, NaN])
		assert.throws(() => advanceToInput({ ...rules, act: () => cost }, 1), RangeError);
	assert.throws(
		() =>
			advanceToInput(
				{
					...rules,
					act: () => {
						throw new Error('rule failed');
					},
				},
				1,
			),
		/rule failed/,
	);
});

type Counter = { value: number };
const count: SimulationRule<Counter, number, number, Generator> = (state, command, random) => {
	const value = state.value + command + random.int(3);
	return { state: { value }, events: [value], status: value >= 10 ? 'finished' : 'ready' };
};

test('headless scenarios use the supplied random state and stop at terminal output', () => {
	const run = () =>
		runScenario({ state: { value: 0 }, commands: [1, 2, 100, 200], random: new Generator(7), step: count });
	const result = run();
	assert.deepEqual(result, run());
	assert.equal(result.status, 'finished');
	assert.equal(result.processedCommands, 3);
	assert.equal(result.events.length, 3);
});

test('splitting a scenario preserves ordered events and generator state', () => {
	const random = new Generator(5);
	const first = runScenario({ state: { value: 0 }, commands: [1], random, step: count });
	const saved = JSON.parse(JSON.stringify({ state: first.state, random: random.getState() }));
	const resumed = new Generator(0);
	resumed.setState(saved.random);
	const second = runScenario({ state: saved.state as Counter, commands: [2], random: resumed, step: count });
	const completeRandom = new Generator(5);
	const complete = runScenario({ state: { value: 0 }, commands: [1, 2], random: completeRandom, step: count });
	assert.deepEqual(second.state, complete.state);
	assert.deepEqual([...first.events, ...second.events], complete.events);
	assert.deepEqual(resumed.getState(), completeRandom.getState());
});

test('empty and already finished scenarios do not call the rules', () => {
	const state = { value: 7 };
	const step: typeof count = () => assert.fail('called');
	for (const [commands, status] of [
		[[], 'ready'],
		[[1], 'finished'],
	] as const) {
		const result = runScenario({ state, commands, status, random: new Generator(0), step });
		assert.equal(result.state, state);
		assert.deepEqual(result.events, []);
		assert.equal(result.processedCommands, 0);
	}
});

test('rule errors propagate without claiming a partial scenario succeeded', () => {
	assert.throws(
		() =>
			runScenario({
				state: 0,
				commands: [1],
				random: null,
				step: () => {
					throw new Error('bad command');
				},
			}),
		/bad command/,
	);
});

// ------------------------------------------------------------- SimulationRuntime

interface Fighter extends Actor {
	id: string;
	hp: number;
}
type FightState = { hero: Fighter; rat: Fighter };

const fightRule: SimulationRuntimeRule<FightState, 'attack', number, Fighter> = (state, _command, { random }) => {
	const amount = random.int(3) + 1;
	const rat = { ...state.rat, hp: state.rat.hp - amount };
	return { state: { ...state, rat }, events: [amount], status: rat.hp <= 0 ? 'finished' : 'ready', cost: 1 };
};

function makeFight() {
	const hero: Fighter = { id: 'hero', hp: 10 };
	const rat: Fighter = { id: 'rat', hp: 5 };
	const scheduler = new Scheduler<Fighter>();
	scheduler.add(hero);
	scheduler.add(rat);
	return { hero, rat, scheduler };
}

test('dispatch threads random/scheduler context and charges the returned cost', () => {
	const { hero, rat, scheduler } = makeFight();
	const runtime = new SimulationRuntime<FightState, 'attack', number, Fighter>({
		state: { hero, rat },
		scheduler,
		random: new Generator(1),
		rule: fightRule,
		actorId: (fighter) => fighter.id,
	});

	const before = scheduler.timeOf(hero);
	const outcome = runtime.dispatch('attack');

	assert.equal(outcome.events.length, 1);
	assert.equal(runtime.state.rat.hp, rat.hp - outcome.events[0]);
	//the scheduler's current entry (hero, since it was added first) was charged the cost
	assert.notEqual(scheduler.timeOf(hero), before);
});

test('snapshot/restore reproduces the same subsequent dispatch outcomes', () => {
	const first = makeFight();
	const runtime = new SimulationRuntime<FightState, 'attack', number, Fighter>({
		state: { hero: first.hero, rat: first.rat },
		scheduler: first.scheduler,
		random: new Generator(99),
		rule: fightRule,
		actorId: (fighter) => fighter.id,
	});
	runtime.dispatch('attack');
	const snapshot = runtime.snapshot();

	const byId = new Map([
		[first.hero.id, { ...runtime.state.hero }],
		[first.rat.id, { ...runtime.state.rat }],
	]);
	const restored = SimulationRuntime.restore<FightState, 'attack', number, Fighter>(snapshot, {
		rule: fightRule,
		actorOf: (id) => byId.get(id)!,
		actorId: (fighter) => fighter.id,
	});

	const continuedOriginal = runtime.dispatch('attack');
	const continuedRestored = restored.dispatch('attack');

	assert.deepEqual(continuedRestored.events, continuedOriginal.events);
	assert.deepEqual(restored.state, runtime.state);
});

test('a SimulationSnapshot round-trips through SaveSystem storage, not just in memory', () => {
	const { hero, rat, scheduler } = makeFight();
	const runtime = new SimulationRuntime<FightState, 'attack', number, Fighter>({
		state: { hero, rat },
		scheduler,
		random: new Generator(2024),
		rule: fightRule,
		actorId: (fighter) => fighter.id,
	});
	runtime.dispatch('attack');

	//SaveSystem owns storage/version/migration; the snapshot is just the JSON-safe payload it stores
	const saves = new SaveSystem<SimulationSnapshot<FightState>>({ namespace: 'fight', version: 1 });
	saves.save('slot0', runtime.snapshot());

	const loaded = saves.load('slot0');
	assert.ok(loaded);

	const byId = new Map([
		[hero.id, { ...loaded.state.state.hero }],
		[rat.id, { ...loaded.state.state.rat }],
	]);
	const restored = SimulationRuntime.restore<FightState, 'attack', number, Fighter>(loaded.state, {
		rule: fightRule,
		actorOf: (id) => byId.get(id)!,
		actorId: (fighter) => fighter.id,
	});

	assert.deepEqual(restored.dispatch('attack'), runtime.dispatch('attack'));
});

test('headless equivalence: the same rule gives the same events through dispatch and through runScenario', () => {
	//a rule shaped to fit both runners: SimulationRuntimeRule's (state, command, context) and
	//SimulationRule's (state, command, random) differ only in whether random comes bare or
	//wrapped in a context, so one function body can serve both
	const rawRule = (state: FightState, _command: 'attack', random: Generator) => {
		const amount = random.int(3) + 1;
		const rat = { ...state.rat, hp: state.rat.hp - amount };
		return {
			state: { ...state, rat },
			events: [amount],
			status: rat.hp <= 0 ? ('finished' as const) : ('ready' as const),
		};
	};

	const scenarioResult = runScenario({
		state: { hero: { id: 'hero', hp: 10 }, rat: { id: 'rat', hp: 5 } } as FightState,
		commands: ['attack', 'attack'] as const,
		random: new Generator(42),
		step: rawRule,
	});

	const { scheduler } = makeFight();
	const runtimeRule: SimulationRuntimeRule<FightState, 'attack', number, Fighter> = (state, command, { random }) =>
		rawRule(state, command, random);
	const runtime = new SimulationRuntime<FightState, 'attack', number, Fighter>({
		state: { hero: { id: 'hero', hp: 10 }, rat: { id: 'rat', hp: 5 } },
		scheduler,
		random: new Generator(42),
		rule: runtimeRule,
		actorId: (fighter) => fighter.id,
	});
	const first = runtime.dispatch('attack');
	const second = runtime.dispatch('attack');

	assert.deepEqual([...first.events, ...second.events], scenarioResult.events);
	assert.deepEqual(runtime.state, scenarioResult.state);
});

test('presentation independence: changing how long an event takes to play changes nothing logical', () => {
	//two identical runs of the same commands against the same seed, differing only in how
	//long a PresentationQueue is told to spend on each event - the commit already happened
	//synchronously inside dispatch(), so nothing about pacing the presentation afterwards
	//may feed back into it
	function run(durationForEvent: (amount: number) => number) {
		const { scheduler } = makeFight();
		const runtime = new SimulationRuntime<FightState, 'attack', number, Fighter>({
			state: { hero: { id: 'hero', hp: 10 }, rat: { id: 'rat', hp: 5 } },
			scheduler,
			random: new Generator(7),
			rule: fightRule,
			actorId: (fighter) => fighter.id,
		});

		const presented: number[] = [];
		const presentation = new PresentationQueue<number>({
			play: (amount) => {
				presented.push(amount);
				return durationForEvent(amount);
			},
		});

		const outcomes = [];
		for (let i = 0; i < 3 && runtime.state.rat.hp > 0; i++) {
			const outcome = runtime.dispatch('attack');
			outcomes.push(outcome);
			presentation.enqueue(outcome.events);
			presentation.update(1000); //drain regardless of duration, since only the logic is under test
		}

		return { finalState: runtime.state, outcomes, presented };
	}

	const instant = run(() => 0);
	const slow = run((amount) => amount * 2);
	const stillSlower = run(() => 5);

	assert.deepEqual(instant.finalState, slow.finalState);
	assert.deepEqual(instant.finalState, stillSlower.finalState);
	assert.deepEqual(instant.outcomes, slow.outcomes);
	assert.deepEqual(instant.outcomes, stillSlower.outcomes);
	//and every run still presented the same events, just paced differently
	assert.deepEqual(instant.presented, slow.presented);
	assert.deepEqual(instant.presented, stillSlower.presented);
});
