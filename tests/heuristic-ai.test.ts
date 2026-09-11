import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	Aspects,
	Difficulty,
	Goals,
	HeuristicAI,
	RecruitmentPattern,
	defaultWeigh,
	goalScore,
	keepAwayScore,
} from '../src/ai/Heuristics.ts';

/**
 * The heuristic AI (item 269): aspects, difficulty levels, goals, recruitment patterns, and a
 * candidate/stage pipeline. `mwg` deliberately ships no aspect values or damage formula, so the
 * tests set their own and pin the pipelining rules - stage order, aspect weighting, keep-away.
 */

test('a missing aspect reads as its fallback, not zero', () => {
	const aspects = new Aspects({ aggression: 2 });
	assert.equal(aspects.number('aggression'), 2);
	assert.equal(aspects.number('caution'), 0);
	assert.equal(aspects.number('caution', 5), 5);
	assert.equal(aspects.has('aggression'), true);
	assert.equal(aspects.has('caution'), false);
});

test('a boolean aspect reads as 1 or 0 and a list aspect wraps a bare string', () => {
	const aspects = new Aspects({ berserk: true, calm: false, pattern: 'scout', avoid: ['water', 'lava'] });
	assert.equal(aspects.number('berserk'), 1);
	assert.equal(aspects.number('calm'), 0);
	assert.equal(aspects.flag('berserk'), true);
	assert.equal(aspects.flag('calm'), false);
	assert.deepEqual(aspects.list('pattern'), ['scout']);
	assert.deepEqual(aspects.list('avoid'), ['water', 'lava']);
	assert.deepEqual(aspects.list('missing'), []);
});

test('with layers overrides without touching the original', () => {
	const base = new Aspects({ aggression: 1, caution: 2 });
	const hard = base.with({ aggression: 3 });

	assert.equal(hard.number('aggression'), 3);
	assert.equal(hard.number('caution'), 2, 'the rest carries over');
	assert.equal(base.number('aggression'), 1, 'the base is untouched');
});

test('a difficulty level applies over the base and rejects an unknown id', () => {
	const difficulty = new Difficulty([{ id: 'hard', aspects: { aggression: 2 } }], { aggression: 1, caution: 4 });
	const hard = difficulty.aspectsFor('hard');
	assert.equal(hard.number('aggression'), 2);
	assert.equal(hard.number('caution'), 4);
	assert.deepEqual(difficulty.ids, ['hard']);
	assert.throws(() => difficulty.aspectsFor('insane'), /unknown difficulty level/);
});

test('duplicate difficulty ids are refused', () => {
	assert.throws(() => new Difficulty([{ id: 'a' }, { id: 'a' }]), /duplicate difficulty level/);
});

test('goals are set, read and cleared per unit', () => {
	const goals = new Goals();
	assert.equal(goals.isEmpty, true);

	goals.set({ unit: 'hero', kind: 'attack', target: 'rat', priority: 3 });
	goals.set({ unit: 'guard', kind: 'defend' });
	assert.equal(goals.get('hero')?.target, 'rat');
	assert.equal(goals.all().length, 2);
	assert.equal(goalScore(goals.get('hero')), 3);
	assert.equal(goalScore(goals.get('guard')), 1, 'no priority reads as 1');
	assert.equal(goalScore(goals.get('missing')), 0);

	goals.clear('hero');
	assert.equal(goals.get('hero'), undefined);
	assert.equal(goals.isEmpty, false);
});

test('a recruitment pattern cycles and falls back when empty', () => {
	const pattern = new RecruitmentPattern(['scout', 'fighter'], 'fighter');
	assert.equal(pattern.at(0), 'scout');
	assert.equal(pattern.at(1), 'fighter');
	assert.equal(pattern.at(2), 'scout');
	assert.equal(pattern.at(-1), 'fighter', 'a negative index counts back');
	assert.equal(pattern.next(null), 'scout');
	assert.equal(pattern.next('scout'), 'fighter');
	assert.equal(pattern.next('unknown'), 'scout', 'an entry not in the pattern starts over');

	const empty = new RecruitmentPattern([], 'fighter');
	assert.equal(empty.at(0), 'fighter');
	assert.equal(empty.next('scout'), 'fighter');
});

