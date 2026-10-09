import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { SpriteMotion, type MotionTarget } from '../src/two-d/render/SpriteMotion.ts';
import { Tweener } from '../src/core/Tween.ts';
import { setReducedMotion } from '../src/core/Motion.ts';

afterEach(() => setReducedMotion(null));

const sprite = (): MotionTarget => ({ x: 10, y: 20, rotation: 0, scale: { x: 2, y: 2 }, skew: { x: 0, y: 0 } });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
const run = (motion: SpriteMotion, seconds: number, dt = 1 / 60) => {
	for (let t = 0; t < seconds; t += dt) motion.update(dt);
};

test('squash widens and shortens at the peak, then returns exactly to rest', async () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	const handle = motion.squash({ amount: 0.5, duration: 1 });
	motion.update(0.5);
	near(s.scale.x, 3);
	near(s.scale.y, 1);
	motion.update(0.5);
	await handle.done;
	assert.deepEqual([s.scale.x, s.scale.y], [2, 2]);
	assert.equal(motion.isBusy, false);
});

test('hop lifts on y only and lands on the rest position', async () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	const handle = motion.hop({ height: 8, duration: 1 });
	motion.update(0.5);
	assert.equal(s.x, 10);
	near(s.y, 12);
	motion.update(0.5);
	await handle.done;
	assert.equal(s.y, 20);
});

test('effects compose, and cancelling one leaves the other running', () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	const hop = motion.hop({ height: 8, duration: 1 });
	motion.squash({ amount: 0.5, duration: 1 });
	motion.update(0.5);
	assert.ok(s.y < 20 && s.scale.x > 2);
	hop.cancel();
	assert.equal(s.y, 20);
	assert.ok(s.scale.x > 2);
	motion.update(0.1);
	assert.equal(s.y, 20, 'the cancelled hop does not write again');
});

test('flip mirrors and composes with a running squash instead of overwriting scale', () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	assert.equal(motion.flip('x'), true);
	assert.equal(s.scale.x, -2);
	motion.squash({ amount: 0.5, duration: 1 });
	motion.update(0.5);
	near(s.scale.x, -3);
	assert.equal(motion.flip('x'), false);
	near(s.scale.x, 3);
});

test('spin turns about the origin and ends where it started', async () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	motion.spin({ turns: 2, duration: 1 }).cancel();
	assert.equal(s.rotation, 0);
	const handle = motion.spin({ turns: 2, duration: 1 });
	motion.update(0.5);
	near(s.rotation, 2 * Math.PI); // eased midpoint of two turns
	motion.update(0.5);
	await handle.done;
	assert.equal(s.rotation, 0);
});

test('wobble settles and shear returns to rest', async () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	const a = motion.wobble({ angle: 0.3, duration: 0.5 });
	const b = motion.shear({ amount: 0.4, duration: 0.5 });
	motion.update(0.25);
	near(s.skew.x, 0.4 * Math.sin(Math.PI / 2));
	run(motion, 0.3);
	await Promise.all([a.done, b.done]);
	assert.equal(s.rotation, 0);
	assert.equal(s.skew.x, 0);
});

test('a looping bob runs until cancelled, then restores the rest position', async () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	const handle = motion.bob({ amplitude: 2, period: 1 });
	motion.update(0.25);
	near(s.y, 22);
	run(motion, 5);
	assert.equal(motion.isBusy, true);
	handle.cancel();
	assert.equal(s.y, 20);
	assert.equal(motion.isBusy, false);
	await handle.done;
});

test('a finite bob plays its cycles and ends at rest', async () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	const handle = motion.bob({ amplitude: 2, period: 0.5, cycles: 2 });
	run(motion, 1.1);
	await handle.done;
	assert.equal(s.y, 20);
});

test('reduced motion collapses decorative effects and freezes a looping bob', async () => {
	setReducedMotion(true);
	const s = sprite();
	const motion = new SpriteMotion(s);
	await motion.squash({ amount: 0.5, duration: 1 }).done;
	assert.deepEqual([s.scale.x, s.scale.y], [2, 2]);
	motion.bob({ amplitude: 2, period: 1 });
	motion.update(0.25);
	assert.equal(s.y, 20);
});

test('meaningful intent still plays under reduced motion', () => {
	setReducedMotion(true);
	const s = sprite();
	const motion = new SpriteMotion(s, { intent: 'meaningful' });
	motion.hop({ height: 8, duration: 1 });
	assert.equal(motion.isBusy, true);
});

test('destroy restores the rest pose, flips included, and later effects are inert', async () => {
	const s = sprite();
	const motion = new SpriteMotion(s);
	motion.flip('y');
	motion.hop({ height: 8, duration: 1 });
	motion.update(0.5);
	motion.destroy();
	assert.deepEqual([s.x, s.y, s.rotation, s.scale.x, s.scale.y, s.skew.x], [10, 20, 0, 2, 2, 0]);
	await motion.hop({ height: 8, duration: 1 }).done;
	assert.equal(s.y, 20);
});

test('a shared tweener is driven by its owner, not by update()', () => {
	const s = sprite();
	const tweener = new Tweener();
	const motion = new SpriteMotion(s, { tweener });
	motion.hop({ height: 8, duration: 1 });
	motion.update(0.5);
	assert.equal(s.y, 20);
	tweener.update(0.5);
	near(s.y, 12);
});
