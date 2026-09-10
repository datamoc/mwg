import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prefersReducedMotion, reducedMotion, setReducedMotion } from '../src/core/Motion.ts';
import { Tweener } from '../src/core/Tween.ts';
import { Camera } from '../src/two-d/render/Camera.ts';
import { ParticleEmitter } from '../src/two-d/render/Particles.ts';
import { ScreenEffects } from '../src/two-d/render/ScreenEffects.ts';

/**
 * Reduced motion is global state, so every test that turns it on turns it back off in a
 * `finally` - otherwise a later file's tween or emitter would silently take the reduced path.
 */

test('with no browser preference, motion is not reduced', () => {
	assert.equal(prefersReducedMotion(), false, 'Node exposes no matchMedia');
	assert.equal(reducedMotion(), false);
});

test('an override wins until it is cleared', () => {
	try {
		setReducedMotion(true);
		assert.equal(reducedMotion(), true);
		setReducedMotion(false);
		assert.equal(reducedMotion(), false, 'explicit false beats the OS preference');
	} finally {
		setReducedMotion(null);
	}
	assert.equal(reducedMotion(), prefersReducedMotion(), 'null follows the OS again');
});

test('without reduced motion a tween still takes its duration', () => {
	setReducedMotion(false);
	try {
		const tweener = new Tweener();
		let progress = -1;
		void tweener.tween(1, (t) => (progress = t));

		tweener.update(0.5);
		assert.equal(progress, 0.5);
		assert.equal(tweener.isBusy, true);
	} finally {
		setReducedMotion(null);
	}
});

test('reduced motion completes a tween at once rather than waiting', async () => {
	setReducedMotion(true);
	try {
		const tweener = new Tweener();
		let progress = -1;
		await tweener.tween(1, (t) => (progress = t));

		assert.equal(progress, 1);
		assert.equal(tweener.isBusy, false);
	} finally {
		setReducedMotion(null);
	}
});

test('reduced motion drops particle travel and spin but keeps the puff', () => {
	setReducedMotion(true);
	try {
		const emitter = new ParticleEmitter({ max: 4, speed: 100, spin: 3, life: 1 });
		assert.equal(emitter.burst(1), 1);

		const particle = emitter.particles.find((candidate) => candidate.active)!;
		//=== rather than assert.equal: a zeroed velocity is -0 in some directions
		assert.ok(particle.vx === 0, `vx ${particle.vx}`);
		assert.ok(particle.vy === 0, `vy ${particle.vy}`);
		assert.ok(particle.spin === 0, `spin ${particle.spin}`);
	} finally {
		setReducedMotion(null);
	}
});

test('without reduced motion particles still travel', () => {
	setReducedMotion(false);
	try {
		const emitter = new ParticleEmitter({ max: 4, speed: 100, spin: 3, life: 1 });
		emitter.burst(1);

		const particle = emitter.particles.find((candidate) => candidate.active)!;
		assert.ok(Math.abs(Math.hypot(particle.vx, particle.vy) - 100) < 1e-9);
		assert.equal(particle.spin, 3);
	} finally {
		setReducedMotion(null);
	}
});

test('reduced motion turns a fade into an instant cut', () => {
	setReducedMotion(true);
	try {
		const effects = new ScreenEffects({ width: 100, height: 100 });
		effects.fadeOut(1);

		assert.equal(effects.isBusy, false, 'the fade already finished');
		assert.equal(effects.washAlpha, 1, 'fully covered, the end state');
	} finally {
		setReducedMotion(null);
	}
});

test('reduced motion drops screen shake', () => {
	setReducedMotion(true);
	try {
		const camera = new Camera({ zoom: 1 });
		camera.setViewport(20, 20);
		camera.snapTo(50, 50);
		const before = { x: camera.world.x, y: camera.world.y };

		camera.shake(10, 1);
		camera.update(0.5);

		assert.equal(camera.world.x, before.x);
		assert.equal(camera.world.y, before.y);
	} finally {
		setReducedMotion(null);
	}
});
