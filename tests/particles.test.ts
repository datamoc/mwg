import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'pixi.js';
import * as Random from '../src/core/Random.ts';
import { ParticleEmitter } from '../src/two-d/render/Particles.ts';

test('a new emitter is idle with nothing alive', () => {
	const emitter = new ParticleEmitter({ max: 10 });
	assert.equal(emitter.activeCount, 0);
	assert.equal(emitter.isEmitting, false);
	assert.equal(emitter.particles.length, 10);
});

test('burst emits exactly what was asked for, up to the pool size', () => {
	const emitter = new ParticleEmitter({ max: 5 });
	assert.equal(emitter.burst(3), 3);
	assert.equal(emitter.activeCount, 3);

	//the pool caps it: two slots left, four asked for
	assert.equal(emitter.burst(4), 2);
	assert.equal(emitter.activeCount, 5);
});

test('a particle dies once its life elapses, and its slot is reused', () => {
	const emitter = new ParticleEmitter({ max: 2, life: 1, speed: 0 });
	emitter.burst(2);
	assert.equal(emitter.activeCount, 2);

	emitter.update(0.5);
	assert.equal(emitter.activeCount, 2);

	emitter.update(0.6);
	assert.equal(emitter.activeCount, 0);

	//the pool never grew, and the freed slots take new particles
	assert.equal(emitter.particles.length, 2);
	assert.equal(emitter.burst(2), 2);
});

test('velocity and gravity integrate into position', () => {
	//angle 0 and a fixed speed make the launch purely horizontal, so the arithmetic is exact
	const emitter = new ParticleEmitter({ max: 1, life: 10, speed: 100, angle: 0, gravity: { x: 0, y: 200 } });
	emitter.burst(1);
	const particle = emitter.particles[0];

	emitter.update(1);
	assert.equal(particle.vx, 100);
	assert.equal(particle.vy, 200);
	assert.equal(particle.x, 100);
	assert.equal(particle.y, 200);
});

test('particles spawn at the emitter origin, wherever it has moved to', () => {
	const emitter = new ParticleEmitter({ max: 1, speed: 0 });
	emitter.x = 40;
	emitter.y = -15;
	emitter.burst(1);
	assert.equal(emitter.particles[0].x, 40);
	assert.equal(emitter.particles[0].y, -15);
});

test('scale and alpha interpolate from birth value to death value across life', () => {
	const emitter = new ParticleEmitter({ max: 1, life: 1, speed: 0, scale: [1, 3], alpha: [1, 0] });
	emitter.burst(1);
	const particle = emitter.particles[0];

	emitter.update(0.5);
	assert.ok(Math.abs(particle.scale - 2) < 1e-9);
	assert.ok(Math.abs(particle.alpha - 0.5) < 1e-9);
});

test('a stopped emitter emits nothing, but lets live particles finish', () => {
	const emitter = new ParticleEmitter({ max: 20, rate: 100, life: 1, speed: 0 });
	emitter.start();
	emitter.update(0.1);
	const alive = emitter.activeCount;
	assert.ok(alive > 0);

	emitter.stop();
	emitter.update(0.1);
	assert.equal(emitter.activeCount, alive, 'no new particles after stop');

	emitter.update(2);
	assert.equal(emitter.activeCount, 0, 'the ones already alive still expired');
});

test('rate emits over time, and fractional debt carries between frames rather than being lost', () => {
	const emitter = new ParticleEmitter({ max: 100, rate: 10, life: 100, speed: 0 });
	emitter.start();

	//0.05s at 10/s is half a particle: nothing yet, but the half is banked
	emitter.update(0.05);
	assert.equal(emitter.activeCount, 0);

	emitter.update(0.05);
	assert.equal(emitter.activeCount, 1, 'the two halves became one particle');
});

test('a full pool drops the backlog instead of banking it for a later burst', () => {
	const emitter = new ParticleEmitter({ max: 2, rate: 1000, life: 100, speed: 0 });
	emitter.start();
	emitter.update(1);
	assert.equal(emitter.activeCount, 2);

	//kill everything, then step a tiny amount: a banked backlog would refill instantly
	emitter.clear();
	emitter.update(0.001);
	assert.equal(emitter.activeCount, 1);
});

test('clear kills every live particle at once', () => {
	const emitter = new ParticleEmitter({ max: 8, life: 100, speed: 0 });
	emitter.burst(8);
	emitter.clear();
	assert.equal(emitter.activeCount, 0);
});

test('the same seed produces the same spray, so a replay reproduces it', () => {
	const run = () => {
		Random.push(4);
		try {
			const emitter = new ParticleEmitter({ max: 16, life: [0.5, 1.5], speed: [10, 90], spin: [-1, 1] });
			emitter.burst(16);
			emitter.update(0.25);
			return emitter.particles.map((p) => ({ x: p.x, y: p.y, life: p.life, spin: p.spin }));
		} finally {
			Random.pop();
		}
	};
	assert.deepEqual(run(), run());
});

test('a textureless emitter runs the whole simulation and draws nothing', () => {
	const emitter = new ParticleEmitter({ max: 4, life: 1, speed: 10, angle: 0 });
	emitter.burst(4);
	emitter.update(0.5);
	assert.equal(emitter.activeCount, 4);
	assert.equal(emitter.children.length, 0, 'no sprites were created without a texture');
});

test('a frame sequence is walked by each particle across its own life', () => {
	const frames = [Texture.WHITE, Texture.WHITE, Texture.WHITE, Texture.WHITE];
	const emitter = new ParticleEmitter({ max: 1, life: 1, speed: 0, frames });
	emitter.burst(1);
	const particle = emitter.particles[0];
	assert.equal(particle.frame, 0, 'a particle starts on the first frame');

	emitter.update(0.3);
	assert.equal(particle.frame, 1);
	emitter.update(0.3);
	assert.equal(particle.frame, 2);
	emitter.update(0.3);
	assert.equal(particle.frame, 3);

	//the last frame holds until the particle dies rather than running off the end of the array
	emitter.update(0.05);
	assert.equal(particle.frame, 3);
});

test('a reused pool slot starts its frame sequence over', () => {
	const frames = [Texture.WHITE, Texture.WHITE];
	const emitter = new ParticleEmitter({ max: 1, life: 0.5, speed: 0, frames });
	emitter.burst(1);
	emitter.update(0.4);
	assert.equal(emitter.particles[0].frame, 1);

	emitter.update(0.2); //the particle dies and frees its slot
	assert.equal(emitter.activeCount, 0);
	emitter.burst(1);
	assert.equal(emitter.particles[0].frame, 0);
});

test('without a frame sequence a particle stays on frame zero', () => {
	const emitter = new ParticleEmitter({ max: 1, life: 1, speed: 0 });
	emitter.burst(1);
	emitter.update(0.5);
	assert.equal(emitter.particles[0].frame, 0);
});

test('a frame sequence is what creates the sprites, standing in for texture', () => {
	const emitter = new ParticleEmitter({ max: 2, frames: [Texture.WHITE, Texture.WHITE] });
	assert.equal(emitter.children.length, 2, 'one sprite per pooled particle');
});
