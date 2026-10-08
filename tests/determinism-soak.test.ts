import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimulationRuntime, type SimulationRuntimeRule } from '../src/simulation/index.ts';
import { Scheduler, type Actor } from '../src/roguelike/Scheduler.ts';
import { Generator } from '../src/core/Random.ts';
import { stateChecksum } from '../src/core/SyncGuard.ts';

/**
 * The long-run half of the determinism the per-operation tests in simulation.test.ts pin over a
 * handful of dispatches: snapshot/restore, replay validation and presentation independence
 * are each proven there, but on traces too short to catch slow contamination - a rule reaching
 * for the wrong RNG, a restore that forgets scheduler state, a cost that is charged to the wrong
 * actor often enough to reorder the queue. This file drives one seeded trace for thousands of
 * commands and compares canonical state checksums at checkpoints along the way, so divergence
 * survives long enough to reach a checkpoint and names the first differing index instead of
 * only failing the final state.
 *
 * The step count is bounded for CI and configurable for the nightly soak the runtime
 * specification's determinism gate calls for:
 * `MWG_SOAK_STEPS=100000 node --test tests/determinism-soak.test.ts`.
 */

const STEPS = Math.max(100, Number(process.env.MWG_SOAK_STEPS ?? 5000));
const CHECKPOINT_EVERY = Math.max(10, Math.floor(STEPS / 50));

interface Fighter extends Actor {
	id: string;
}

interface BandState {
	hp: Record<string, number>;
	tally: number;
}

type Command = { type: 'attack' } | { type: 'rest' };
type Event = { kind: 'damage' | 'healed' | 'revived'; actorId: string; amount: number };

const IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const SPEEDS = [1, 1.5, 0.75, 2, 1.25, 0.5] as const;

/** Whoever's turn it is attacks a random bandmate or rests; damage, victim choice, healing and
 * revival all draw from the runtime RNG, and a fallen fighter revives so the run is unbounded.
 * A rest is free (the same actor keeps the turn), an attack costs 1, which exercises both the
 * charged and the uncharged dispatch path at length. */
const rule: SimulationRuntimeRule<BandState, Command, Event, Fighter> = (state, command, { random, scheduler }) => {
	const actor = scheduler.peek();
	if (!actor) throw new Error('the soak scheduler must always have a current actor');
	if (command.type === 'rest') {
		const amount = random.int(3) + 1;
		return {
			state: {
				hp: { ...state.hp, [actor.id]: state.hp[actor.id] + amount },
				tally: state.tally + amount,
			},
			events: [{ kind: 'healed', actorId: actor.id, amount }],
			status: 'ready',
		};
	}
	const targets = IDS.filter((id) => id !== actor.id);
	const targetId = targets[random.int(targets.length)];
	const damage = random.int(5) + 1;
	const hp = { ...state.hp, [targetId]: state.hp[targetId] - damage };
	const events: Event[] = [{ kind: 'damage', actorId: targetId, amount: damage }];
	if (hp[targetId] < 1) {
		const revived = random.int(40) + 10;
		hp[targetId] = revived;
		events.push({ kind: 'revived', actorId: targetId, amount: revived });
	}
	return { state: { hp, tally: state.tally + damage }, events, status: 'ready', cost: 1 };
};

/** The command trace is data, generated from its own seeded RNG so the two runs below dispatch
 * byte-identical command sequences while the runtime's RNG keeps its draws for the rules. */
function script(steps: number): Command[] {
	const random = new Generator(777);
	const commands: Command[] = [];
	for (let i = 0; i < steps; i++) commands.push(random.int(4) === 0 ? { type: 'rest' } : { type: 'attack' });
	return commands;
}

function makeRuntime(seed: number): SimulationRuntime<BandState, Command, Event, Fighter> {
	const scheduler = new Scheduler<Fighter>();
	IDS.forEach((id, index) => scheduler.add({ id }, SPEEDS[index]));
	return new SimulationRuntime<BandState, Command, Event, Fighter>({
		state: { hp: Object.fromEntries(IDS.map((id) => [id, 50])), tally: 0 },
		scheduler,
		random: new Generator(seed),
		rule,
		actorId: (fighter) => fighter.id,
		journal: null,
	});
}

