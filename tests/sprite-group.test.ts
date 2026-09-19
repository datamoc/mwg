import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'pixi.js';

import { Camera } from '../src/two-d/render/Camera.ts';
import { AnimatedSprite } from '../src/two-d/render/AnimatedSprite.ts';
import { SpriteGroup, isOnScreen } from '../src/two-d/render/SpriteGroup.ts';

/** a camera whose view is exactly the 100x100 box from (0, 0) to (100, 100) */
function stage(): Camera {
	const camera = new Camera({ zoom: 1 });
	camera.setViewport(100, 100);
	camera.snapTo(50, 50);
	return camera;
}

/** a playing two-frame sprite at the given world position */
function sprite(x: number, y: number): AnimatedSprite {
	const s = new AnimatedSprite();
	s.add('walk', [Texture.WHITE, Texture.EMPTY], { fps: 10 });
	s.play('walk');
	s.x = x;
	s.y = y;
	return s;
}

test('isOnScreen is true inside the view and false past each edge', () => {
	const camera = stage();

	assert.equal(isOnScreen(camera, 50, 50), true);
	assert.equal(isOnScreen(camera, -1, 50), false, 'past the left edge');
	assert.equal(isOnScreen(camera, 101, 50), false, 'past the right edge');
	assert.equal(isOnScreen(camera, 50, -1), false, 'past the top edge');
	assert.equal(isOnScreen(camera, 50, 101), false, 'past the bottom edge');
});

test('isOnScreen counts the edges themselves as on screen, margin or not', () => {
	const camera = stage();

	assert.equal(isOnScreen(camera, 0, 0), true, 'the corner is in, not out');
	assert.equal(isOnScreen(camera, 100, 100), true, 'the far corner too');
	assert.equal(isOnScreen(camera, -8, 50, 8), true, 'a margin pulls a near miss back in');
	assert.equal(isOnScreen(camera, -9, 50, 8), false, 'but only as far as the margin reaches');
	assert.equal(isOnScreen(camera, 50, 50), true, 'the default margin is zero, not infinite');
});

test('isOnScreen still sees the view centre under rotation', () => {
	const camera = stage();
	camera.rotateTo(Math.PI / 4);

	//the turned viewport's box only grows, so the centre cannot fall out of it; the weaker
	//half of the promise (never a false negative) is the one worth pinning
	assert.equal(isOnScreen(camera, camera.x, camera.y), true);
});

test('a group advances its on-screen members and freezes the rest', () => {
	const camera = stage();
	const group = new SpriteGroup();
	const near = sprite(10, 10);
	const far = sprite(500, 500);
	group.add(near).add(far);

	group.update(camera, 0.05);

	assert.ok(near.elapsedTime > 0, 'the on-screen sprite moved forward in time');
	assert.equal(far.elapsedTime, 0, 'the off-screen sprite never saw the frame');
});

test('a frozen member resumes where it left off when it comes back into view', () => {
	const camera = stage();
	const group = new SpriteGroup();
	const wanderer = sprite(500, 500);
	group.add(wanderer);

	group.update(camera, 0.05);
	assert.equal(wanderer.elapsedTime, 0, 'frozen while away');

	wanderer.x = 10;
	wanderer.y = 10;
	group.update(camera, 0.05);
	assert.ok(wanderer.elapsedTime > 0, 'advancing again, not restarted or left behind');
});

test('a group margin animates members just past the edge', () => {
	const camera = stage();
	const group = new SpriteGroup();
	const edge = sprite(104, 50);
	group.add(edge);

	group.update(camera, 0.05);
	assert.equal(edge.elapsedTime, 0, 'four world units past the edge is out');

	group.update(camera, 0.05, 8);
	assert.ok(edge.elapsedTime > 0, 'the margin reaches it');
});

test('a group tracks membership: fluent add, no duplicates, honest remove, clear', () => {
	const group = new SpriteGroup();
	const a = sprite(10, 10);
	const b = sprite(20, 20);

	assert.equal(group.add(a), group, 'add returns the group for chaining');
	group.add(a);
	assert.equal(group.size, 1, 'the same member twice is still one member');
	group.add(b);
	assert.equal(group.size, 2);

	assert.equal(group.remove(a), true);
	assert.equal(group.remove(a), false, 'removing what is gone reports it');
	assert.equal(group.size, 1);

	group.clear();
	assert.equal(group.size, 0);
});

test('updating an empty group, or one whose members all left, does nothing', () => {
	const camera = stage();
	const group = new SpriteGroup();
	group.update(camera, 0.05);

	const gone = sprite(900, 900);
	group.add(gone);
	group.update(camera, 0.05);
	assert.equal(gone.elapsedTime, 0);
});
