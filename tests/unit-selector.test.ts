import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UnitSelector } from '../src/battle/UnitSelector.ts';

/**
 * The unit selector (item 265): pick an attacker, then a target. The boundaries are the side
 * filter, the disabled units, the target predicate once an attacker exists, and `back` undoing the
 * attacker choice rather than only the target.
 */

const units = [
	{ id: 'hero', side: '1' },
	{ id: 'archer', side: '1' },
	{ id: 'rat', side: '2' },
	{ id: 'bat', side: '2' },
	{ id: 'ghost', side: '2', disabled: true },
];

test('candidates are the enabled units on the selecting side', () => {
	const selector = new UnitSelector({ units, side: '1' });
	assert.deepEqual(
		selector.candidates.map((unit) => unit.id),
		['hero', 'archer'],
	);
	assert.equal(selector.stage, 'attacker');
	assert.equal(selector.highlighted?.id, 'hero');
});

test('targets are empty until an attacker is chosen', () => {
	const selector = new UnitSelector({ units, side: '1' });
	assert.equal(selector.targets.length, 0);
	assert.equal(selector.select(), true, 'the highlighted hero is chosen');
	assert.equal(selector.attacker?.id, 'hero');
	assert.equal(selector.stage, 'target');
	assert.deepEqual(
		selector.targets.map((unit) => unit.id),
		['rat', 'bat'],
		'the disabled ghost and the attacker are not targets',
	);
});

test('select on the target stage completes the choice', () => {
	const selector = new UnitSelector({ units, side: '1' });
	selector.select();
	selector.select();
	assert.equal(selector.done, true);
	assert.equal(selector.target?.id, 'rat');
});

test('canTarget narrows the targets', () => {
	const selector = new UnitSelector({
		units,
		side: '1',
		canTarget: (_attacker, target) => target.id === 'bat',
	});
	selector.select();
	assert.deepEqual(
		selector.targets.map((unit) => unit.id),
		['bat'],
	);
});

test('move wraps within the active list', () => {
	const selector = new UnitSelector({ units, side: '1' });
	selector.move(-1);
	assert.equal(selector.highlighted?.id, 'archer', 'wraps to the last candidate');
	selector.move(1);
	assert.equal(selector.highlighted?.id, 'hero');
});

test('back undoes the attacker choice, not just the target', () => {
	const selector = new UnitSelector({ units, side: '1' });
	selector.select();
	assert.equal(selector.stage, 'target');

	selector.back();
	assert.equal(selector.stage, 'attacker');
	assert.equal(selector.attacker, null);
	assert.equal(selector.target, null);
	assert.equal(selector.highlighted?.id, 'hero', 'the highlight returns to where the attacker was');
});

test('back on the attacker stage does nothing', () => {
	const selector = new UnitSelector({ units, side: '1' });
	selector.back();
	assert.equal(selector.stage, 'attacker');
});

test('with no side, every enabled unit can attack', () => {
	const selector = new UnitSelector({ units });
	assert.deepEqual(
		selector.candidates.map((unit) => unit.id),
		['hero', 'archer', 'rat', 'bat'],
	);
});

test('a disabled predicate overrides the unit flag', () => {
	const selector = new UnitSelector({ units, side: '1', disabled: (unit) => unit.id === 'hero' });
	assert.deepEqual(
		selector.candidates.map((unit) => unit.id),
		['archer'],
	);
});

test('an empty candidate list selects nothing', () => {
	const selector = new UnitSelector({ units: [], side: '1' });
	assert.equal(selector.select(), false);
	assert.equal(selector.done, false);
});
