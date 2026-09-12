import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	resolveArea,
	coneCells,
	coneSector,
	chainTargets,
	knockbackPath,
	chebyshevDistance,
} from '../src/roguelike/Targeting.ts';
import { Level } from '../src/roguelike/Level.ts';

function level(): Level {
	return new Level(10, 10, [
		{ passable: false, transparent: false },
		{ passable: true, transparent: true },
	]);
}

/** the same level, opened up: ten by ten of plain floor */
function openFloor(): Level {
	const map = level();
	map.fillRect({ left: 0, top: 0, right: 9, bottom: 9 }, 1);
	return map;
}

test('a width-0 cone is a single-file beam along the aim', () => {
	assert.deepEqual(coneCells({ x: 2, y: 2 }, { x: 5, y: 2 }, 0), [
		{ x: 3, y: 2 },
		{ x: 4, y: 2 },
		{ x: 5, y: 2 },
	]);
});

test('a cone widens with distance and stays symmetric', () => {
	const cells = coneCells({ x: 0, y: 4 }, { x: 4, y: 4 }, 2);
	const atFarEnd = cells.filter((cell) => cell.x === 4).map((cell) => cell.y);
	assert.deepEqual(atFarEnd, [2, 3, 4, 5, 6]);
	//documented rule: step i spans round(i / length * width) to each side - widths grow
	//1,1,2,2 cells per side here, i.e. 3,3,5,5 cells per step, never shrinking
	const widths = [1, 2, 3, 4].map((x) => cells.filter((cell) => cell.x === x).length);
	assert.deepEqual(widths, [3, 3, 5, 5]);
});

test('a diagonal cone stays within one step of the snapped diagonal', () => {
	const cells = coneCells({ x: 0, y: 0 }, { x: 3, y: 3 }, 1);
	assert.ok(
		cells.some((cell) => cell.x === 3 && cell.y === 3),
		'reaches the target',
	);
	const centres = [
		{ x: 1, y: 1 },
		{ x: 2, y: 2 },
		{ x: 3, y: 3 },
	];
	for (const cell of cells) {
		const nearest = Math.min(...centres.map((c) => Math.max(Math.abs(cell.x - c.x), Math.abs(cell.y - c.y))));
		assert.ok(nearest <= 1, `(${cell.x},${cell.y}) strays from the diagonal`);
	}
});

test('aiming at your own cell resolves to just that cell', () => {
	assert.deepEqual(coneCells({ x: 2, y: 2 }, { x: 2, y: 2 }, 3), [{ x: 2, y: 2 }]);
});

test('resolveArea routes the cone shape through coneCells', () => {
	assert.deepEqual(
		resolveArea({ x: 2, y: 2 }, { x: 4, y: 2 }, { kind: 'cone', width: 1 }),
		coneCells({ x: 2, y: 2 }, { x: 4, y: 2 }, 1),
	);
});

test('chainTargets hops nearest-first, never revisits, and stops at range', () => {
	const candidates = [
		{ x: 2, y: 0 },
		{ x: 4, y: 0 },
		{ x: 9, y: 9 },
	];
	const chain = chainTargets(candidates, { x: 0, y: 0 }, 3, 3);
	assert.deepEqual(chain, [
		{ x: 2, y: 0 },
		{ x: 4, y: 0 },
	]);
});

test('chainTargets visits each candidate at most once even with jumps to spare', () => {
	const candidates = [
		{ x: 1, y: 0 },
		{ x: 2, y: 0 },
	];
	assert.equal(chainTargets(candidates, { x: 0, y: 0 }, 10, 5).length, 2);
});

test('knockbackPath runs until the first blocked cell', () => {
	const map = level();
	map.fillRect({ left: 0, top: 0, right: 9, bottom: 9 }, 1);
	map.set(5, 2, 0); //a wall three cells along
	assert.deepEqual(knockbackPath(map, { x: 2, y: 2 }, { x: 1, y: 0 }, 5), [
		{ x: 3, y: 2 },
		{ x: 4, y: 2 },
	]);
});

