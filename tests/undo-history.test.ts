import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UndoHistory } from '../src/core/UndoHistory.ts';

test('current is null and neither undo nor redo is possible before anything is pushed', () => {
	const history = new UndoHistory<number>();
	assert.equal(history.current, null);
	assert.equal(history.canUndo, false);
	assert.equal(history.canRedo, false);
	assert.equal(history.undo(), null);
	assert.equal(history.redo(), null);
});

test('push records the new current state, and a single state cannot be undone', () => {
	const history = new UndoHistory<number>();
	history.push(1);
	assert.equal(history.current, 1);
	assert.equal(history.canUndo, false);
});

test('undo steps back through pushed states, redo steps forward again', () => {
	const history = new UndoHistory<number>();
	history.push(1);
	history.push(2);
	history.push(3);

	assert.equal(history.undo(), 2);
	assert.equal(history.current, 2);
	assert.equal(history.undo(), 1);
	assert.equal(history.canUndo, false);
	assert.equal(history.undo(), null);

	assert.equal(history.redo(), 2);
	assert.equal(history.redo(), 3);
	assert.equal(history.canRedo, false);
	assert.equal(history.redo(), null);
});

test('pushing after an undo discards the redo tail', () => {
	const history = new UndoHistory<number>();
	history.push(1);
	history.push(2);
	history.push(3);
	history.undo(); //back to 2, with 3 available to redo

	history.push(4); //a new turn taken from 2 - 3 never happened from here
	assert.equal(history.canRedo, false);
	assert.equal(history.current, 4);
	assert.equal(history.undo(), 2);
});

test('the limit drops the oldest state once exceeded', () => {
	const history = new UndoHistory<number>({ limit: 2 });
	history.push(1);
	history.push(2);
	history.push(3);

	assert.equal(history.undo(), 2);
	assert.equal(history.undo(), null); //1 was dropped, nothing further back
});

test('a limit below 1 is clamped to 1 rather than rejected', () => {
	const history = new UndoHistory<number>({ limit: 0 });
	history.push(1);
	history.push(2);
	assert.equal(history.current, 2);
	assert.equal(history.canUndo, false);
});

test('clear drops everything, including redo history', () => {
	const history = new UndoHistory<number>();
	history.push(1);
	history.push(2);
	history.undo();

	history.clear();
	assert.equal(history.current, null);
	assert.equal(history.canUndo, false);
	assert.equal(history.canRedo, false);
});

test('states are stored by reference, so a game\'s own snapshot object round-trips exactly', () => {
	const history = new UndoHistory<{ hp: number }>();
	const a = { hp: 10 };
	const b = { hp: 7 };
	history.push(a);
	history.push(b);

	assert.equal(history.undo(), a);
});
