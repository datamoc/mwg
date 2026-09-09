import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	startingSkirmish,
	setSkirmishTerrain,
	canPlaceSkirmishUnit,
	addSkirmishUnit,
	skirmishMoves,
	moveSkirmishUnit,
	skirmishAttack,
	skirmishIncome,
	endSkirmishTurn,
} from '../src/board/HexSkirmish.ts';
import type { SkirmishState, SkirmishUnit } from '../src/board/HexSkirmish.ts';

const TERRAIN = { plain: { moveCost: 1, defense: 0 }, forest: { moveCost: 2, defense: 0.5 }, water: { moveCost: Infinity, defense: 0 } };

function unit(overrides: Partial<SkirmishUnit> & Pick<SkirmishUnit, 'id' | 'owner' | 'x' | 'y'>): SkirmishUnit {
	return { hp: 10, maxHp: 10, moves: 4, attack: 4, hitChance: 1, ...overrides };
}

function getUnit(state: SkirmishState, id: string): SkirmishUnit {
	const found = state.units.find((candidate) => candidate.id === id);
	assert.ok(found, `expected unit "${id}" to exist`);
	return found;
}

test('a plain map lets a unit reach every hex within its movement budget', () => {
	const state = startingSkirmish(6, 6, TERRAIN);
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0, moves: 2 }));

	const moves = skirmishMoves(state, 'a');
	assert.ok(moves.every((move) => move.cost <= 2));
	assert.ok(moves.some((move) => move.x === 1 && move.y === 0 && move.cost === 1));
});

test('forest costs more movement than plain, and can block a move within budget', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	setSkirmishTerrain(state, 1, 0, 'forest');
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0, moves: 2 }));

	const toForest = skirmishMoves(state, 'a').find((move) => move.x === 1 && move.y === 0);
	assert.equal(toForest?.cost, 2, 'entering forest costs its own moveCost, not a flat 1');

	const throughForest = skirmishMoves(state, 'a').find((move) => move.x === 2 && move.y === 0);
	assert.equal(throughForest, undefined, 'reaching past the forest needs more than 2 movement');
});

test('water is impassable regardless of budget', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	setSkirmishTerrain(state, 1, 0, 'water');
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0, moves: 99 }));

	assert.equal(canPlaceSkirmishUnit(state, 1, 0), false);
	assert.equal(skirmishMoves(state, 'a').find((move) => move.x === 1 && move.y === 0), undefined);
});

test('moving deducts the real cost and stepping onto a village captures it', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	setSkirmishTerrain(state, 1, 0, 'plain', true);
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0, moves: 4 }));

	const move = skirmishMoves(state, 'a').find((candidate) => candidate.x === 1 && candidate.y === 0)!;
	moveSkirmishUnit(state, move);

	assert.equal(getUnit(state, 'a').remainingMoves, 3);
	assert.equal(state.cells[0 * 3 + 1].owner, 'blue');
});

test('an attack that kills the defender leaves no retaliation', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0, attack: 100 }));
	addSkirmishUnit(state, unit({ id: 'b', owner: 'red', x: 1, y: 0, hp: 5, maxHp: 5 }));

	const exchange = skirmishAttack(state, 'a', 'b');
	assert.equal(exchange.strikes.length, 1);
	assert.equal(exchange.strikes[0].killed, true);
	assert.equal(state.units.some((candidate) => candidate.id === 'b'), false);
});

test('a defender that survives strikes back', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0, attack: 1 }));
	addSkirmishUnit(state, unit({ id: 'b', owner: 'red', x: 1, y: 0, attack: 3 }));

	const exchange = skirmishAttack(state, 'a', 'b');
	assert.equal(exchange.strikes.length, 2);
	assert.deepEqual(exchange.strikes.map((strike) => strike.attacker), ['a', 'b']);
	assert.equal(getUnit(state, 'a').hp, 7);
});

test('terrain defense can reduce hit chance to zero, guaranteeing a miss', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	setSkirmishTerrain(state, 1, 0, 'forest'); // 0.5 defense, but hitChance 1 * (1 - 0.5) still lands sometimes -
	state.terrainTable.forest.defense = 1; // push it to a guaranteed miss for a deterministic assertion
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0 }));
	addSkirmishUnit(state, unit({ id: 'b', owner: 'red', x: 1, y: 0 }));

	const exchange = skirmishAttack(state, 'a', 'b');
	assert.equal(exchange.strikes[0].hit, false);
	assert.equal(exchange.strikes[0].damage, 0);
});

test('combat only works between adjacent units', () => {
	const state = startingSkirmish(4, 1, TERRAIN);
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0 }));
	addSkirmishUnit(state, unit({ id: 'b', owner: 'red', x: 3, y: 0 }));

	assert.throws(() => skirmishAttack(state, 'a', 'b'), /adjacency-only/);
});

test('income is the base plus one share per village owned', () => {
	const state = startingSkirmish(4, 1, TERRAIN);
	setSkirmishTerrain(state, 0, 0, 'plain', true);
	setSkirmishTerrain(state, 1, 0, 'plain', true);
	state.cells[0].owner = 'blue';
	state.cells[1].owner = 'blue';

	assert.equal(skirmishIncome(state, 'blue', 2, 1), 4);
	assert.equal(skirmishIncome(state, 'red', 2, 1), 2);
});

test('ending a turn refills movement and heals units standing on their own village', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	setSkirmishTerrain(state, 1, 0, 'plain', true);
	state.cells[1].owner = 'red';
	addSkirmishUnit(state, unit({ id: 'a', owner: 'blue', x: 0, y: 0, moves: 4 }));
	addSkirmishUnit(state, unit({ id: 'b', owner: 'red', x: 1, y: 0, hp: 4, maxHp: 10, moves: 4 }));

	getUnit(state, 'a').remainingMoves = 0;
	endSkirmishTurn(state, 3);

	assert.equal(state.turn, 'red');
	assert.equal(getUnit(state, 'b').remainingMoves, 4);
	assert.equal(getUnit(state, 'b').hp, 7, 'healed by healPerVillage while standing on an owned village');
});

test('ending a turn with no units is a no-op', () => {
	const state = startingSkirmish(3, 1, TERRAIN);
	assert.doesNotThrow(() => endSkirmishTurn(state));
});
