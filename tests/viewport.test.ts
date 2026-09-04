import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Viewport, splitScreenHalves } from '../src/render/Viewport.ts';

test('a Viewport wires its camera to the given screen region', () => {
	const viewport = new Viewport({ x: 100, y: 0, width: 200, height: 300, zoom: 1 });
	viewport.camera.snapTo(0, 0);

	//world origin lands at the region's own centre: 100 + 200/2, 0 + 300/2
	assert.equal(viewport.camera.world.x, 200);
	assert.equal(viewport.camera.world.y, 150);
});

test('a single Viewport covering the whole canvas behaves like an ordinary full-screen camera', () => {
	const viewport = new Viewport({ x: 0, y: 0, width: 800, height: 600, zoom: 1 });
	viewport.camera.snapTo(0, 0);

	assert.equal(viewport.camera.world.x, 400);
	assert.equal(viewport.camera.world.y, 300);
});

test('resize moves the region and updates the camera to match', () => {
	const viewport = new Viewport({ x: 0, y: 0, width: 200, height: 200, zoom: 1 });
	viewport.resize(50, 60, 200, 200);
	viewport.camera.snapTo(0, 0);

	assert.equal(viewport.camera.world.x, 50 + 100);
	assert.equal(viewport.camera.world.y, 60 + 100);
});

test('the container is masked to the region so content cannot bleed past it', () => {
	const viewport = new Viewport({ x: 10, y: 20, width: 50, height: 60, zoom: 1 });
	assert.ok(viewport.container.mask);
});

test('update() drives the camera, so a following/shaking camera still works inside a Viewport', () => {
	const viewport = new Viewport({ x: 0, y: 0, width: 100, height: 100, zoom: 1 });
	viewport.camera.follow({ x: 100, y: 0 }, 100); // strong intensity, closes fast

	viewport.update(1);
	assert.ok(viewport.camera.x > 0, 'the camera should have moved toward its follow target');
});

test('splitScreenHalves splits a landscape screen left/right', () => {
	const [a, b] = splitScreenHalves(800, 600);
	assert.deepEqual(a, { x: 0, y: 0, width: 400, height: 600 });
	assert.deepEqual(b, { x: 400, y: 0, width: 400, height: 600 });
});

test('splitScreenHalves splits a portrait screen top/bottom', () => {
	const [a, b] = splitScreenHalves(600, 800);
	assert.deepEqual(a, { x: 0, y: 0, width: 600, height: 400 });
	assert.deepEqual(b, { x: 0, y: 400, width: 600, height: 400 });
});

test('splitScreenHalves handles an odd dimension without losing or overlapping a pixel', () => {
	const [a, b] = splitScreenHalves(801, 600);
	assert.equal(a.width + b.width, 801);
	assert.equal(a.x + a.width, b.x);
});
