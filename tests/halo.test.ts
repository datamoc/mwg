import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'pixi.js';
import { Halo, HALO_ANIMATION } from '../src/two-d/render/Halo.ts';

/**
 * A halo is an animated sprite with two opinions of its own: it glows (additive by default) and it
 * keeps a target's offset in one place. Both are checkable without a renderer - a sprite and its
 * blend mode exist without one - which is why they are checked here rather than in a screenshot.
 */

const white = Texture.WHITE;
const empty = Texture.EMPTY;

test('a halo glows additively and is already playing its own cycle', () => {
	const glow = new Halo({ frames: [white, empty] });

	assert.equal(glow.blendMode, 'add');
	assert.equal(glow.playing, HALO_ANIMATION);
	assert.equal(glow.texture, white, 'the first frame, as any animation starts on');
	assert.equal(glow.isFinished, false);
});

test('a halo can be built to blend normally instead', () => {
	assert.equal(new Halo({ frames: [white], blendMode: 'normal' }).blendMode, 'normal');
});

test('follow applies the halo s offset once, wherever the target stands', () => {
	const glow = new Halo({ frames: [white], offsetX: 4, offsetY: -6 });

	glow.follow(100, 50);
	assert.deepEqual([glow.x, glow.y], [104, 44]);

	glow.follow(0, 0);
	assert.deepEqual([glow.x, glow.y], [4, -6], 'it tracks the target rather than accumulating on it');
});

test('a halo built without an offset sits exactly on its target', () => {
	const glow = new Halo({ frames: [white] });

	glow.follow(7, 9);

	assert.deepEqual([glow.x, glow.y], [7, 9]);
});

test('the halo s cycle advances on the frame model, and never moves the halo itself', () => {
	const glow = new Halo({
		frames: [
			{ texture: white, duration: 0.1 },
			{ texture: empty, duration: 0.1 },
		],
	});
	glow.follow(5, 5);

	glow.update(0.15);

	assert.equal(glow.texture, empty, 'one and a half frames in');
	assert.equal(glow.elapsedTime, 0.15);
	assert.deepEqual([glow.x, glow.y], [5, 5], 'the position belongs to follow and the caller');
});

test('a halo loops by default, and can be built to play once', () => {
	const once = new Halo({
		frames: [
			{ texture: white, duration: 0.1 },
			{ texture: empty, duration: 0.1 },
		],
		animation: { loop: false },
	});

	once.update(0.25);

	assert.equal(once.isFinished, true);
});
