import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Whiteboard } from '../src/battle/Whiteboard.ts';

/**
 * The whiteboard (item 265): planned orders with undo and redo. The rules that matter are one plan
 * per unit, replanning a unit replacing its order rather than stacking, and planning after an undo
 * dropping the redo stack the way every undo contract does.
 */

interface Plan {
	unit: string;
	x: number;
	y: number;
}

test('a plan is added and read back by unit', () => {
	const board = new Whiteboard<Plan>();
	board.plan({ unit: 'hero', x: 1, y: 2 });
	board.plan({ unit: 'archer', x: 3, y: 4 });

	assert.deepEqual(board.plans, [
		{ unit: 'hero', x: 1, y: 2 },
		{ unit: 'archer', x: 3, y: 4 },
	]);
	assert.deepEqual(board.plannedFor('hero'), { unit: 'hero', x: 1, y: 2 });
	assert.equal(board.isEmpty, false);
});

test('replanning a unit replaces its plan in place rather than stacking', () => {
	const board = new Whiteboard<Plan>();
	board.plan({ unit: 'hero', x: 1, y: 2 });
	board.plan({ unit: 'archer', x: 3, y: 4 });
	board.plan({ unit: 'hero', x: 5, y: 6 });

	assert.equal(board.plans.length, 2);
	assert.deepEqual(board.plannedFor('hero'), { unit: 'hero', x: 5, y: 6 });
	assert.equal(board.plans[0].unit, 'hero', 'the replacement keeps the unit position');
});

test('undo takes the last plan off and redo puts it back', () => {
	const board = new Whiteboard<Plan>();
	board.plan({ unit: 'hero', x: 1, y: 2 });
	board.plan({ unit: 'archer', x: 3, y: 4 });

	assert.equal(board.canUndo, true);
	assert.equal(board.canRedo, false);

	assert.deepEqual(board.undo(), { unit: 'archer', x: 3, y: 4 });
	assert.equal(board.plans.length, 1);
	assert.equal(board.canRedo, true);

	assert.deepEqual(board.redo(), { unit: 'archer', x: 3, y: 4 });
	assert.equal(board.plans.length, 2);
	assert.equal(board.canRedo, false);
});

test('planning after an undo clears the redo stack', () => {
	const board = new Whiteboard<Plan>();
	board.plan({ unit: 'hero', x: 1, y: 2 });
	board.undo();
	assert.equal(board.canRedo, true);

	board.plan({ unit: 'archer', x: 3, y: 4 });
	assert.equal(board.canRedo, false, 'the old branch is gone');
	assert.equal(board.redo(), null);
});

test('redo puts a unit back exactly once, not twice', () => {
	const board = new Whiteboard<Plan>();
	board.plan({ unit: 'hero', x: 1, y: 2 });
	board.undo();
	board.redo();

	assert.deepEqual(board.plans, [{ unit: 'hero', x: 1, y: 2 }]);
	assert.equal(board.canRedo, false);
});

test('undo and redo on an empty board are null', () => {
	const board = new Whiteboard<Plan>();
	assert.equal(board.undo(), null);
	assert.equal(board.redo(), null);
	assert.equal(board.isEmpty, true);
});

test('commit hands the plans back in order and empties the board', () => {
	const board = new Whiteboard<Plan>();
	board.plan({ unit: 'hero', x: 1, y: 2 });
	board.plan({ unit: 'archer', x: 3, y: 4 });

	assert.deepEqual(board.commit(), [
		{ unit: 'hero', x: 1, y: 2 },
		{ unit: 'archer', x: 3, y: 4 },
	]);
	assert.equal(board.isEmpty, true);
	assert.equal(board.canRedo, false);
});

test('clear empties both the plans and anything undone', () => {
	const board = new Whiteboard<Plan>();
	board.plan({ unit: 'hero', x: 1, y: 2 });
	board.undo();

	board.clear();
	assert.equal(board.isEmpty, true);
	assert.equal(board.canRedo, false);
});
