import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../src/two-d/render/Camera.ts';

/**
 * Free-angle view rotation (item 286): any angle, not only a grid's whole steps, and smooth
 * animation between two angles - including between a hex view's six exact positions, rather
 * than only landing on them. Builds on 285's layer-level rotation: toScreen/toWorld/view
 * already work at any angle, so this only adds the API to reach one.
 */

const closeTo = (actual: number, expected: number, epsilon = 1e-9) =>
	assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

function camera(): Camera {
	const camera = new Camera({ zoom: 2 });
	camera.setViewport(800, 600);
	camera.x = 100;
	camera.y = 80;
	return camera;
}

test('rotateTo turns to an arbitrary angle immediately, not confined to a grid step', () => {
	const view = camera();
	view.rotateTo(0.4);
	closeTo(view.rotation, 0.4);
	assert.equal(view.world.rotation, 0.4);
});

test('toScreen and toWorld stay inverses at an arbitrary angle', () => {
	const view = camera();
	view.rotateTo(0.73);
	for (const [x, y] of [
		[100, 80],
		[160, 30],
		[-40, 220],
	]) {
		const screen = view.toScreen(x, y);
		const world = view.toWorld(screen.x, screen.y);
		closeTo(world.x, x, 1e-9);
		closeTo(world.y, y, 1e-9);
	}
});

test('view reports the rotated bounding box at an arbitrary angle too', () => {
	const view = camera();
	view.rotateTo(Math.PI / 6);
	const turned = view.view;
	//an over-inclusive box, at minimum as large as the unturned 400x300 rectangle
	assert.ok(turned.width > 400 - 1e-9);
	assert.ok(turned.height > 300 - 1e-9);
});

test('animateRotationTo eases the angle over successive update() calls', () => {
	const view = camera();
	view.animateRotationTo(1);
	view.update(1 / 60);
	assert.ok(view.rotation > 0 && view.rotation < 1, 'partway there after one frame');
	for (let i = 0; i < 300; i++) view.update(1 / 60);
	closeTo(view.rotation, 1, 1e-3);
});

test('animateRotationTo takes the shorter way around a full turn', () => {
	const view = camera();
	view.rotateTo(-0.1); // just past a full turn, the short way from a small positive target
	view.animateRotationTo(0.1);
	view.update(1 / 60);
	//moving towards 0.1 the short way increases the angle; the long way would decrease it
	//by nearly a full turn instead
	assert.ok(view.rotation > -0.1);
});

test('setRotationStep after a free rotation snaps straight to the step, no animation', () => {
	const view = camera();
	view.rotateTo(0.4);
	view.setRotationStep(1);
	closeTo(view.rotation, Math.PI / 2);
});

test('reduced motion jumps a free-rotation animation to its target in one frame', async (t) => {
	const motion = await import('../src/core/Motion.ts');
	motion.setReducedMotion(true);
	t.after(() => motion.setReducedMotion(false));

	const view = camera();
	view.animateRotationTo(1.2);
	view.update(1 / 60);
	closeTo(view.rotation, 1.2);
});
