import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'pixi.js';
import { AnimatedSprite, Animation } from '../src/two-d/render/AnimatedSprite.ts';

/**
 * Frame timing is arithmetic, so it is checked here as arithmetic: which frame plays at which
 * moment, including the two edges that Wesnoth's own data leans on, a frame that carries its own
 * duration and an animation that starts partway into itself. Neither `Animation` nor
 * `AnimatedSprite` needs a renderer for that, only textures that exist.
 */

const white = Texture.WHITE;
const empty = Texture.EMPTY;

test('a plain texture list is still a uniform animation, at the fps given', () => {
	const walk = new Animation([white, empty, white], { fps: 10 });

	assert.equal(walk.frameDuration, 0.1);
	assert.equal(walk.duration, walk.frameDuration * 3, 'the frames times the frame duration, as before');
	assert.equal(walk.startTime, 0);

	// ten frames, where multiplying and adding ten copies of 0.1 part ways: a loop wraps on this
	// total, so the exact one is worth having
	const ten = new Animation(
		Array.from({ length: 10 }, () => white),
		{ fps: 10 },
	);
	assert.equal(ten.duration, 1);
});

test('a frame that carries its own duration is held for it, and the total follows', () => {
	const swing = new Animation(
		[{ texture: white, duration: 0.4 }, { texture: empty, duration: 0.1 }, { texture: white }],
		{ fps: 20 },
	);

	assert.equal(swing.duration, 0.55, '0.4 plus 0.1 plus the fps frame the third one falls back to');
	assert.equal(swing.frameIndexAt(0.39), 0, 'still the long first frame');
	assert.equal(swing.frameIndexAt(0.4), 1, 'the long frame is over exactly here');
	assert.equal(swing.frameIndexAt(0.49), 1);
	//a boundary written as a decimal is a hair away from itself in binary: 0.5 minus 0.4 and 0.1
	//leaves 0.09999999999999998, still inside the second frame. Probing just past the hairline is
	//the honest reading of a timing rule; asserting the hairline itself would assert the float
	assert.equal(swing.frameIndexAt(0.51), 2);
});

test('an animation that starts partway into itself skips the frames it passes', () => {
	// Wesnoth's `start_time=-450` over five frames of 100ms: the swing begins four and a half
	// frames in, so the frame the damage lands on lines up with the attack
	const thrust = new Animation(
		[
			{ texture: white, duration: 0.1 },
			{ texture: white, duration: 0.1 },
			{ texture: white, duration: 0.1 },
			{ texture: white, duration: 0.1 },
			{ texture: empty, duration: 0.1 },
		],
		{ fps: 10, startTime: -0.45, loop: false },
	);

	assert.equal(thrust.frameIndexAt(0), 4, 'it opens on the fifth frame, not the first');
	assert.equal(thrust.frameIndexAt(0.04), 4);
	assert.equal(thrust.frameIndexAt(0.05), 4, 'and the remaining half frame still has to run out');
});

test('a positive start time holds the first frame before anything moves', () => {
	const delayed = new Animation(
		[
			{ texture: white, duration: 0.1 },
			{ texture: empty, duration: 0.1 },
		],
		{
			fps: 10,
			startTime: 0.2,
		},
	);

	assert.equal(delayed.frameIndexAt(0), 0);
	assert.equal(delayed.frameIndexAt(0.19), 0, 'still waiting');
	assert.equal(delayed.frameIndexAt(0.25), 0, 'waiting is over, the first frame plays');
	assert.equal(delayed.frameIndexAt(0.31), 1, 'a hair past the delay, the second frame is up');
	assert.equal(delayed.startTime + delayed.duration, 0.4, 'the delay plus the frames is one pass');
});

test('a looping animation wraps on the frames own length, not on the delay', () => {
	const loop = new Animation(
		[
			{ texture: white, duration: 0.1 },
			{ texture: empty, duration: 0.2 },
		],
		{
			fps: 10,
			startTime: 0.5,
		},
	);

	assert.equal(loop.frameIndexAt(0.55), 0);
	assert.equal(loop.frameIndexAt(0.75), 1);
	assert.equal(loop.frameIndexAt(0.78), 1);
	assert.equal(loop.frameIndexAt(0.85), 0, 'the third of a second of frames has run out');
});

