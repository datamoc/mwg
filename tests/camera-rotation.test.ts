import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../src/two-d/render/Camera.ts';

/**
 * Fixed-angle view rotation (item 285): the view turns in whole steps that an axis-aligned grid
 * closes on - four quarter turns for a square map, six 60-degree steps for a hex one - and
 * `toScreen`/`toWorld` invert the turn so a click still lands on the cell the player aimed at.
 * Culling uses the box around the turned view rather than an axis-aligned guess.
 */

const closeTo = (actual: number, expected: number, epsilon = 1e-9) =>
	assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

function camera(grid: 'square' | 'hex' = 'square'): Camera {
	const camera = new Camera({ grid, zoom: 2 });
	camera.setViewport(800, 600);
	camera.x = 100;
	camera.y = 80;
	return camera;
}

test('a square view has four steps and a hex view six', () => {
	assert.equal(new Camera({ grid: 'square' }).stepsPerTurn, 4);
	assert.equal(new Camera().stepsPerTurn, 4, 'square is the default');
	assert.equal(new Camera({ grid: 'hex' }).stepsPerTurn, 6);
});

test('rotation steps wrap around a full turn', () => {
	const view = camera();
	assert.equal(view.rotationSteps, 0);

	view.setRotationStep(1);
	assert.equal(view.rotationSteps, 1);
	view.setRotationStep(5);
	assert.equal(view.rotationSteps, 1, '5 mod 4');
	view.rotate(-1);
	assert.equal(view.rotationSteps, 0);
	view.rotate(-1);
	assert.equal(view.rotationSteps, 3, 'and negative steps wrap too');
});

test('the angle is a quarter turn for square and a sixth for hex', () => {
	const square = camera('square');
	square.setRotationStep(1);
	closeTo(square.rotation, Math.PI / 2);

	const hex = camera('hex');
	hex.setRotationStep(1);
	closeTo(hex.rotation, Math.PI / 3);
});

test('a bad grid or a fractional step is a named error', () => {
	assert.throws(() => new Camera({ grid: 'triangle' as 'square' }), /grid must be "square" or "hex"/);
	assert.throws(() => camera().setRotationStep(1.5), /rotation step must be an integer/);
});

test('toScreen and toWorld are inverses at every step, on both grids', () => {
	for (const grid of ['square', 'hex'] as const) {
		const view = camera(grid);
		for (let step = 0; step < view.stepsPerTurn; step++) {
			view.setRotationStep(step);
			for (const [x, y] of [
				[100, 80],
				[160, 30],
				[-40, 220],
				[3.5, -7.25],
			]) {
				const screen = view.toScreen(x, y);
				const world = view.toWorld(screen.x, screen.y);
				closeTo(world.x, x, 1e-9);
				closeTo(world.y, y, 1e-9);
			}
		}
	}
});

test('a half turn puts a point on the other side of the view centre', () => {
	const view = camera();
	view.setRotationStep(2);

	const screen = view.toScreen(110, 80); // 10 world units right of the centre, zoom 2
	closeTo(screen.x, 400 - 20, 1e-9);
	closeTo(screen.y, 300);
});

test('the unturned view keeps its exact rectangle, and a turned one reports the rotated box', () => {
	const view = camera();
	//zoom 2: the 800x600 viewport is 400x300 world units
	assert.deepEqual(view.view, { x: 100 - 200, y: 80 - 150, width: 400, height: 300 });

	view.setRotationStep(1); // a quarter turn swaps the box's sides
	const turned = view.view;
	closeTo(turned.x, 100 - 150);
	closeTo(turned.y, 80 - 200);
	closeTo(turned.width, 300);
	closeTo(turned.height, 400);
});

test('uprightRotation cancels the view rotation, for labels drawn into the world', () => {
	const view = camera('hex');
	view.rotate(2);
	closeTo(view.rotation + view.uprightRotation, 0);
	closeTo(view.uprightRotation, -(2 / 6) * Math.PI * 2);

	view.setRotationStep(0);
	assert.ok(view.uprightRotation === 0, 'an unturned view needs no counter-rotation');
});

test('the layer transform turns about the view centre when rotated', () => {
	const view = camera();
	view.setRotationStep(1);
	assert.equal(view.world.rotation, view.rotation);
	assert.deepEqual({ x: view.world.pivot.x, y: view.world.pivot.y }, { x: view.x, y: view.y });
	//the centre lands on the viewport centre, rounding aside
	closeTo(view.world.x, 400, 0.5);
	closeTo(view.world.y, 300, 0.5);
});

test('a full turn comes back to the unturned transform', () => {
	const view = camera();
	view.setRotationStep(3);
	view.rotate();
	assert.equal(view.rotationSteps, 0);
	assert.equal(view.world.rotation, 0);
	assert.deepEqual({ x: view.world.pivot.x, y: view.world.pivot.y }, { x: 0, y: 0 });
});
