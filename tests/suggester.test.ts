import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Suggester } from '../src/ai/index.ts';
import type { AIDecision, AIDecisionInput } from '../src/ai/index.ts';

const decision = (action: string, steps = 1): AIDecision => ({
	agent: 'player',
	action: { type: action },
	state: {},
	status: 'action',
	steps,
	events: [],
});

test('the first update suggests immediately, however large the budget', () => {
	const seen: string[] = [];
	const hints = new Suggester(() => decision('strike'), { every: 30 });

	const fresh = hints.update({ perception: 0 });

	assert.equal(fresh?.action?.type, 'strike');
	seen.push(String(fresh?.action?.type));
	assert.deepEqual(seen, ['strike']);
});

test('throttled updates return null and keep the previous suggestion', () => {
	const calls: number[] = [];
	const hints = new Suggester(
		(input: AIDecisionInput) => {
			calls.push(input.perception as number);
			return decision(`a${input.perception}`);
		},
		{ every: 3 },
	);

	assert.equal(hints.update({ perception: 0 })?.action?.type, 'a0'); // recompute
	assert.equal(hints.update({ perception: 1 }), null); // throttled
	assert.equal(hints.latest?.action?.type, 'a0');
	assert.equal(hints.update({ perception: 2 }), null); // throttled
	const fresh = hints.update({ perception: 3 }); // recompute
	assert.equal(fresh?.action?.type, 'a3');
	assert.deepEqual(calls, [0, 3], 'the decider runs only on its turns');
});

test('an idle decision is a suggestion to read, not an absence of one', () => {
	const idle: AIDecision = { agent: 'player', action: null, state: {}, status: 'idle', steps: 0, events: [] };
	const hints = new Suggester(() => idle);

	const fresh = hints.update({ perception: 0 });

	assert.equal(fresh?.status, 'idle');
	assert.equal(fresh?.action, null);
	assert.equal(hints.latest?.status, 'idle');
});

test('clear drops the held suggestion between turns', () => {
	const hints = new Suggester(() => decision('strike'));
	hints.update({ perception: 0 });
	assert.notEqual(hints.latest, null);

	hints.clear();

	assert.equal(hints.latest, null);
});

test('a suggestion budget must be a real frame count', () => {
	assert.throws(() => new Suggester(() => decision('a'), { every: 0 }), /frame count/);
	assert.throws(() => new Suggester(() => decision('a'), { every: 1.5 }), /frame count/);
});

test("the decider's decision reaches the caller untouched", () => {
	const expected = decision('defend', 4);
	const hints = new Suggester(() => expected);

	const fresh = hints.update({ perception: 0 });

	assert.deepEqual(fresh, expected);
	assert.deepEqual(hints.latest, expected);
});
