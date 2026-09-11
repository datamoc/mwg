import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Generator } from '../src/core/Random.ts';
import { Scheduler } from '../src/roguelike/Scheduler.ts';
import { SimulationRuntime } from '../src/simulation/Runtime.ts';
import type { SimulationOutcome, SimulationRuntimeRule } from '../src/simulation/Runtime.ts';
import { EventPresentation } from '../src/simulation/EventPresentation.ts';

interface Fighter {
	id: string;
	speed?: number;
}

type State = { hp: number; log: string[] };
type Command = { kind: 'attack' | 'counter'; amount: number };
type Event = { text: string; seconds: number };

const rule: SimulationRuntimeRule<State, Command, Event, Fighter> = (state, command) => ({
	state: { hp: Math.max(0, state.hp - command.amount), log: [...state.log, `${command.kind}:${command.amount}`] },
	events: [{ text: `${command.kind}:${command.amount}`, seconds: 0.5 }],
	status: 'ready',
	cost: 1,
});

/** a runtime with a scheduler and one fighter, the shape the pattern is written for */
function runtime(state: State = { hp: 20, log: [] }): SimulationRuntime<State, Command, Event, Fighter> {
	const scheduler = new Scheduler<Fighter>();
	scheduler.add({ id: 'hero' });
	return new SimulationRuntime<State, Command, Event, Fighter>({
		state,
		scheduler,
		random: new Generator(1),
		rule,
		actorId: (fighter) => fighter.id,
	});
}

function setup(
	options: {
		followUp?: (outcome: SimulationOutcome<State, Event>) => readonly Command[];
		seconds?: number;
	} = {},
) {
	const played: string[] = [];
	const sim = runtime();
	const presentation = new EventPresentation<State, Command, Event, Fighter>({
		runtime: sim,
		play: (event) => {
			played.push(event.text);
			return options.seconds ?? event.seconds;
		},
		followUp: options.followUp,
	});
	return { sim, presentation, played };
}

test('submit commits the command and starts presenting its events', () => {
	const { sim, presentation, played } = setup();
	const outcome = presentation.submit({ kind: 'attack', amount: 3 });

	assert.deepEqual(outcome?.events, [{ text: 'attack:3', seconds: 0.5 }]);
	assert.deepEqual(sim.state.log, ['attack:3'], 'the state committed immediately');
	assert.equal(sim.state.hp, 17);
	assert.deepEqual(played, ['attack:3'], 'the animation started');
	assert.equal(presentation.locked, true);
});

test('a command submitted while the animation lock is on is refused, not committed', () => {
	const { sim, presentation } = setup();
	presentation.submit({ kind: 'attack', amount: 3 });

	const refused = presentation.submit({ kind: 'attack', amount: 3 });
	assert.equal(refused, null);
	assert.deepEqual(sim.state.log, ['attack:3'], 'no second attack was committed');
	assert.equal(sim.state.hp, 17);
});

test('update drains the animation and releases the lock', () => {
	const { presentation } = setup();
	presentation.submit({ kind: 'attack', amount: 3 });

	presentation.update(0.25);
	assert.equal(presentation.locked, true, 'still mid-animation');
	presentation.update(0.3);
	assert.equal(presentation.locked, false);
	assert.equal(presentation.submit({ kind: 'attack', amount: 2 }) !== null, true, 'a new command is accepted');
});

test('a scheduled secondary actor runs only after the batch before it has finished', () => {
	const { sim, presentation, played } = setup({
		followUp: (outcome) =>
			outcome.events.some((event) => event.text.startsWith('attack')) ? [{ kind: 'counter', amount: 1 }] : [],
	});

	presentation.submit({ kind: 'attack', amount: 3 });
	assert.deepEqual(sim.state.log, ['attack:3'], 'the counter has not run yet');
	assert.deepEqual(played, ['attack:3']);

	presentation.update(0.25);
	assert.deepEqual(sim.state.log, ['attack:3'], 'still not, mid-attack');
	assert.deepEqual(played, ['attack:3']);

	presentation.update(0.3); // the attack finishes; the scheduled counter starts
	assert.deepEqual(sim.state.log, ['attack:3', 'counter:1']);
	assert.deepEqual(played, ['attack:3', 'counter:1'], 'the counter plays after the attack');
	assert.equal(presentation.locked, true);
});

test('zero-duration events and their follow-ups chain within the submit call', () => {
	const { sim, presentation, played } = setup({
		seconds: 0,
		followUp: (outcome) =>
			outcome.events.some((event) => event.text.startsWith('attack')) ? [{ kind: 'counter', amount: 1 }] : [],
	});

	presentation.submit({ kind: 'attack', amount: 3 });
	assert.deepEqual(sim.state.log, ['attack:3', 'counter:1'], 'no frame was needed to chain them');
	assert.deepEqual(played, ['attack:3', 'counter:1']);
	assert.equal(presentation.locked, false);
});

test('cancel abandons the presentation but leaves the committed turn standing', () => {
	const { sim, presentation, played } = setup({
		followUp: () => [{ kind: 'counter', amount: 1 }],
	});
	presentation.submit({ kind: 'attack', amount: 3 });

	presentation.cancel();
	assert.equal(presentation.locked, false);
	presentation.update(10);
	assert.deepEqual(sim.state.log, ['attack:3'], 'the scheduled counter never ran');
	assert.deepEqual(played, ['attack:3'], 'nothing further was presented');

	//and the machine is usable again
	presentation.submit({ kind: 'counter', amount: 2 });
	assert.deepEqual(sim.state.log, ['attack:3', 'counter:2']);
});

test('a save mid-animation restores idle, so the leftovers are not replayed', () => {
	const { presentation, played } = setup({
		followUp: () => [{ kind: 'counter', amount: 1 }],
	});
	presentation.submit({ kind: 'attack', amount: 3 });
	const saved = presentation.snapshot(3);

	const restored = EventPresentation.restore<State, Command, Event, Fighter>(saved, {
		play: (event) => {
			played.push(event.text);
			return event.seconds;
		},
		rule,
		actorOf: () => ({ id: 'hero' }),
		actorId: (fighter) => fighter.id,
	});

	assert.equal(restored.locked, false, 'nothing was in flight on load');
	assert.deepEqual(restored.runtime.state.log, ['attack:3'], 'the committed turn survived');
	assert.equal(restored.runtime.state.hp, 17);

	restored.update(1);
	assert.deepEqual(played, ['attack:3'], 'no interrupted animation was replayed');

	restored.submit({ kind: 'counter', amount: 2 });
	assert.deepEqual(restored.runtime.state.log, ['attack:3', 'counter:2']);
});

test('a follow-up chain terminates when the game returns no further commands', () => {
	const { sim, presentation } = setup({
		followUp: (outcome) => {
			const attacks = outcome.events.filter((event) => event.text.startsWith('attack')).length;
			return attacks > 0 ? [{ kind: 'counter', amount: 1 }] : [];
		},
	});
	presentation.submit({ kind: 'attack', amount: 3 });
	presentation.update(10); // the attack finishes and the scheduled counter starts
	assert.deepEqual(sim.state.log, ['attack:3', 'counter:1']);
	assert.equal(presentation.locked, true, 'the counter is still presenting');

	presentation.update(10); // the counter finishes, and schedules nothing further
	assert.equal(presentation.locked, false);
});