interface TraceResult {
	checkpoints: number[];
	eventCount: number;
}

/** Runs `commands` and checksums the snapshot every CHECKPOINT_EVERY steps. The checksum covers
 * the logical state alone - state, scheduler and the RNG stream - not the journal, which is
 * replay metadata a caller may or may not record (the runtime is built with `journal: null`
 * here, while a restored runtime always journals), so two agreeing checkpoint arrays mean the
 * two runs were the same simulation, not just similar ones. */
function runTrace(runtime: SimulationRuntime<BandState, Command, Event, Fighter>, commands: Command[]): TraceResult {
	const checkpoints: number[] = [];
	let eventCount = 0;
	commands.forEach((command, index) => {
		eventCount += runtime.dispatch(command).events.length;
		if ((index + 1) % CHECKPOINT_EVERY === 0) checkpoints.push(logicalChecksum(runtime));
	});
	return { checkpoints, eventCount };
}

function logicalChecksum(runtime: SimulationRuntime<BandState, Command, Event, Fighter>): number {
	const { version, state, scheduler, random } = runtime.snapshot();
	return stateChecksum({ version, state, scheduler, random });
}

test('a long seeded trace replays to identical checkpoint checksums in a fresh runtime', () => {
	const commands = script(STEPS);
	const first = runTrace(makeRuntime(4242), commands);
	const second = runTrace(makeRuntime(4242), commands);

	assert.equal(first.checkpoints.length, Math.floor(STEPS / CHECKPOINT_EVERY));
	assert.deepEqual(first.checkpoints, second.checkpoints, 'same seed and commands must be the same simulation');
	assert.equal(first.eventCount, second.eventCount);
	assert.ok(first.eventCount > 0);
	// Pinned at the default step count so reproducibility holds across machines and processes, not
	// just between the two in-process runs above: any platform whose arithmetic, key ordering or
	// RNG stream differs fails here, which is what "reproducible across machines" means in README.
	// A deliberate change to the rule, scheduler or Generator above must re-pin this constant.
	if (STEPS === 5000) assert.equal(first.checkpoints.at(-1), 675958354);
});

test('restoring from a mid-trace snapshot continues the trace identically', () => {
	const commands = script(STEPS);
	const split = CHECKPOINT_EVERY * Math.floor(STEPS / (CHECKPOINT_EVERY * 3));
	const runtime = makeRuntime(4242);
	const head = runTrace(runtime, commands.slice(0, split));
	const snapshot = runtime.snapshot();

	const restored = SimulationRuntime.restore<BandState, Command, Event, Fighter>(snapshot, {
		rule,
		actorOf: (id) => ({ id }),
		actorId: (fighter) => fighter.id,
	});

	const originalTail = runTrace(runtime, commands.slice(split));
	const restoredTail = runTrace(restored, commands.slice(split));

	assert.deepEqual(restoredTail.checkpoints, originalTail.checkpoints, 'a restore must resume, not approximate');
	assert.equal(restoredTail.eventCount, originalTail.eventCount);
	assert.ok(head.checkpoints.length > 0, 'the head must have reached at least one checkpoint before the split');
	assert.equal(logicalChecksum(runtime), logicalChecksum(restored));
});

test('a mutated command trace diverges at the first checkpoint that follows it', () => {
	const commands = script(STEPS);
	const mutatedIndex = CHECKPOINT_EVERY * 2;
	const mutated = commands.map((command, index) =>
		index === mutatedIndex ? { type: command.type === 'rest' ? ('attack' as const) : ('rest' as const) } : command,
	);

	const honest = runTrace(makeRuntime(4242), commands);
	const mutatedRun = runTrace(makeRuntime(4242), mutated);

	const firstDifference = honest.checkpoints.findIndex((sum, index) => sum !== mutatedRun.checkpoints[index]);
	assert.ok(firstDifference >= 0, 'the runs must diverge');
	assert.equal(
		firstDifference,
		Math.floor(mutatedIndex / CHECKPOINT_EVERY),
		'the divergence is reported at the checkpoint following the mutated command, not earlier or later',
	);
});
