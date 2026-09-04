import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera, snapZoom } from '../src/render/Camera.ts';

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

test('toWorld inverts toScreen at the raw (unclamped) centre', () => {
	const camera = new Camera({ zoom: 2 });
	camera.setViewport(200, 200);
	camera.snapTo(30, 40);

	const screen = camera.toScreen(50, 70);
	const back = camera.toWorld(screen.x, screen.y);
	assert.equal(back.x, 50);
	assert.equal(back.y, 70);
});

test('toWorld agrees with the actual rendered (bounds-clamped) position, not the raw centre', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(100, 100); // halfWidth = 50, wider than the whole map below
	camera.setBounds({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
	//following a target near x=0; apply() actually renders centred at (0+20)/2 = 10,
	//same as the `view centres a map narrower...` case above
	camera.snapTo(0, 0);

	//a click at screen centre must map to the tile actually drawn there (10, 10), not to
	//the raw unclamped centre (0, 0) - the bug this test guards against left every
	//click-to-move target off by (clamped - raw) world units
	const world = camera.toWorld(50, 50);
	assert.equal(world.x, 10);
	assert.equal(world.y, 10);

	//and the point it drew at screen centre (the clamped centre itself) must map back to it
	const screen = camera.toScreen(10, 10);
	assert.equal(screen.x, 50);
	assert.equal(screen.y, 50);
});

test('snapZoom rounds to the nearest whole pixel size for the given tile size', () => {
	assert.equal(snapZoom(2.3, 16), 2.3125); // 2.3*16=36.8 -> rounds to 37px -> 37/16
	assert.equal(snapZoom(2, 16), 2); // already exact, unaffected
	assert.equal(snapZoom(0.001, 16), 1 / 16); // never rounds down to a zero-pixel tile
});

test('a camera with pixelPerfectTileSize snaps its own zoom on construction and on every set', () => {
	const camera = new Camera({ zoom: 2.3, pixelPerfectTileSize: 16 });
	assert.equal(camera.zoom, 2.3125);

	camera.zoom = 1.1;
	assert.equal(camera.zoom, snapZoom(1.1, 16));
});

test('a camera without pixelPerfectTileSize keeps a fractional zoom exactly', () => {
	const camera = new Camera({ zoom: 2.3 });
	assert.equal(camera.zoom, 2.3);
});

// ------------------------------------------------------------------- screen-region offset (split screen)

test('setViewport defaults its screen offset to 0, unchanged from a full-screen camera', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(100, 100);
	camera.snapTo(0, 0);
	assert.equal(camera.world.x, 50);
	assert.equal(camera.toScreen(0, 0).x, 50);
});

test('a nonzero screen offset shifts world.x/world.y by exactly that offset', () => {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(100, 100, 200, 300); // this camera's own rectangle starts at (200, 300)
	camera.snapTo(0, 0);
	assert.equal(camera.world.x, 200 + 50);
	assert.equal(camera.world.y, 300 + 50);
});

test('toScreen/toWorld account for the screen offset and remain inverses of each other', () => {
	const camera = new Camera({ zoom: 2 });
	camera.setViewport(100, 100, 400, 0);
	camera.snapTo(10, 10);

	const screen = camera.toScreen(30, 40);
	assert.equal(screen.x, (30 - 10) * 2 + 400 + 50); // matches apply()'s own math
	assert.deepEqual(camera.toWorld(screen.x, screen.y), { x: 30, y: 40 });
});

test('two cameras sharing one canvas, offset side by side, report independent screen coordinates for the same world point', () => {
	const left = new Camera({ zoom: 1 });
	left.setViewport(160, 100, 0, 0);
	left.snapTo(0, 0);

	const right = new Camera({ zoom: 1 });
	right.setViewport(160, 100, 160, 0);
	right.snapTo(0, 0);

	//the same world origin lands in each camera's own half of the screen, 160px apart
	assert.equal(left.toScreen(0, 0).x, 80);
	assert.equal(right.toScreen(0, 0).x, 240);
});
