import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import {
	chebyshevDistance,
	traceLine,
	hasLineOfSight,
	canTarget,
	resolveArea,
} from '../src/roguelike/Targeting.ts';

const KINDS = [
	{ passable: false, transparent: false },
	{ passable: true, transparent: true },
];

function openRoom(width = 11, height = 11): Level {
	const level = new Level(width, height, KINDS);
	level.fillRect({ left: 1, top: 1, right: width - 2, bottom: height - 2 }, 1);
	return level;
}

test('chebyshevDistance counts diagonals the same as a step', () => {
	assert.equal(chebyshevDistance({ x: 0, y: 0 }, { x: 3, y: 0 }), 3);
	assert.equal(chebyshevDistance({ x: 0, y: 0 }, { x: 3, y: 3 }), 3);
	assert.equal(chebyshevDistance({ x: 0, y: 0 }, { x: 2, y: 5 }), 5);
});

test('traceLine starts and ends on the given cells, inclusive', () => {
	const line = traceLine({ x: 0, y: 0 }, { x: 4, y: 0 });
	assert.deepEqual(line[0], { x: 0, y: 0 });
	assert.deepEqual(line[line.length - 1], { x: 4, y: 0 });
	assert.equal(line.length, 5);
});

test('traceLine handles a single-point line without duplicating it', () => {
	const line = traceLine({ x: 2, y: 2 }, { x: 2, y: 2 });
	assert.deepEqual(line, [{ x: 2, y: 2 }]);
});

test('hasLineOfSight is clear across an open room', () => {
	const level = openRoom();
	assert.equal(hasLineOfSight(level, { x: 1, y: 1 }, { x: 9, y: 9 }), true);
});

test('hasLineOfSight is blocked by a wall between the two points', () => {
	const level = openRoom();
	level.fillRect({ left: 5, top: 1, right: 5, bottom: 9 }, 0);
	assert.equal(hasLineOfSight(level, { x: 1, y: 5 }, { x: 9, y: 5 }), false);
});

test('hasLineOfSight ignores opacity of the two endpoints themselves', () => {
	const level = openRoom();
	//a monster standing in a doorway (itself transparent) aiming at a wall torch is a
	//legitimate shot even though neither endpoint needs to be see-through on its own account
	assert.equal(hasLineOfSight(level, { x: 1, y: 1 }, { x: 2, y: 1 }), true);
});

test('canTarget refuses anything past range', () => {
	const level = openRoom();
	assert.equal(canTarget(level, { x: 1, y: 1 }, { x: 5, y: 1 }, { range: 3 }), false);
	assert.equal(canTarget(level, { x: 1, y: 1 }, { x: 4, y: 1 }, { range: 3 }), true);
});

test('canTarget refuses a blocked shot unless line of sight is waived', () => {
	const level = openRoom();
	level.fillRect({ left: 5, top: 1, right: 5, bottom: 9 }, 0);

	assert.equal(canTarget(level, { x: 1, y: 5 }, { x: 9, y: 5 }, { range: 20 }), false);
	assert.equal(
		canTarget(level, { x: 1, y: 5 }, { x: 9, y: 5 }, { range: 20, requireLineOfSight: false }),
		true
	);
});

test('resolveArea single hits only the aimed cell', () => {
	assert.deepEqual(resolveArea({ x: 0, y: 0 }, { x: 3, y: 3 }, { kind: 'single' }), [{ x: 3, y: 3 }]);
});

test('resolveArea line is everything from thrower to target', () => {
	const area = resolveArea({ x: 0, y: 0 }, { x: 3, y: 0 }, { kind: 'line' });
	assert.deepEqual(area, [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 2, y: 0 },
		{ x: 3, y: 0 },
	]);
});

test('resolveArea burst is centred on the target, not the thrower', () => {
	const area = resolveArea({ x: 0, y: 0 }, { x: 5, y: 5 }, { kind: 'burst', radius: 1 });
	assert.ok(area.some((c) => c.x === 5 && c.y === 5));
	assert.ok(area.every((c) => chebyshevDistance({ x: 5, y: 5 }, c) <= 1));
	//no cell near the thrower leaks into a burst aimed five cells away
	assert.ok(!area.some((c) => c.x === 0 && c.y === 0));
});

test('resolveArea burst excludes corners past its radius', () => {
	const area = resolveArea({ x: 0, y: 0 }, { x: 5, y: 5 }, { kind: 'burst', radius: 2 });
	assert.ok(!area.some((c) => c.x === 5 + 2 && c.y === 5 + 2));
});
