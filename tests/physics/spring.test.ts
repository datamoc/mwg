import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { Spring } from '../../src/physics/spring/index.ts';
import { setReducedMotion } from '../../src/core/Motion.ts';

/**
 * Item 424: a damped chase spring in pure arithmetic. Direction first, then the
 * boundary: a displaced bob moves *toward* its anchor (never away), and settles
 * *inside* a tolerance rather than merely slowing down.
 */

afterEach(() => setReducedMotion(null));

const settle = (spring: Spring, seconds = 4): void => {
	for (let t = 0; t < seconds; t += 1 / 60) spring.update(1 / 60);
};

test('a displaced bob moves toward its anchor on the first step', () => {
	const spring = new Spring({ stiffness: 120, damping: 8 });
	spring.setAnchor(10, 0);
	const start = spring.position.x;
	spring.update(1 / 60);
	assert.ok(spring.position.x > start, 'the bob chases the anchor, it never retreats');
	assert.deepEqual(spring.offset(), { x: spring.position.x - 10, y: 0 });
});

test('damping settles the bob at its anchor inside a tolerance', () => {
	const spring = new Spring({ stiffness: 120, damping: 8 });
	spring.setAnchor(10, 0);
	settle(spring);
	assert.ok(spring.settled(0.01), `lag ${spring.length()} exceeds the tolerance`);
	assert.ok(spring.length() <= 0.01, 'the bob rests at its anchor within the tolerance');
});

test('a stiffer spring covers more ground in the first steps', () => {
	const soft = new Spring({ stiffness: 30, damping: 4 });
	const stiff = new Spring({ stiffness: 300, damping: 4 });
	soft.setAnchor(10, 0);
	stiff.setAnchor(10, 0);
	for (let i = 0; i < 3; i++) {
		soft.update(1 / 60);
		stiff.update(1 / 60);
	}
	assert.ok(stiff.position.x > soft.position.x, 'stiffness hurries the chase, it never slows it');
});

test('an undamped spring keeps swinging instead of settling', () => {
	const spring = new Spring({ stiffness: 120, damping: 0 });
	spring.displace(10, 0);
	let widest = 0;
	for (let t = 0; t < 2; t += 1 / 60) {
		spring.update(1 / 60);
		widest = Math.max(widest, spring.length());
	}
	assert.ok(widest > 5, 'with no damping the swing never dies down');
	assert.equal(spring.settled(0.01), false);
});

test('displace shoves the bob, snap parks it, place moves a follower', () => {
	const spring = new Spring({ stiffness: 120, damping: 8 });
	spring.displace(4, -3);
	assert.deepEqual(spring.offset(), { x: 4, y: -3 });
	spring.snap();
	assert.deepEqual(spring.offset(), { x: 0, y: 0 });
	assert.equal(spring.length(), 0);
	spring.setAnchor(5, 5);
	spring.displace(1, 1);
	const follower = { x: 0, y: 0 };
	spring.place(follower);
	assert.deepEqual(follower, spring.position);
});

test('reduced motion snaps a decorative spring instead of swinging it', () => {
	setReducedMotion(true);
	const spring = new Spring({ stiffness: 120, damping: 8 });
	spring.setAnchor(10, 0);
	spring.update(1 / 60);
	assert.deepEqual(spring.offset(), { x: 0, y: 0 });
});

test('wild options and wild updates fail by name', () => {
	assert.throws(() => new Spring({ stiffness: 0, damping: 1 }), /stiffness above 0/);
	assert.throws(() => new Spring({ stiffness: 10, damping: -1 }), /damping of at least 0/);
	assert.throws(() => new Spring({ stiffness: 10, damping: 1, anchor: { x: NaN, y: 0 } }), /anchor/);
	const spring = new Spring({ stiffness: 10, damping: 1 });
	assert.throws(() => spring.update(-1 / 60), /dt of at least 0/);
	assert.throws(() => spring.settled(-1), /tolerance of at least 0/);
	assert.throws(() => spring.displace(0, Infinity), /displacement/);
});
