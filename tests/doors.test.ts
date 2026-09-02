import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import { Doors } from '../src/roguelike/Doors.ts';

const KINDS = [
	{ passable: false, transparent: false }, // 0: wall
	{ passable: true, transparent: true }, // 1: floor
	{ passable: false, transparent: false }, // 2: closed door
	{ passable: true, transparent: true }, // 3: open door
];

function levelWithDoor(): { level: Level; doors: Doors } {
	const level = new Level(5, 5, KINDS);
	level.fillRect({ left: 0, top: 0, right: 4, bottom: 4 }, 1);
	const doors = new Doors(level);
	doors.place(2, 2, { open: 3, closed: 2 });
	return { level, doors };
}

test('a placed door starts closed by default, blocking passage and sight', () => {
	const { level, doors } = levelWithDoor();
	assert.ok(doors.isDoor(2, 2));
	assert.equal(doors.isOpen(2, 2), false);
	assert.equal(level.passable(2, 2), false);
	assert.equal(level.transparent(2, 2), false);
});

test('startOpen places a door already open', () => {
	const level = new Level(3, 3, KINDS);
	level.fillRect({ left: 0, top: 0, right: 2, bottom: 2 }, 1);
	const doors = new Doors(level);
	doors.place(1, 1, { open: 3, closed: 2, startOpen: true });

	assert.equal(doors.isOpen(1, 1), true);
	assert.equal(level.passable(1, 1), true);
});

test('open swaps the terrain to the open kind and reports success', () => {
	const { level, doors } = levelWithDoor();
	assert.equal(doors.open(2, 2), true);
	assert.equal(doors.isOpen(2, 2), true);
	assert.equal(level.passable(2, 2), true);
	assert.equal(level.transparent(2, 2), true);
});

test('opening an already-open door is a no-op that reports failure', () => {
	const { doors } = levelWithDoor();
	doors.open(2, 2);
	assert.equal(doors.open(2, 2), false);
});

test('close swaps back to the closed kind', () => {
	const { level, doors } = levelWithDoor();
	doors.open(2, 2);
	assert.equal(doors.close(2, 2), true);
	assert.equal(doors.isOpen(2, 2), false);
	assert.equal(level.passable(2, 2), false);
});

test('closing an already-closed door is a no-op that reports failure', () => {
	const { doors } = levelWithDoor();
	assert.equal(doors.close(2, 2), false);
});

test('a cell that was never placed as a door is not one', () => {
	const { doors } = levelWithDoor();
	assert.equal(doors.isDoor(0, 0), false);
	assert.equal(doors.open(0, 0), false);
});

test('a locked door refuses to open until unlocked', () => {
	const level = new Level(3, 3, KINDS);
	level.fillRect({ left: 0, top: 0, right: 2, bottom: 2 }, 1);
	const doors = new Doors(level);
	doors.place(1, 1, { open: 3, closed: 2, locked: 'brass-key' });

	assert.equal(doors.isLocked(1, 1), true);
	assert.equal(doors.requiredKey(1, 1), 'brass-key');
	assert.equal(doors.open(1, 1), false);
	assert.equal(doors.isOpen(1, 1), false);

	assert.equal(doors.unlock(1, 1), true);
	assert.equal(doors.isLocked(1, 1), false);
	assert.equal(doors.open(1, 1), true);
});

test('unlocking a door that was never locked reports failure', () => {
	const { doors } = levelWithDoor();
	assert.equal(doors.unlock(2, 2), false);
});
