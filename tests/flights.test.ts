import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sprite, Texture } from 'pixi.js';

import { Flights } from '../src/two-d/render/Flights.ts';

/**
 * P34: the scene-level flight manager over `Projectile`. Sprites are `{ x, y }`
 * doubles and textures are bare `new Texture()`s (both construct headless, the way
 * `projectile.test.ts` already works), so progress, callback ordering, ownership
 * and cleanup are all tested without a renderer.
 */

test('a flight tweens its sprite, then arrives once and leaves the list', () => {
	const flights = new Flights();
	const bolt = { x: 0, y: 0 };
	let arrivals = 0;
	const flight = flights.add(
		bolt,
		{ x: 0, y: 0 },
		{ x: 200, y: 0 },
		{
			speed: 400,
			onArrive: () => {
				arrivals++;
			},
		},
	);

	assert.equal(flights.count, 1);
	assert.equal(flight.done, false);
	flights.update(0.25);
	assert.equal(bolt.x, 100, 'halfway at half the duration');
	assert.equal(arrivals, 0);

	flights.update(0.25);
	assert.equal(bolt.x, 200);
	assert.equal(arrivals, 1);
	assert.equal(flight.done, true);
	assert.equal(flights.count, 0);

	flights.update(1);
	assert.equal(arrivals, 1, 'arrival dispatches exactly once');
	flights.destroy();
});

test('a zero-length flight resolves on the first update', () => {
	const flights = new Flights();
	let arrivals = 0;
	flights.add(
		{ x: 5, y: 5 },
		{ x: 5, y: 5 },
		{ x: 5, y: 5 },
		{
			onArrive: () => {
				arrivals++;
			},
		},
	);
	flights.update(1 / 60);
	assert.equal(arrivals, 1);
	assert.equal(flights.count, 0);
	flights.destroy();
});

test('cancel forgets the flight without dispatching, and is safe twice', () => {
	const flights = new Flights();
	let arrivals = 0;
	const flight = flights.add(
		{ x: 0, y: 0 },
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{
			duration: 1,
			onArrive: () => {
				arrivals++;
			},
		},
	);
	flight.cancel();
	flight.cancel();
	assert.equal(flights.count, 0);
	assert.equal(flight.done, false);
	assert.equal(arrivals, 0);
	flights.update(10);
	assert.equal(arrivals, 0);
	flights.destroy();
});

test('clear drops every flight without dispatching arrivals', () => {
	const flights = new Flights();
	let arrivals = 0;
	const onArrive = () => {
		arrivals++;
	};
	flights.add({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 1, onArrive });
	flights.add({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 1, onArrive });
	assert.equal(flights.count, 2);
	flights.clear();
	assert.equal(flights.count, 0);
	flights.update(10);
	assert.equal(arrivals, 0);
	flights.destroy();
});

test('spin rotates and fadeIn ramps alpha from zero to the launch value', () => {
	const flights = new Flights();
	const bolt = { x: 0, y: 0, alpha: 0.8, rotation: 0 };
	flights.add(bolt, { x: 0, y: 0 }, { x: 100, y: 0 }, { duration: 10, spin: Math.PI, fadeIn: 0.5 });
	assert.equal(bolt.alpha, 0, 'the fade starts from zero even with a launch alpha');

	flights.update(0.25);
	assert.ok(Math.abs((bolt.rotation ?? 0) - Math.PI / 4) < 1e-9);
	assert.ok(Math.abs((bolt.alpha ?? 0) - 0.4) < 1e-9);

	flights.update(0.25);
	assert.ok(Math.abs((bolt.alpha ?? 0) - 0.8) < 1e-9, 'the fade lands on the launch alpha, not 1');
	flights.destroy();
});

test('tint applies once at launch when the sprite takes one', () => {
	const flights = new Flights();
	const tinted = { x: 0, y: 0, tint: 0xffffff };
	const plain = { x: 0, y: 0 };
	flights.add(tinted, { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 1, tint: 0xff0000 });
	flights.add(plain, { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 1, tint: 0xff0000 });
	assert.equal(tinted.tint, 0xff0000);
	assert.equal('tint' in plain, false, 'a tintless double gains no tint slot');
	flights.destroy();
});

test('a texture builds a manager sprite that is parented and destroyed with the flight', () => {
	const flights = new Flights();
	const flight = flights.add(new Texture(), { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 0.1 });
	assert.equal(flights.children.length, 1, 'a manager-built sprite is parented here');

	const built = flights.children[0] as Sprite;
	flights.update(0.1);
	assert.equal(flight.done, true);
	assert.equal(flights.children.length, 0, 'arrival removes it');
	assert.equal(built.destroyed, true, 'arrival destroys it');
	flights.destroy();
});

test('a caller sprite is never destroyed, on arrival or on clear', () => {
	const flights = new Flights();
	const kept = new Sprite();
	flights.add(kept, { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 0.1 });
	assert.equal(flights.children.length, 0, 'a caller sprite is never reparented');
	flights.update(0.1);
	assert.equal(kept.destroyed, false);

	flights.add(kept, { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 10 });
	flights.clear();
	assert.equal(kept.destroyed, false, 'clear forgets without destroying caller art');
	flights.destroy();
	assert.equal(kept.destroyed, false);
	kept.destroy();
});

test('an arrival that launches another flight cannot disturb the iteration', () => {
	const flights = new Flights();
	const order: string[] = [];
	flights.add(
		{ x: 0, y: 0 },
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{
			duration: 0.1,
			onArrive: () => {
				order.push('first');
				flights.add(
					{ x: 0, y: 0 },
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{
						duration: 0.1,
						onArrive: () => {
							order.push('second');
						},
					},
				);
			},
		},
	);
	flights.update(0.1);
	assert.deepEqual(order, ['first']);
	assert.equal(flights.count, 1);
	flights.update(0.1);
	assert.deepEqual(order, ['first', 'second']);
	assert.equal(flights.count, 0);
	flights.destroy();
});

test('destroying the manager clears manager-built sprites first', () => {
	const flights = new Flights();
	flights.add(new Texture(), { x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 10 });
	assert.equal(flights.children.length, 1);
	flights.destroy();
	assert.equal(flights.count, 0);
	assert.equal(flights.destroyed, true);
});
