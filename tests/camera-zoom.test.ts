import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../src/two-d/render/Camera.ts';

const close = (actual: number, expected: number, epsilon = 1e-9): void => {
	assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

test('zoomTo keeps the world point under the screen point fixed while the zoom eases', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(200, 100);
	camera.snapTo(100, 100);

	const point = { x: 160, y: 30 };
	const anchor = camera.toWorld(point.x, point.y);
	const before = camera.toScreen(anchor.x, anchor.y);
	close(before.x, point.x);
	close(before.y, point.y);

	camera.zoomTo(point, 2, 1);
	assert.equal(camera.zooming, true);
	assert.equal(camera.zoom, 1, 'the first frame has not moved the zoom yet');

	camera.update(0.5);
	assert.equal(camera.zooming, true);
	close(camera.zoom, 1.5);
	const middle = camera.toScreen(anchor.x, anchor.y);
	close(middle.x, point.x, 1e-6);
	close(middle.y, point.y, 1e-6);

	camera.update(0.5);
	assert.equal(camera.zooming, false);
	close(camera.zoom, 2);
	const after = camera.toScreen(anchor.x, anchor.y);
	close(after.x, point.x, 1e-6);
	close(after.y, point.y, 1e-6);
});

test('a zero duration jumps straight to the target zoom around the point', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(200, 100);
	camera.snapTo(100, 100);

	const point = { x: 20, y: 80 };
	const anchor = camera.toWorld(point.x, point.y);
	camera.zoomTo(point, 3, 0);

	assert.equal(camera.zooming, false);
	assert.equal(camera.zoom, 3);
	const screen = camera.toScreen(anchor.x, anchor.y);
	close(screen.x, point.x, 1e-6);
	close(screen.y, point.y, 1e-6);
});

test('zoomTo at the view centre zooms without translating the camera', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(200, 100);
	camera.snapTo(80, 40);

	camera.zoomTo({ x: 100, y: 50 }, 4, 0.5);
	camera.update(0.5);

	close(camera.x, 80, 1e-6);
	close(camera.y, 40, 1e-6);
	assert.equal(camera.zoom, 4);
});

test('zoomTo stops a follow target fighting the anchor, and stopZoom keeps the current view', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(200, 100);
	camera.snapTo(100, 100);
	camera.follow({ x: 0, y: 0 }, 8);

	camera.zoomTo({ x: 30, y: 20 }, 2, 1);
	camera.update(0.25);
	const midway = { x: camera.x, y: camera.y };
	camera.stopZoom();
	camera.update(0.25);

	assert.equal(camera.zooming, false);
	close(camera.x, midway.x);
	close(camera.y, midway.y);
	assert.ok(camera.zoom > 1 && camera.zoom < 2, 'the zoom stopped partway, it did not finish');
});
