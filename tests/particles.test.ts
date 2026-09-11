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

test('a rect spawn area is centred on the emitter and births inside it', () => {
	Random.push(1);
	try {
		const emitter = new ParticleEmitter({
			max: 200,
			life: 100,
			speed: 0,
			spawn: { shape: 'rect', width: 40, height: 20 },
		});
		emitter.x = 100;
		emitter.y = 50;
		emitter.burst(200);

		let reachX = 0;
		let reachY = 0;
		for (const particle of emitter.particles) {
			const dx = particle.x - 100;
			const dy = particle.y - 50;
			assert.ok(Math.abs(dx) <= 20 + 1e-9, `x ${dx} stays within the half width`);
			assert.ok(Math.abs(dy) <= 10 + 1e-9, `y ${dy} stays within the half height`);
			reachX = Math.max(reachX, Math.abs(dx));
			reachY = Math.max(reachY, Math.abs(dy));
		}
		//not every draw landing at the origin: the spread really uses the area's extent
		assert.ok(reachX > 15, `some birth reached near the x edge (got ${reachX})`);
		assert.ok(reachY > 7, `some birth reached near the y edge (got ${reachY})`);
	} finally {
		Random.pop();
	}
});

test('a rect spawn area defaults its height to its width, so it is a square', () => {
	Random.push(2);
	try {
		const emitter = new ParticleEmitter({ max: 100, life: 100, speed: 0, spawn: { shape: 'rect', width: 30 } });
		emitter.burst(100);
		for (const particle of emitter.particles) {
			assert.ok(Math.abs(particle.x) <= 15 + 1e-9);
			assert.ok(Math.abs(particle.y) <= 15 + 1e-9);
		}
	} finally {
		Random.pop();
	}
});

test('an ellipse spawn area births inside the ellipse, not its bounding box', () => {
	Random.push(3);
	try {
		const emitter = new ParticleEmitter({
			max: 400,
			life: 100,
			speed: 0,
			spawn: { shape: 'ellipse', width: 40, height: 20 },
		});
		emitter.burst(400);

		let reach = 0;
		for (const particle of emitter.particles) {
			const nx = particle.x / 20;
			const ny = particle.y / 10;
			const radius = Math.hypot(nx, ny);
			assert.ok(radius <= 1 + 1e-9, `birth ${radius} stays inside the unit ellipse`);
			reach = Math.max(reach, radius);
		}
		//the sqrt correction fills the ellipse rather than clustering everything at the centre
		assert.ok(reach > 0.9, `some birth reached near the ellipse's edge (got ${reach})`);
	} finally {
		Random.pop();
	}
});

test('a spawn area moves with the emitter, since it is local space', () => {
	Random.push(5);
	try {
		const emitter = new ParticleEmitter({
			max: 50,
			life: 100,
			speed: 0,
			spawn: { shape: 'ellipse', width: 10, height: 10 },
		});
		emitter.x = 200;
		emitter.y = -80;
		emitter.burst(50);
		for (const particle of emitter.particles) {
			assert.ok(Math.hypot(particle.x - 200, particle.y + 80) <= 5 + 1e-9);
		}
	} finally {
		Random.pop();
	}
});

test('the same seed reproduces the same spawn-area births', () => {
	const run = () => {
		Random.push(9);
		try {
			const emitter = new ParticleEmitter({
				max: 32,
				life: 100,
				speed: 0,
				spawn: { shape: 'ellipse', width: 12, height: 6 },
			});
			emitter.burst(32);
			return emitter.particles.map((p) => ({ x: p.x, y: p.y }));
		} finally {
			Random.pop();
		}
	};
	assert.deepEqual(run(), run());
});
