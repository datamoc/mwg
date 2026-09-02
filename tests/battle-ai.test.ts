import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TypeMatrix } from '../src/battle/TypeMatrix.ts';
import { chooseMove, chooseSwitch } from '../src/battle/BattleAI.ts';

function matchup(): TypeMatrix {
	const matrix = new TypeMatrix();
	matrix.set('fire', 'grass', 2);
	matrix.set('water', 'fire', 2);
	matrix.set('fire', 'water', 0.5);
	matrix.set('grass', 'fire', 0.5);
	return matrix;
}

test('chooseMove returns null for an empty list', () => {
	assert.equal(chooseMove([], matchup(), ['grass']), null);
});

test('chooseMove picks the type-effective move by default', () => {
	const matrix = matchup();
	const moves = [{ type: 'water', name: 'splash' }, { type: 'fire', name: 'ember' }];

	assert.equal(chooseMove(moves, matrix, ['fire'])!.name, 'splash');
});

test('chooseMove keeps the first candidate on a tie', () => {
	const matrix = matchup(); // both moves are neutral against a type with no set pairing
	const moves = [{ type: 'normal', name: 'tackle' }, { type: 'psychic', name: 'confusion' }];

	assert.equal(chooseMove(moves, matrix, ['rock'])!.name, 'tackle');
});

test('chooseMove accepts a custom score function instead of the type-effectiveness default', () => {
	const matrix = matchup();
	const moves = [{ type: 'water', power: 10 }, { type: 'fire', power: 100 }];

	//scoring purely by power should override the type-effective default's own pick
	const best = chooseMove(moves, matrix, ['fire'], (move) => move.power);
	assert.equal(best!.power, 100);
});

test('chooseSwitch finds a bench member with a strictly better defensive matchup', () => {
	const matrix = matchup();
	//opponent attacks with fire: the active fire-type takes a neutral 1x, but water resists it at 0.5x
	const bench = [{ types: ['fire'] }, { types: ['water'] }];

	const index = chooseSwitch(['fire'], bench, matrix, ['fire']);
	assert.equal(index, 1);
});

test('chooseSwitch returns null when nothing on the bench is an improvement', () => {
	const matrix = matchup();
	const bench = [{ types: ['fire'] }]; // same matchup as the active creature

	const index = chooseSwitch(['fire'], bench, matrix, ['grass']);
	assert.equal(index, null);
});

test('chooseSwitch with an empty bench always returns null', () => {
	const matrix = matchup();
	assert.equal(chooseSwitch(['fire'], [], matrix, ['water']), null);
});
