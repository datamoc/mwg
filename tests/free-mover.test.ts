import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FreeMover } from '../src/rpg/FreeMover.ts';
import type { AnimatedSprite } from '../src/render/AnimatedSprite.ts';

function fakeSprite(known: readonly string[] = ['walk', 'idle']): AnimatedSprite & { played: string[] } {
	const played: string[] = [];
	return {
		x: 0,
		y: 0,
		played,
		update() {},
		has: (name: string) => known.includes(name),
		play(name: string) {
			played.push(name);
		},
	} as unknown as AnimatedSprite & { played: string[] };
}

test('moving updates position along the given direction, scaled by speed and dt', () => {
	const sprite = fakeSprite();
	const mover = new FreeMover(sprite, 0, 0, { speed: 10 });

	mover.move(1, 0, 1); // one full second, straight right
	assert.equal(mover.x, 10);
	assert.equal(mover.y, 0);
});

test('an unnormalized direction is normalized before applying speed', () => {
	const sprite = fakeSprite();
	const mover = new FreeMover(sprite, 0, 0, { speed: 10 });

	mover.move(5, 0, 1); // same direction as (1,0), just a longer vector
	assert.equal(mover.x, 10);
});

test('facing follows the movement direction, in radians', () => {
	const sprite = fakeSprite();
	const mover = new FreeMover(sprite, 0, 0, { speed: 1 });

	mover.move(0, 1, 0.1); // straight down
	assert.ok(Math.abs(mover.facing - Math.PI / 2) < 1e-9);
});

test('stopping (0,0) keeps the last facing rather than resetting it', () => {
	const sprite = fakeSprite();
	const mover = new FreeMover(sprite, 0, 0, { speed: 1 });

	mover.move(1, 0, 0.1);
	const facingWhileMoving = mover.facing;
	mover.move(0, 0, 0.1);

	assert.equal(mover.facing, facingWhileMoving);
	assert.equal(mover.isMoving, false);
});

test('the sprite position always mirrors x/y, in world units with no tile multiplication', () => {
	const sprite = fakeSprite();
	const mover = new FreeMover(sprite, 3, 4, { speed: 10 });

	mover.move(1, 0, 1);
	assert.equal(sprite.x, mover.x);
	assert.equal(sprite.y, mover.y);
});

test('starting to move plays the walk animation once, stopping plays idle', () => {
	const sprite = fakeSprite(['walk', 'idle']);
	const mover = new FreeMover(sprite, 0, 0, {
		speed: 1,
		walkAnimation: () => 'walk',
		idleAnimation: () => 'idle',
	});

	assert.deepEqual(sprite.played, ['idle'], 'idle plays once at construction');

	mover.move(1, 0, 0.1);
	mover.move(1, 0, 0.1);
	assert.deepEqual(sprite.played, ['idle', 'walk'], 'walk should not replay every frame while still moving');

	mover.move(0, 0, 0.1);
	assert.deepEqual(sprite.played, ['idle', 'walk', 'idle']);
});

test('turnTo faces a direction without moving, only while stationary', () => {
	const sprite = fakeSprite();
	const mover = new FreeMover(sprite, 0, 0, { speed: 1 });

	mover.turnTo(0, 1);
	assert.ok(Math.abs(mover.facing - Math.PI / 2) < 1e-9);
	assert.equal(mover.x, 0);
	assert.equal(mover.y, 0);

	mover.move(1, 0, 0.1); // now moving
	mover.turnTo(0, -1); // should be ignored while moving
	assert.notEqual(mover.facing, -Math.PI / 2);
});