test('knockbackPath with open ground returns the full distance', () => {
	const map = level();
	map.fillRect({ left: 0, top: 0, right: 9, bottom: 9 }, 1);
	assert.equal(knockbackPath(map, { x: 1, y: 1 }, { x: 0, y: 1 }, 3).length, 3);
});

test('a cone sector spans its arc, keeps its aim, and leaves the caster out', () => {
	const from = { x: 3, y: 5 };
	const cells = coneSector(openFloor(), from, { x: 9, y: 5 }, { degrees: 90, range: 4 });
	const keys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));

	assert.ok(keys.has('7,5'), 'dead ahead, at the full range');
	assert.ok(keys.has('6,4') && keys.has('6,6'), 'either side of the aim');
	assert.ok(!keys.has('3,1') && !keys.has('3,2'), 'straight up is at right angles to a 90 degree arc');
	assert.ok(!keys.has('3,5'), 'the caster is not inside its own cone');
});

test('a cone sector is symmetric about its aim', () => {
	const cells = coneSector(openFloor(), { x: 2, y: 5 }, { x: 8, y: 5 }, { degrees: 70, range: 5 });
	const keys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));

	assert.ok(cells.length > 8, 'and there is a sector to be symmetric about');
	for (const cell of cells) {
		assert.ok(keys.has(`${cell.x},${10 - cell.y}`), `(${cell.x},${cell.y}) has no mirrored cell`);
	}
});

test('a wall face is inside the sector and everything behind it is not', () => {
	const map = openFloor();
	map.fillRect({ left: 6, top: 0, right: 6, bottom: 9 }, 0); //a full column of wall, six cells east

	const cells = coneSector(map, { x: 2, y: 5 }, { x: 8, y: 5 }, { degrees: 120, range: 8 });

	assert.ok(
		cells.some((cell) => cell.x === 6),
		'the wall face is hit',
	);
	assert.ok(
		!cells.some((cell) => cell.x > 6),
		'and nothing behind it is, even with the cone wide enough to reach around',
	);
	assert.ok(
		cells.some((cell) => cell.x === 5 && cell.y === 5),
		'the floor in front of the wall stays in the cone',
	);
});

test('a zero degree sector is a single ray, and a zero length aim is the caster alone', () => {
	assert.deepEqual(coneSector(openFloor(), { x: 2, y: 2 }, { x: 8, y: 2 }, { degrees: 0, range: 3 }), [
		{ x: 3, y: 2 },
		{ x: 4, y: 2 },
		{ x: 5, y: 2 },
	]);
	assert.deepEqual(coneSector(openFloor(), { x: 2, y: 2 }, { x: 2, y: 2 }, { degrees: 30, range: 3 }), [
		{ x: 2, y: 2 },
	]);
});

test('a cone sector never reaches past its range and never repeats a cell', () => {
	const from = { x: 4, y: 4 };
	const cells = coneSector(openFloor(), from, { x: 9, y: 4 }, { degrees: 100, range: 3 });

	assert.ok(cells.length > 0);
	for (const cell of cells) {
		assert.ok(chebyshevDistance(from, cell) <= 3, `(${cell.x},${cell.y}) is past the range`);
	}
	assert.equal(new Set(cells.map((cell) => `${cell.x},${cell.y}`)).size, cells.length);
});

test('a cone sector refuses an angle or a range that is not a non-negative number', () => {
	const map = openFloor();
	assert.throws(
		() => coneSector(map, { x: 1, y: 1 }, { x: 5, y: 1 }, { degrees: -1, range: 3 }),
		/non-negative angle/,
	);
	assert.throws(
		() => coneSector(map, { x: 1, y: 1 }, { x: 5, y: 1 }, { degrees: 30, range: Number.NaN }),
		/non-negative range/,
	);
});
