import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startingTactics, addTacticalUnit } from '../src/board/Tactics.ts';
import { startingArmy, recruit, recall, bankUnit, armyIncome, applyUpkeep } from '../src/board/Army.ts';

function unit(id: string, owner: string, x: number, y: number) {
	return { id, owner, x, y, hp: 10, maxHp: 10, actions: 2 };
}

test('recruiting deducts currency and places a unit, all or nothing', () => {
	const board = startingTactics(3, 3, 'square');
	const army = startingArmy(10);

	assert.equal(recruit(army, board, unit('a', 'red', 0, 0), 6), true);
	assert.equal(army.currency, 4);
	assert.equal(board.units.length, 1);
});

test('recruiting past what the army can afford touches neither currency nor the board', () => {
	const board = startingTactics(3, 3, 'square');
	const army = startingArmy(5);

	assert.equal(recruit(army, board, unit('a', 'red', 0, 0), 6), false);
	assert.equal(army.currency, 5);
	assert.equal(board.units.length, 0);
});

test('a banked unit leaves the board and enters the recall pool', () => {
	const board = startingTactics(3, 3, 'square');
	addTacticalUnit(board, unit('a', 'red', 0, 0));

	const army = startingArmy(0);
	assert.equal(bankUnit(army, board, 'a'), true);
	assert.equal(board.units.length, 0);
	assert.equal(army.pool.length, 1);
	assert.equal(army.pool[0].id, 'a');
});

test('recalling a pooled unit places it and removes it from the pool, without spending currency', () => {
	const board = startingTactics(3, 3, 'square');
	addTacticalUnit(board, unit('a', 'red', 0, 0));
	const army = startingArmy(0);
	bankUnit(army, board, 'a');

	assert.equal(recall(army, board, 'a', 2, 2), true);
	assert.equal(army.currency, 0);
	assert.equal(army.pool.length, 0);
	const placed = board.units.find((u) => u.id === 'a');
	assert.equal(placed?.x, 2);
	assert.equal(placed?.y, 2);
});

test('recalling an id not in the pool is a no-op that reports failure', () => {
	const board = startingTactics(3, 3, 'square');
	const army = startingArmy(0);
	assert.equal(recall(army, board, 'nobody', 0, 0), false);
	assert.equal(board.units.length, 0);
});

test('recruiting onto an occupied or out-of-bounds cell reports failure rather than throwing', () => {
	const board = startingTactics(3, 3, 'square');
	addTacticalUnit(board, unit('blocker', 'red', 0, 0));
	const army = startingArmy(100);

	assert.doesNotThrow(() => assert.equal(recruit(army, board, unit('a', 'red', 0, 0), 6), false));
	assert.equal(army.currency, 100, 'a failed placement must not spend currency either');
	assert.doesNotThrow(() => assert.equal(recruit(army, board, unit('b', 'red', 10, 10), 6), false));
});

test('recalling onto an occupied cell reports failure rather than throwing, and leaves the pool untouched', () => {
	const board = startingTactics(3, 3, 'square');
	addTacticalUnit(board, unit('a', 'red', 0, 0));
	const army = startingArmy(0);
	bankUnit(army, board, 'a');
	addTacticalUnit(board, unit('blocker', 'blue', 2, 2));

	assert.doesNotThrow(() => assert.equal(recall(army, board, 'a', 2, 2), false));
	assert.equal(army.pool.length, 1, 'a failed recall must leave the template in the pool');
});

test('income minus upkeep scales with the number of units an owner controls', () => {
	const board = startingTactics(3, 3, 'square');
	addTacticalUnit(board, unit('a', 'red', 0, 0));
	addTacticalUnit(board, unit('b', 'red', 1, 0));
	addTacticalUnit(board, unit('c', 'blue', 2, 2));

	assert.equal(armyIncome(board, 'red', { incomePerUnit: 5, upkeepPerUnit: 2 }), 6);
	assert.equal(armyIncome(board, 'blue', { incomePerUnit: 5, upkeepPerUnit: 2 }), 3);
});

test('applying upkeep updates the army currency by the computed delta', () => {
	const board = startingTactics(3, 3, 'square');
	addTacticalUnit(board, unit('a', 'red', 0, 0));
	const army = startingArmy(10);

	const total = applyUpkeep(army, board, 'red', { incomePerUnit: 5, upkeepPerUnit: 8 });
	assert.equal(total, 7); // 10 + (5 - 8)
	assert.equal(army.currency, 7);
});
