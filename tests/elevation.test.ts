import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import { Elevation } from '../src/roguelike/Elevation.ts';
import { FieldOfView } from '../src/roguelike/FieldOfView.ts';
import { Pathfinder } from '../src/roguelike/Pathfinder.ts';
import { hexLine } from '../src/core/Hex.ts';

const KINDS = [
	{ passable: false, transparent: false }, // 0: wall
	{ passable: true, transparent: true }, // 1: floor
];

function flat(width: number, height: number, shape: 'square' | 'hex' = 'square'): { level: Level; heights: Elevation } {
	const level = new Level(width, height, KINDS, 1, shape);
	return { level, heights: new Elevation(level) };
}

test('cells start at ground, and only whole heights stick', () => {
	const { heights } = flat(3, 3);
	assert.equal(heights.heightAt(1, 1), 0);
	assert.equal(heights.heightAt(9, 9), 0);

	heights.set(1, 1, 2);
	heights.set(9, 9, 5); //off the map: ignored, not an error
	assert.equal(heights.heightAt(1, 1), 2);

	assert.throws(() => heights.set(0, 0, 1.5), /whole number/);
	assert.equal(heights.heightAt(0, 0), 0);
});

test('a cliff blocks sight from below but not from above', () => {
	const { level, heights } = flat(5, 1);
	heights.set(2, 0, 2);
	const fov = new FieldOfView(level);

	fov.update(0, 0, 4, { heights });
	assert.equal(fov.isVisible(1, 0), true, 'this side of the cliff is seen');
	assert.equal(fov.isVisible(4, 0), false, 'behind the cliff from below is hidden');

	//the viewer climbs the cliff: the default height is the cell stood on
	fov.update(2, 0, 4, { heights });
	assert.equal(fov.isVisible(0, 0), true, 'from above, the low ground both ways is seen');
	assert.equal(fov.isVisible(4, 0), true);

	//or flies over it without moving: an explicit height overrides the cell's
	fov.update(0, 0, 4, { heights, height: 3 });
	assert.equal(fov.isVisible(4, 0), true, 'high enough to see over');
});

test('walls still block in height mode, and the viewer always sees its own cell', () => {
	const { level, heights } = flat(5, 1);
	level.set(2, 0, 0); //an opaque wall at ground height
	const fov = new FieldOfView(level);

	fov.update(0, 0, 4, { heights, height: 9 });
	assert.equal(fov.isVisible(0, 0), true);
	assert.equal(fov.isVisible(4, 0), false, 'kind opacity is never lowered by height');

	fov.update(2, 2, 0, { heights });
	assert.equal(fov.isVisible(2, 2), false, 'out of bounds is not visible even at radius 0');
});

test('height-aware sight works on a hex map too', () => {
	const { level, heights } = flat(7, 7, 'hex');
	const viewer = { x: 0, y: 3 };
	heights.set(3, 2, 4);

	//whatever cell lies past the cliff on a straight hex line is hidden from below.
	//Odd-q lines zigzag - (0,3) to (6,3) runs (1,2),(2,3),(3,2),(4,3),(5,2) - so the
	//cliff sits on the line itself, not beside it.
	const beyond = { x: 6, y: 3 };
	const line = hexLine(viewer, beyond);
	assert.ok(line.slice(1, -1).some((c) => c.x === 3 && c.y === 2), 'test setup: the line must cross the cliff');

	const fov = new FieldOfView(level);
	fov.update(viewer.x, viewer.y, 6, { heights });
	assert.equal(fov.isVisible(beyond.x, beyond.y), false);

	fov.update(viewer.x, viewer.y, 6, { heights, height: 5 });
	assert.equal(fov.isVisible(beyond.x, beyond.y), true);
});

test('a path climbs stairs but not cliffs', () => {
	const { level, heights } = flat(5, 3);
	//a ridge three high with one stair of height one in the middle row: the ridge
	//cannot be climbed even from the stair, only stepped around through it
	heights.set(2, 0, 3);
	heights.set(2, 1, 3);
	heights.set(2, 2, 1);
	const paths = new Pathfinder(level);

	const over = paths.find({ x: 0, y: 1 }, { x: 4, y: 1 }, { heights, topology: 4 });
	assert.ok(over.length > 0, 'the stairs route around the ridge');
	assert.ok(over.some((s) => s.x === 2 && s.y === 2), 'the path goes through the stair cell');
	assert.ok(!over.some((s) => s.x === 2 && (s.y === 0 || s.y === 1)), 'never straight over the cliff');

	const straight = paths.find({ x: 1, y: 0 }, { x: 3, y: 0 }, { heights, topology: 4, climb: 3 });
	assert.deepEqual(straight, [
		{ x: 2, y: 0 },
		{ x: 3, y: 0 },
	]);
});

test('stepping down is always allowed, however far the drop', () => {
	const { level, heights } = flat(3, 1);
	heights.set(0, 0, 3);
	const paths = new Pathfinder(level);

	assert.deepEqual(paths.find({ x: 0, y: 0 }, { x: 1, y: 0 }, { heights }), [{ x: 1, y: 0 }]);
	assert.deepEqual(paths.find({ x: 1, y: 0 }, { x: 0, y: 0 }, { heights }), [], 'the way back up is refused');
});

test('distance maps and exploration respect the climb limit', () => {
	const { level, heights } = flat(3, 1);
	heights.set(1, 0, 5);
	const paths = new Pathfinder(level);

	const distances = paths.distanceMap({ x: 2, y: 0 }, { heights });
	assert.equal(distances[level.index(2, 0)], 0);
	assert.equal(distances[level.index(0, 0)], -1, 'unreachable past the cliff');

	assert.throws(() => paths.find({ x: 0, y: 0 }, { x: 2, y: 0 }, { heights, climb: -1 }), /climb limit/);
	assert.throws(() => paths.find({ x: 0, y: 0 }, { x: 2, y: 0 }, { heights, climb: 0.5 }), /climb limit/);
});
