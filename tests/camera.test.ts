import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../src/render/Camera.ts';

test('view matches the actual bounds-clamped render position, not the raw unclamped centre', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(20, 20); // halfWidth = halfHeight = 10
	camera.setBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 });

	//dragged near the right edge: the raw centre (95) would put the view past maxX, so
	//apply() clamps the rendered centre to 90 (100 - halfWidth)
	camera.snapTo(95, 50);

	assert.equal(camera.x, 95, 'the raw target is left unclamped');
	assert.equal(camera.view.x, 80, 'view must report the clamped centre (90), not the raw one (95)');
	//world.x is what apply() actually rendered at; it must agree with view's own math
	assert.equal(camera.world.x, Math.round(10 - 90 * 1));
});

test('view is unaffected by bounds when the raw centre is already inside them', () => {
	const camera = new Camera({ zoom: 2 });
	camera.setViewport(40, 40); // halfWidth = halfHeight = 10 world units at zoom 2
	camera.setBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
	camera.snapTo(50, 50);

	assert.equal(camera.view.x, 40);
	assert.equal(camera.view.y, 40);
});

test('view centres a map narrower than the viewport rather than clamping to an edge', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(100, 100); // halfWidth = 50, wider than the whole map below
	camera.setBounds({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
	camera.snapTo(0, 0);

	assert.equal(camera.view.x, 10 - 50); // centred at (0+20)/2 = 10
});
