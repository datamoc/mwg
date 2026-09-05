import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScenario, type SimulationRule } from '../src/simulation/index.ts';
import { resolveAttack } from '../examples/dungeon/combat.ts';
import { Generator } from '../src/core/Random.ts';

type State = { hp: number; defense: number };
type Event = { damage: number };
const step: SimulationRule<State, 'attack', Event, Generator> = (state, _command, random) => {
	const hit = resolveAttack({ damage: [3, 6] }, state, { range: (min, max) => min + random.int(max - min + 1) });
	return { state: { ...state, hp: hit.hp }, events: [{ damage: hit.damage }], status: hit.hp <= 0 ? 'finished' : 'ready' };
};

test('dungeon scene damage rule can run to completion without loading its renderer', () => {
	const run = () => runScenario({ state: { hp: 10, defense: 1 },
		commands: Array<'attack'>(10).fill('attack'), random: new Generator(42), step });
	const result = run();
	assert.deepEqual(run(), result);
	assert.equal(result.status, 'finished');
	assert.ok(result.processedCommands < 10);
	assert.equal(result.state.hp, 10 - result.events.reduce((sum, event) => sum + event.damage, 0));
});

test('the example retains its minimum one damage through high defense', () => {
	assert.deepEqual(resolveAttack({ damage: [3, 3] }, { hp: 10, defense: 99 }, { range: () => 3 }), { hp: 9, damage: 1 });
});
