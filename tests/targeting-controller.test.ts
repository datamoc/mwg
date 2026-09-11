import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level, WALL, FLOOR } from '../src/roguelike/Level.ts';
import { TargetingController } from '../src/roguelike/Targeting.ts';

/** an open room, every cell floor, so a wall has to be placed on purpose to block a shot */
function openLevel(width = 12, height = 12, shape: 'square' | 'hex' = 'square'): Level {
	//1 is the index of FLOOR in the kinds table above: every cell starts passable and transparent
	return new Level(width, height, [WALL, FLOOR], 1, shape);
}

test('the cursor starts where the options put it, the origin by default', () => {
	const level = openLevel();
	const aim = new TargetingController(level, { origin: { x: 2, y: 2 }, range: 5 });
	assert.deepEqual(aim.target, { x: 2, y: 2 });
	assert.equal(aim.distance, 0);
	assert.equal(aim.valid, true, 'a zero-distance single-cell aim is legal');

	const moved = new TargetingController(level, { origin: { x: 2, y: 2 }, range: 5, cursor: { x: 4, y: 2 } });
	assert.deepEqual(moved.target, { x: 4, y: 2 });
});

test('move steps one cell on a square grid and reports each move', () => {
	const level = openLevel();
	const aim = new TargetingController(level, { origin: { x: 2, y: 2 }, range: 5 });
	const seen: Array<{ x: number; y: number }> = [];
	aim.onMove.add((cell) => {
		seen.push(cell);
	});

	aim.move(1, 0);
	assert.deepEqual(aim.target, { x: 3, y: 2 });
	aim.move(0, 1);
	assert.deepEqual(aim.target, { x: 3, y: 3 });
	aim.move(-1, -1);
	assert.deepEqual(aim.target, { x: 2, y: 2 });

	assert.deepEqual(seen, [
		{ x: 3, y: 2 },
		{ x: 3, y: 3 },
		{ x: 2, y: 2 },
	]);
});

test('a move that would leave the map is ignored rather than clamped to its edge', () => {
	const level = openLevel();
	const aim = new TargetingController(level, { origin: { x: 0, y: 0 }, range: 5 });
	aim.move(-1, 0);
	assert.deepEqual(aim.target, { x: 0, y: 0 }, 'still at the corner');
	aim.move(0, -1);
	assert.deepEqual(aim.target, { x: 0, y: 0 });

	aim.moveTo({ x: -3, y: 4 });
	assert.deepEqual(aim.target, { x: 0, y: 0 });
});

test('an aim past the range is illegal, and the boundary itself is legal', () => {
	const level = openLevel();
	const aim = new TargetingController(level, { origin: { x: 1, y: 1 }, range: 3 });

	aim.moveTo({ x: 4, y: 1 });
	assert.equal(aim.distance, 3);
	assert.equal(aim.inRange, true);
	assert.equal(aim.valid, true, 'distance exactly at the range is in range');

	aim.moveTo({ x: 5, y: 1 });
	assert.equal(aim.distance, 4);
	assert.equal(aim.inRange, false);
	assert.equal(aim.valid, false);
});

test('a wall between origin and cursor blocks the aim unless sight is waived', () => {
	const level = openLevel();
	level.set(2, 1, 0); //0 is the index of WALL in the kinds table, opaque and impassable

	const strict = new TargetingController(level, { origin: { x: 1, y: 1 }, range: 5 });
	strict.moveTo({ x: 3, y: 1 });
	assert.equal(strict.inSight, false);
	assert.equal(strict.valid, false);

	const loose = new TargetingController(level, { origin: { x: 1, y: 1 }, range: 5, requireLineOfSight: false });
	loose.moveTo({ x: 3, y: 1 });
	assert.equal(loose.inSight, false);
	assert.equal(loose.valid, true, 'sight was waived, so the wall does not matter');
});

test('a game validate hook can veto an aim that range and sight would allow', () => {
	const level = openLevel();
	const aim = new TargetingController(level, {
		origin: { x: 1, y: 1 },
		range: 5,
		validate: (target) => !(target.x === 3 && target.y === 1),
	});

	aim.moveTo({ x: 3, y: 1 });
	assert.equal(aim.inRange, true);
	assert.equal(aim.valid, false, 'the hook said no');

	aim.moveTo({ x: 2, y: 1 });
	assert.equal(aim.valid, true);
});

