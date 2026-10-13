import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PhysicsWorld } from '../src/physics/index.ts';

test('a box falls under gravity and comes to rest on a static floor', () => {
	const world = new PhysicsWorld();
	world.addBox(0, 300, 800, 20, { isStatic: true });
	const crate = world.addBox(0, 100, 40, 40);
	const startY = crate.position.y;
	world.update(0.5);
	assert.ok(crate.position.y > startY, 'it fell');
	for (let i = 0; i < 300; i++) world.update(1 / 60);
	assert.ok(Math.abs(crate.position.y - 270) < 2, `rested on the floor top, at ${crate.position.y}`);
	assert.ok(Math.abs(crate.velocity.y) < 0.1);
});

test('update runs whole fixed steps and keeps the remainder, so the clock is refresh-rate independent', () => {
	const run = (frame: number) => {
		const world = new PhysicsWorld();
		const body = world.addCircle(0, 0, 10);
		for (let t = 0; t < 1 - 1e-9; t += frame) world.update(frame);
		return body.position.y;
	};
	assert.ok(Math.abs(run(1 / 60) - run(1 / 30)) < 1e-6, '60 and 30 frames per second agree');
	assert.equal(new PhysicsWorld().update(1 / 120), 0, 'half a step runs nothing yet');
});

test('a constraint holds a body to a point, and removing it lets the body go', () => {
	const world = new PhysicsWorld();
	const weight = world.addCircle(100, 100, 10);
	const rope = world.addConstraint(weight, { x: 100, y: 0 }, { length: 100 });
	for (let i = 0; i < 120; i++) world.update(1 / 60);
	assert.ok(weight.position.y < 120, `held near the rope length, at ${weight.position.y}`);
	world.remove(rope);
	assert.equal(world.constraints.length, 0);
	for (let i = 0; i < 60; i++) world.update(1 / 60);
	assert.ok(weight.position.y > 200, 'free fall after the cut');
});

test('onContact reports a new contact once', () => {
	const world = new PhysicsWorld();
	world.addBox(0, 100, 200, 20, { isStatic: true, label: 'floor' });
	const ball = world.addCircle(0, 40, 10, { label: 'ball' });
	const seen: string[] = [];
	world.onContact.add(({ a, b }) => void seen.push([a.label, b.label].sort().join('+')));
	for (let i = 0; i < 120; i++) world.update(1 / 60);
	assert.equal(ball.position.y < 100, true);
	assert.ok(seen.includes('ball+floor'));
});

test('a breakable constraint snaps past its maxStretch, once, and onBreak reports it', () => {
	const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
	const anchor = world.addBox(0, 0, 10, 10, { isStatic: true });
	const pulled = world.addCircle(0, 40, 10);
	const beam = world.addConstraint(anchor, pulled, { length: 40, stiffness: 0.1, maxStretch: 0.5 });
	const sturdy = world.addConstraint(anchor, world.addCircle(300, 40, 5), { length: 300 });
	const broken: number[] = [];
	world.onBreak.add(({ constraint, stretch }) => {
		assert.equal(constraint, beam);
		broken.push(stretch);
	});
	pulled.position.y = 55;
	world.update(1 / 60);
	assert.equal(broken.length, 0, '37% stretched: still holding');
	pulled.position.y = 100;
	world.update(1 / 60);
	for (let i = 0; i < 60; i++) world.update(1 / 60);
	assert.equal(broken.length, 1, 'it broke exactly once');
	assert.ok(broken[0] > 0.5, `reported a stretch past the limit, ${broken[0]}`);
	assert.ok(!world.constraints.includes(beam), 'and left the world');
	assert.ok(world.constraints.includes(sturdy), 'a joint with no limit stays');
});

test('a stiff, lightly loaded breakable joint holds, and stretchOf reads the live strain', () => {
	const world = new PhysicsWorld();
	const anchor = world.addBox(0, 0, 10, 10, { isStatic: true });
	const weight = world.addCircle(0, 100, 5);
	const rope = world.addConstraint(anchor, weight, { length: 100, stiffness: 1, maxStretch: 0.5 });
	let breaks = 0;
	world.onBreak.add(() => void breaks++);
	for (let i = 0; i < 240; i++) world.update(1 / 60);
	assert.equal(breaks, 0);
	assert.ok(Math.abs(world.stretchOf(rope)) < 0.1, `strain ${world.stretchOf(rope)}`);
});
