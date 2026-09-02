import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Projectile } from '../src/render/Projectile.ts';

test('a projectile starts at "from" and reaches exactly "to"', () => {
	const sprite = { x: 0, y: 0 };
	const p = new Projectile(sprite, { x: 0, y: 0 }, { x: 100, y: 0 }, { speed: 100 });

	assert.equal(sprite.x, 0);

	p.update(0.5);
	assert.equal(sprite.x, 50);
	assert.equal(p.done, false);

	p.update(0.5);
	assert.equal(sprite.x, 100);
	assert.equal(p.done, true);
});

test('update returns true only on the frame it arrives', () => {
	const sprite = { x: 0, y: 0 };
	const p = new Projectile(sprite, { x: 0, y: 0 }, { x: 10, y: 0 }, { speed: 10 });

	assert.equal(p.update(0.5), false);
	assert.equal(p.update(0.5), true);
	assert.equal(p.update(0.5), false); //already arrived, nothing left to signal
});

test('an overlong step does not overshoot the target', () => {
	const sprite = { x: 0, y: 0 };
	const p = new Projectile(sprite, { x: 0, y: 0 }, { x: 10, y: 0 }, { speed: 10 });

	p.update(100);
	assert.equal(sprite.x, 10);
	assert.equal(p.progress, 1);
});

test('duration overrides speed when both are given', () => {
	const sprite = { x: 0, y: 0 };
	const p = new Projectile(sprite, { x: 0, y: 0 }, { x: 100, y: 0 }, { speed: 1, duration: 2 });

	p.update(1);
	assert.equal(sprite.x, 50);
	assert.equal(p.done, false);
});

test('a zero-length flight resolves on the first update rather than hanging', () => {
	const sprite = { x: 5, y: 5 };
	const p = new Projectile(sprite, { x: 5, y: 5 }, { x: 5, y: 5 }, { speed: 400 });

	assert.equal(p.update(0.016), true);
	assert.equal(sprite.x, 5);
	assert.equal(sprite.y, 5);
});

test('a diagonal flight moves both axes together, arriving at the same time', () => {
	const sprite = { x: 0, y: 0 };
	const p = new Projectile(sprite, { x: 0, y: 0 }, { x: 30, y: 40 }, { speed: 50 }); // 3-4-5 triangle, distance 50

	p.update(0.5);
	assert.equal(sprite.x, 15);
	assert.equal(sprite.y, 20);
	assert.equal(p.done, false);

	p.update(0.5);
	assert.equal(sprite.x, 30);
	assert.equal(sprite.y, 40);
	assert.equal(p.done, true);
});
