import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'pixi.js';

import { ParticleEmitter } from '../src/two-d/render/Particles.ts';

/**
 * P36: an attached emitter follows its target's position on every tick, so auras,
 * carried lights and burning missiles need no manual reposition pass. Textureless
 * emitters run the whole simulation with no sprites, which is how the follow math
 * is tested here without a renderer.
 */

test('attach syncs position immediately and tracks the target on every update', () => {
	const emitter = new ParticleEmitter({ max: 2, speed: 0 });
	const hero = { x: 100, y: 200 };
	emitter.attach(() => hero);

	assert.equal(emitter.x, 100, 'position is fresh before the first tick');
	assert.equal(emitter.y, 200);

	hero.x = 150;
	emitter.update(1 / 60);
	assert.equal(emitter.particles.length, 2);
	emitter.burst(1);
	assert.equal(emitter.particles[0].x, 150, 'births use the fresh position');
	assert.equal(emitter.particles[0].y, 200);
});

test('offset and re-attach reshape the follow without moving the target', () => {
	const emitter = new ParticleEmitter({ max: 1, speed: 0 });
	const hero = { x: 100, y: 200 };
	emitter.attach(() => hero, { offsetX: 5, offsetY: -10 });
	assert.equal(emitter.x, 105);
	assert.equal(emitter.y, 190);

	const mount = { x: 0, y: 0 };
	emitter.attach(() => mount);
	assert.equal(emitter.x, 0, 'a second attach replaces the first, offsets included');
	assert.equal(emitter.y, 0);
});

test('detach freezes the position and is idempotent', () => {
	const emitter = new ParticleEmitter({ max: 1, speed: 0 });
	const hero = { x: 100, y: 200 };
	emitter.attach(() => hero);
	assert.notEqual(emitter.attachedTo, null);

	emitter.detach();
	assert.equal(emitter.attachedTo, null);
	hero.x = 999;
	emitter.update(1 / 60);
	assert.equal(emitter.x, 100, 'a detached emitter keeps its last position');
	assert.doesNotThrow(() => emitter.detach());
});

test('burst syncs position even with no update since the target moved', () => {
	const emitter = new ParticleEmitter({ max: 1, speed: 0 });
	const hero = { x: 10, y: 10 };
	emitter.attach(() => hero);
	hero.x = 77;
	emitter.burst(1);
	assert.equal(emitter.particles[0].x, 77);
});

test('a false enabled pauses tick emission while live particles finish', () => {
	const emitter = new ParticleEmitter({ max: 10, rate: 10, life: 10, speed: 0 });
	let awake = false;
	emitter.attach(() => ({ x: 0, y: 0 }), { enabled: () => awake });
	emitter.start();

	emitter.update(0.2);
	assert.equal(emitter.activeCount, 0, 'a sleeping target emits nothing');

	awake = true;
	emitter.update(0.2);
	assert.equal(emitter.activeCount, 2);

	awake = false;
	emitter.update(0.1);
	assert.equal(emitter.activeCount, 2, 'particles already alive still finish their lives');
});

test('a live Container target is followed, a destroyed one auto-detaches', () => {
	const emitter = new ParticleEmitter({ max: 1, speed: 0 });
	const ship = new Container();
	ship.position.set(30, 40);
	emitter.attach(ship);
	assert.equal(emitter.x, 30);
	assert.equal(emitter.y, 40);

	ship.position.set(50, 60);
	emitter.update(1 / 60);
	assert.equal(emitter.x, 50);

	ship.destroy();
	emitter.update(1 / 60);
	assert.equal(emitter.attachedTo, null, 'a dead target cannot move again');
	assert.equal(emitter.x, 50, 'the last position is kept');
	assert.equal(emitter.y, 60);
});

test('a visible callback hides the emitter and its in-air particles, drawing only', () => {
	const emitter = new ParticleEmitter({ max: 4, speed: 0, rate: 10, life: 10 });
	const hero = { x: 100, y: 200 };
	let seen = true;
	emitter.attach(() => hero, { visible: () => seen });
	assert.equal(emitter.visible, true, 'the gate is consulted on attach itself');

	emitter.start();
	emitter.update(0.2);
	assert.equal(emitter.activeCount, 2, 'emission keeps following enabled while hidden or not');

	seen = false;
	emitter.update(0.2);
	assert.equal(emitter.visible, false, 'a false return hides the whole spray');
	assert.equal(emitter.activeCount, 4, 'particles still live and step behind the invisibility');

	seen = true;
	emitter.update(0.2);
	assert.equal(emitter.visible, true, 'the gate reopens as soon as it returns true again');
});

test('detach stops consulting the visible hook and cannot strand the emitter hidden', () => {
	const emitter = new ParticleEmitter({ max: 1, speed: 0 });
	const hero = { x: 0, y: 0 };
	let seen = false;
	emitter.attach(() => hero, { visible: () => seen });
	assert.equal(emitter.visible, false);

	emitter.detach();
	assert.equal(emitter.visible, true, 'detach hands visible back');
	emitter.update(1 / 60);
	assert.equal(emitter.visible, true, 'and no tick re-hides it afterwards');

	const plain = new ParticleEmitter({ max: 1, speed: 0 });
	plain.visible = false;
	plain.attach(() => hero);
	plain.detach();
	assert.equal(plain.visible, false, 'an emitter with no visible hook keeps its own flag');
});