test('a non-looping animation that has run out holds its last frame', () => {
	const once = new Animation(
		[
			{ texture: white, duration: 0.1 },
			{ texture: empty, duration: 0.1 },
		],
		{
			fps: 10,
			loop: false,
		},
	);

	assert.equal(once.frameIndexAt(0.5), 1);
	assert.equal(once.frameIndexAt(600), 1, 'and does not run off the end, however long it waits');
	assert.equal(once.frameAt(600).texture, empty);
});

test('a frame reports the pixels it is drawn away from the sprite', () => {
	const recoil = new Animation(
		[
			{ texture: white, offsetX: 0, offsetY: 0 },
			{ texture: empty, offsetX: 3, offsetY: -4 },
		],
		{ fps: 10 },
	);

	assert.deepEqual(recoil.frameAt(0.05), { texture: white, offsetX: 0, offsetY: 0 });
	assert.equal(recoil.frameAt(0.15).offsetX, 3);
	assert.equal(recoil.frameAt(0.15).offsetY, -4);
});

test('an animation refuses nonsense rather than dividing by it', () => {
	assert.throws(() => new Animation([]), /at least one frame/);
	assert.throws(() => new Animation([white], { fps: 0 }), /positive fps/);
	assert.throws(() => new Animation([white], { fps: -10 }), /positive fps/);
});

test('the sprite keeps whatever texture was handed to it, and the caller still owns its position', () => {
	// `new AnimatedSprite(texture)` is how callers build one, and a per-frame offset must not
	// take the position over: the sprite reports the offset and the caller adds it
	const hero = new AnimatedSprite(white);
	hero.add(
		'thrust',
		[
			{ texture: white, duration: 0.4 },
			{ texture: empty, duration: 0.1, offsetX: 3, offsetY: -2 },
		],
		{ fps: 10 },
	);
	hero.position.set(100, 200);

	hero.play('thrust');
	assert.equal(hero.frameOffset.x, 0, 'the first frame sits where the sprite is');
	assert.equal(hero.texture, white);

	hero.update(0.45);
	assert.equal(hero.frameOffset.x, 3, 'the lunge is reported');
	assert.equal(hero.frameOffset.y, -2);
	assert.equal(hero.texture, empty);
	assert.equal(hero.x, 100, 'and the position is still exactly where the caller put it');
	assert.equal(hero.y, 200);
	assert.equal(hero.elapsedTime, 0.45);
});

test('a non-looping animation finishes once, on the frame that ends it', () => {
	const hero = new AnimatedSprite();
	let finished = 0;
	hero.onFinish = () => finished++;
	hero.add(
		'die',
		[
			{ texture: white, duration: 0.2 },
			{ texture: empty, duration: 0.1 },
		],
		{ loop: false },
	);

	hero.play('die');
	hero.update(0.2);
	assert.equal(hero.isFinished, false, 'the second frame is still playing');

	hero.update(0.1);
	assert.equal(hero.isFinished, true, 'the moment its own duration is up');
	assert.equal(finished, 1);

	hero.update(1);
	assert.equal(finished, 1, 'and it does not fire again');
	assert.equal(hero.texture, empty, 'the last frame is the one left standing');
});

test('a long frame lands on the right frame instead of catching up through each one', () => {
	const ten = new Animation(
		Array.from({ length: 10 }, () => ({ texture: white, duration: 0.1 })),
		{ fps: 10, loop: false },
	);
	const sprite = new AnimatedSprite();
	sprite.add('run', ten.frames, { fps: 10, loop: false });

	sprite.play('run');
	sprite.update(0.95); // one frame lasting almost the whole animation

	assert.equal(sprite.texture, white);
	assert.equal(sprite.isFinished, false, 'nine and a half frames in, one frame is still to come');

	sprite.update(0.05);
	assert.equal(sprite.isFinished, true, 'and the tenth frame ends it');
});