test('the default stage weight is each factor times the aspect of the same name', () => {
	const score = defaultWeigh(
		{ id: 'charge', action: {}, factors: { aggression: 3, village_value: 2 } },
		{ aspects: new Aspects({ aggression: 2, village_value: 1 }) },
	);
	assert.equal(score, 8, '3*2 + 2*1');
});

test('an unset aspect weighs 1, so a factor is not erased', () => {
	const score = defaultWeigh({ id: 'a', action: {}, factors: { aggression: 3 } }, { aspects: new Aspects() });
	assert.equal(score, 3);
});

test('keepAwayScore penalises a candidate inside the radius and nothing outside it', () => {
	assert.equal(keepAwayScore(1, 3), -2);
	assert.equal(keepAwayScore(3, 3), 0, 'exactly on the radius is outside');
	assert.equal(keepAwayScore(9, 3), 0);
	assert.equal(keepAwayScore(1, 0), 0, 'no radius, no penalty');
});

test('the default weight applies the keep-away penalty from the distance factor', () => {
	const score = defaultWeigh(
		{ id: 'advance', action: {}, factors: { village_value: 4, distance: 1 } },
		{ aspects: new Aspects({ village_value: 1, keep_away: 3 }) },
	);
	assert.equal(score, 2, '4 for the village, -2 for standing one tile inside a keep-away of 3');
});

test('the stage pipeline picks the highest-scoring candidate', () => {
	const ai = new HeuristicAI<{ kind: string }>({ stages: [{ id: 'best' }] });
	const decision = ai.decide(
		[
			{ id: 'wait', action: { kind: 'wait' }, factors: { caution: 2 } },
			{ id: 'charge', action: { kind: 'attack' }, factors: { aggression: 3 } },
		],
		{ aspects: new Aspects({ aggression: 1, caution: 1 }) },
	);

	assert.equal(decision?.candidate.id, 'charge');
	assert.equal(decision?.stage, 'best');
	assert.equal(decision?.score, 3);
});

test('the first stage whose when passes decides, and the rest never run', () => {
	const ai = new HeuristicAI<{ kind: string }>({
		stages: [
			{ id: 'early', when: (context) => context.turn === 1, weigh: () => 100 },
			{ id: 'normal', weigh: () => 1 },
		],
	});
	const candidates = [{ id: 'a', action: { kind: 'a' } }];

	assert.equal(ai.decide(candidates, { aspects: new Aspects(), turn: 1 })?.stage, 'early');
	assert.equal(ai.decide(candidates, { aspects: new Aspects(), turn: 2 })?.stage, 'normal');
});

test('a stage that never applies yields no decision', () => {
	const ai = new HeuristicAI<{ kind: string }>({ stages: [{ id: 'never', when: () => false }] });
	assert.equal(ai.decide([{ id: 'a', action: { kind: 'a' } }], { aspects: new Aspects() }), null);
	assert.equal(ai.decide([], { aspects: new Aspects() }), null, 'and no candidates is no decision');
});

test('a tie keeps the earlier candidate, so a decision is stable', () => {
	const ai = new HeuristicAI<{ kind: string }>({ stages: [{ id: 'best', weigh: () => 1 }] });
	const decision = ai.decide(
		[
			{ id: 'first', action: { kind: 'a' } },
			{ id: 'second', action: { kind: 'b' } },
		],
		{ aspects: new Aspects() },
	);
	assert.equal(decision?.candidate.id, 'first');
});

test('a stage can read goals through its own weigh', () => {
	const goals = new Goals();
	goals.set({ unit: 'hero', kind: 'attack', target: 'rat', priority: 5 });

	const ai = new HeuristicAI<{ kind: string }>({
		stages: [
			{
				id: 'goal',
				weigh: (candidate, context) =>
					candidate.action.kind === context.goals?.get(candidate.unit ?? '')?.kind
						? goalScore(context.goals?.get(candidate.unit ?? ''))
						: 0,
			},
		],
	});
	const decision = ai.decide(
		[
			{ id: 'hold', action: { kind: 'defend' }, unit: 'hero' },
			{ id: 'strike', action: { kind: 'attack' }, unit: 'hero' },
		],
		{ aspects: new Aspects(), goals },
	);
	assert.equal(decision?.candidate.id, 'strike', 'the hero was told to attack');
});
