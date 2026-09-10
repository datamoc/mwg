import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	motionDuration,
	prefersReducedMotion,
	reducedMotion,
	setReducedMotion,
	watchReducedMotion,
} from '../src/core/Motion.ts';
import { Tweener } from '../src/core/Tween.ts';
import { Camera } from '../src/two-d/render/Camera.ts';
import { ParticleEmitter } from '../src/two-d/render/Particles.ts';
import { ScreenEffects } from '../src/two-d/render/ScreenEffects.ts';
import { FloatingText } from '../src/two-d/ui/FloatingText.ts';

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

test('watchReducedMotion reports a change, and stops after its unsubscribe', () => {
	const seen: boolean[] = [];
	const stop = watchReducedMotion((reduced) => seen.push(reduced));
	try {
		setReducedMotion(true);
		setReducedMotion(false);
		assert.deepEqual(seen, [true, false]);

		stop();
		setReducedMotion(true);
		assert.deepEqual(seen, [true, false], 'nothing after unsubscribing');
	} finally {
		setReducedMotion(null);
	}
});

test('decorative motion collapses under reduced motion, meaningful motion only shortens', () => {
	setReducedMotion(true);
	try {
		assert.equal(motionDuration(1), 0, 'decorative is the default');
		assert.equal(motionDuration(1, 'decorative'), 0);

		const shortened = motionDuration(1, 'meaningful');
		assert.ok(shortened > 0 && shortened < 1, `meaningful stayed ${shortened}`);
		assert.equal(motionDuration(0.05, 'meaningful'), 0.05, 'a short motion is never lengthened');
	} finally {
		setReducedMotion(null);
	}

	assert.equal(motionDuration(1), 1, 'and the policy is a no-op while the preference is off');
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

test('reduced motion completes a decorative tween at once rather than waiting', async () => {
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

test('a meaningful tween is shortened under reduced motion, not cut', async () => {
	setReducedMotion(true);
	try {
		const tweener = new Tweener();
		const seen: number[] = [];
		const done = tweener.tween(1, (t) => seen.push(t), { intent: 'meaningful' });

		//half the shortened duration, so this only passes if it actually animates
		tweener.update(0.06);
		assert.ok(seen.length === 1 && seen[0] > 0 && seen[0] < 1, `progress was ${seen[0]}`);

		tweener.update(0.06);
		await done;
		assert.equal(seen[seen.length - 1], 1);
		assert.equal(tweener.isBusy, false);
	} finally {
		setReducedMotion(null);
	}
});

test('an alternate replaces a trigger under reduced motion', async () => {
	setReducedMotion(true);
	try {
		const tweener = new Tweener();
		const slid: number[] = [];
		const faded: number[] = [];
		const done = tweener.tween(1, (t) => slid.push(t), { alternate: (t) => faded.push(t) });

		tweener.update(0.06);
		tweener.update(0.06);
		await done;

		assert.deepEqual(slid, [], 'the sliding version never ran');
		assert.ok(faded.length >= 2 && faded[faded.length - 1] === 1, `fade ran ${faded.length} times`);
	} finally {
		setReducedMotion(null);
	}
});

test('an alternate is ignored while the preference is off', () => {
	setReducedMotion(false);
	try {
		const tweener = new Tweener();
		const slid: number[] = [];
		const faded: number[] = [];
		void tweener.tween(1, (t) => slid.push(t), { alternate: (t) => faded.push(t) });

		assert.equal(tweener.isBusy, true);
		assert.deepEqual(faded, []);
		tweener.update(1);
		assert.equal(slid.length, 1);
	} finally {
		setReducedMotion(null);
	}
});

test('a decorative tween already running finishes at once if the preference appears', () => {
	setReducedMotion(false);
	try {
		const tweener = new Tweener();
		let progress = -1;
		void tweener.tween(1, (t) => (progress = t));
		tweener.update(0.2);
		assert.ok(progress > 0 && progress < 1, `mid-tween progress was ${progress}`);

		setReducedMotion(true);
		tweener.update(0);
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

test('a burst already in flight stops travelling if the preference appears', () => {
	setReducedMotion(false);
	try {
		const emitter = new ParticleEmitter({ max: 4, speed: 100, spin: 3, life: 10 });
		emitter.burst(1);
		emitter.update(0.1);

		const particle = emitter.particles.find((candidate) => candidate.active)!;
		assert.ok(Math.abs(particle.vx) > 0, 'it was moving before the change');

		setReducedMotion(true);
		emitter.update(0.1);
		assert.ok(particle.vx === 0 && particle.vy === 0 && particle.spin === 0);

		const stoppedAt = particle.x;
		emitter.update(0.1);
		assert.equal(particle.x, stoppedAt, 'and it stays where it stopped');
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

test('a fade already running is finished if the preference appears', () => {
	setReducedMotion(false);
	try {
		const effects = new ScreenEffects({ width: 100, height: 100 });
		effects.fadeOut(1);
		effects.update(0.1);
		assert.equal(effects.isBusy, true, 'still fading');

		setReducedMotion(true);
		assert.equal(effects.update(1 / 60), true, 'the frame it completes');
		assert.equal(effects.isBusy, false);
		assert.equal(effects.washAlpha, 1);
	} finally {
		setReducedMotion(null);
	}
});

test('reduced motion keeps the floating text fade and drops its rise', () => {
	setReducedMotion(true);
	try {
		const popup = new FloatingText({ text: '+1', duration: 1, rise: 24 });
		popup.update(0.5);

		assert.equal(popup.y, 0, 'it did not rise');
		assert.equal(popup.alpha, 0.5, 'but it is still fading out');
	} finally {
		setReducedMotion(null);
	}
});

test('without reduced motion the floating text rises as it fades', () => {
	setReducedMotion(false);
	try {
		const popup = new FloatingText({ text: '+1', duration: 1, rise: 24 });
		popup.update(0.5);

		assert.equal(popup.y, -12);
		assert.equal(popup.alpha, 0.5);
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

test('reduced motion cuts the camera to its follow target instead of easing', () => {
	setReducedMotion(true);
	try {
		const camera = new Camera({ zoom: 1 });
		camera.setViewport(20, 20);
		camera.snapTo(0, 0);
		camera.follow({ x: 100, y: 100 });
		camera.update(1 / 60);

		assert.equal(camera.x, 100);
		assert.equal(camera.y, 100);
	} finally {
		setReducedMotion(null);
	}
});

test('without reduced motion the camera eases towards its follow target', () => {
	setReducedMotion(false);
	try {
		const camera = new Camera({ zoom: 1 });
		camera.setViewport(20, 20);
		camera.snapTo(0, 0);
		camera.follow({ x: 100, y: 100 });
		camera.update(1 / 60);

		assert.ok(camera.x > 0 && camera.x < 100, `camera.x was ${camera.x}`);
		assert.equal(camera.x, camera.y);
	} finally {
		setReducedMotion(null);
	}
});
