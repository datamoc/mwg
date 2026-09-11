import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AttackDialog } from '../src/battle/AttackDialog.ts';

/**
 * The attack dialog (item 265): choosing a pair and running the damage preview's clock. The
 * boundaries are before both choices are made, at the animation's start and end, and after `back`
 * undoes the choice.
 */

const units = [
	{ id: 'hero', side: '1', hp: 20 },
	{ id: 'rat', side: '2', hp: 12 },
];

const dialog = (strikeDuration = 0.2) =>
	new AttackDialog({
		units,
		side: '1',
		damageFor: () => ({ damage: 4, strikes: 3 }),
		strikeDuration,
	});

test('there is no preview before both choices are made', () => {
	const ui = dialog();
	assert.equal(ui.preview, null);
	assert.equal(ui.frame, null);
	assert.equal(ui.update(0.1), null, 'and nothing to advance');

	ui.select();
	assert.equal(ui.attacker?.id, 'hero');
	assert.equal(ui.target, null);
	assert.equal(ui.preview, null, 'an attacker alone is not enough');
});

test('choosing both builds the preview from the game damage numbers', () => {
	const ui = dialog();
	ui.select();
	ui.select();

	assert.equal(ui.target?.id, 'rat');
	assert.equal(ui.preview?.totalDamage, 12);
	assert.equal(ui.frame?.defenderHp, 12, 'the frame at rest is before the first strike');
});

test('update advances the animation frame by frame', () => {
	const ui = dialog();
	ui.select();
	ui.select();

	assert.equal(ui.frame?.strike, 0);
	assert.equal(ui.update(0.25)?.strike, 1, 'past the first strike');
	assert.equal(ui.update(0.25)?.strike, 2, 'past the second');
	assert.equal(ui.finished, false);
	assert.equal(ui.update(0.25)?.strike, 3, 'past the third, the end frame');
	assert.equal(ui.finished, true);
	assert.equal(ui.elapsed, ui.preview?.duration, 'the clock stops at the animation length');
});

test('the clock is clamped at both ends', () => {
	const ui = dialog();
	ui.select();
	ui.select();

	ui.update(-1);
	assert.equal(ui.elapsed, 0, 'a negative dt cannot rewind');
	ui.update(99);
	assert.equal(ui.elapsed, ui.preview?.duration);
	assert.equal(ui.finished, true);
});

test('finish skips the animation to its end', () => {
	const ui = dialog();
	ui.select();
	ui.select();

	ui.finish();
	assert.equal(ui.finished, true);
	assert.equal(ui.frame?.defenderHp, 0, 'three strikes of four kill the twelve-hp defender');
});

test('back clears the preview so the choice can be remade', () => {
	const ui = dialog();
	ui.select();
	ui.select();
	assert.notEqual(ui.preview, null);

	ui.back();
	assert.equal(ui.attacker, null);
	assert.equal(ui.preview, null);
	assert.equal(ui.frame, null);
});

test('reset returns the dialog to the start', () => {
	const ui = dialog();
	ui.select();
	ui.select();
	ui.update(0.5);

	ui.reset();
	assert.equal(ui.attacker, null);
	assert.equal(ui.preview, null);
	assert.equal(ui.elapsed, 0);
	assert.equal(ui.stage, 'attacker');
});

test('a zero strike duration is finished as soon as it is built', () => {
	const ui = dialog(0);
	ui.select();
	ui.select();
	assert.equal(ui.finished, true, 'with no animation, the blow is already over');
});