test('preview resolves the shape while the aim is legal and is empty while it is not', () => {
	const level = openLevel();
	const aim = new TargetingController(level, {
		origin: { x: 1, y: 1 },
		range: 2,
		shape: { kind: 'burst', radius: 1 },
	});

	aim.moveTo({ x: 2, y: 2 });
	assert.deepEqual(aim.preview(), [
		{ x: 2, y: 1 },
		{ x: 1, y: 2 },
		{ x: 2, y: 2 },
		{ x: 3, y: 2 },
		{ x: 2, y: 3 },
	]);

	aim.moveTo({ x: 4, y: 4 });
	assert.equal(aim.valid, false);
	assert.deepEqual(aim.preview(), []);
});

test('setShape changes what a confirm resolves without moving the cursor', () => {
	const level = openLevel();
	const aim = new TargetingController(level, { origin: { x: 1, y: 1 }, range: 3 });
	aim.moveTo({ x: 3, y: 1 });
	assert.deepEqual(aim.preview(), [{ x: 3, y: 1 }]);

	aim.setShape({ kind: 'line' });
	assert.deepEqual(aim.target, { x: 3, y: 1 });
	assert.deepEqual(aim.preview(), [
		{ x: 1, y: 1 },
		{ x: 2, y: 1 },
		{ x: 3, y: 1 },
	]);
});

test('confirm returns the cells and dispatches; an illegal aim returns null and stays quiet', () => {
	const level = openLevel();
	const aim = new TargetingController(level, { origin: { x: 1, y: 1 }, range: 2 });
	const confirmed: Array<{ cells: ReadonlyArray<{ x: number; y: number }> }> = [];
	aim.onConfirm.add((result) => {
		confirmed.push(result);
	});

	aim.moveTo({ x: 5, y: 5 });
	assert.equal(aim.confirm(), null);
	assert.equal(confirmed.length, 0);

	aim.moveTo({ x: 2, y: 1 });
	const result = aim.confirm();
	assert.deepEqual(result, {
		origin: { x: 1, y: 1 },
		target: { x: 2, y: 1 },
		shape: { kind: 'single' },
		cells: [{ x: 2, y: 1 }],
	});
	assert.equal(confirmed.length, 1);
});

test('cancel dispatches without a result', () => {
	const level = openLevel();
	const aim = new TargetingController(level, { origin: { x: 1, y: 1 }, range: 2 });
	let cancelled = 0;
	aim.onCancel.add(() => {
		cancelled++;
	});

	aim.cancel();
	assert.equal(cancelled, 1);
});

test('the controller refuses a negative or non-finite range up front', () => {
	const level = openLevel();
	assert.throws(() => new TargetingController(level, { origin: { x: 1, y: 1 }, range: -1 }));
	assert.throws(() => new TargetingController(level, { origin: { x: 1, y: 1 }, range: Number.NaN }));
});

test('on a hex level the cursor moves along a real neighbour, not a raw offset', () => {
	const level = openLevel(12, 12, 'hex');
	const aim = new TargetingController(level, { origin: { x: 3, y: 3 }, range: 4 });

	//the level's own neighbourhood is the authority on what a step means here
	const east = level.neighbors(3, 3).find((cell) => cell.x - 3 === 1 && cell.y - 3 === 0);
	assert.ok(east, 'the test level has an east neighbour');

	aim.move(1, 0);
	assert.deepEqual(aim.target, east);

	//a step that is not a neighbour at all is ignored
	const before = aim.target;
	aim.move(2, 0);
	assert.deepEqual(aim.target, before);
});

test('hex distance uses the hex ruler, not Chebyshev', () => {
	const level = openLevel(12, 12, 'hex');
	const aim = new TargetingController(level, { origin: { x: 3, y: 3 }, range: 2 });
	aim.moveTo(level.neighbors(3, 3)[0]);
	assert.equal(aim.distance, 1);
	assert.equal(aim.valid, true);
});
