import { test } from 'node:test';
import assert from 'node:assert/strict';

import { XpbdWorld } from '../src/physics/xpbd.ts';

function rope(strength: number | undefined, mass = 1) {
	const world = new XpbdWorld();
	const wall = world.addNode({ x: 0, y: 0, fixed: true });
	const weight = world.addNode({ x: 0, y: 40, mass });
	const link = world.addLink({ a: wall, b: weight, stiffness: 2e4, strength });
	return { world, wall, weight, link };
}

test('a rope holds a weight within its strength and reports the load it carries', () => {
	const { world, weight, link } = rope(900);
	world.breaking = true;
	for (let i = 0; i < 180; i++) world.step();
	assert.equal(world.links[link].broken, false);
	assert.ok(Math.abs(world.links[link].force - 520) < 40, `carries about m*g, ${world.links[link].force}`);
	assert.ok(world.links[link].ratio > 0.4 && world.links[link].ratio < 0.8, `ratio ${world.links[link].ratio}`);
	assert.ok(Math.abs(world.nodes[weight].y - 40) < 3, 'stays near its rest length');
	assert.equal(world.peakRatio, world.links[link].ratio);
});

test('a rope past its strength breaks once, reports where, and lets the weight fall', () => {
	const { world, weight, link } = rope(300);
	const events: { link: number; x: number; y: number }[] = [];
	world.onBreak.add((event) => void events.push(event));
	world.breaking = true;
	for (let i = 0; i < 180; i++) world.step();
	assert.equal(events.length, 1);
	assert.equal(events[0].link, link);
	assert.ok(Math.abs(events[0].x) < 1 && events[0].y > 15 && events[0].y < 60);
	assert.equal(world.links[link].broken, true);
	assert.ok(world.nodes[weight].y > 200, 'in free fall once cut');
});

test('nothing breaks while breaking is off, so a structure can settle first', () => {
	const { world, link } = rope(300);
	for (let i = 0; i < 120; i++) world.step();
	assert.equal(world.links[link].broken, false);
	assert.ok(world.links[link].ratio > 1, 'it is overloaded, just not allowed to break yet');
});

test('the same structure and calls give bit-identical results', () => {
	const run = () => {
		const { world, weight } = rope(undefined);
		const side = world.addNode({ x: 40, y: 40, mass: 2 });
		world.addLink({ a: weight, b: side, stiffness: 5e3 });
		for (let i = 0; i < 90; i++) world.step();
		return JSON.stringify(world.nodes);
	};
	assert.equal(run(), run());
});

test('a cable pulls when stretched and goes slack when compressed, a rod pushes back', () => {
	const build = (tensionOnly: boolean) => {
		const world = new XpbdWorld({ gravity: 0 });
		const a = world.addNode({ x: 0, y: 0, fixed: true });
		const b = world.addNode({ x: 100, y: 0 });
		world.addLink({ a, b, stiffness: 5e3, tensionOnly });
		world.nodes[b].x = 60;
		for (let i = 0; i < 60; i++) world.step();
		return world.nodes[b].x;
	};
	assert.ok(Math.abs(build(true) - 60) < 1, 'a cable lets the node stay compressed');
	assert.ok(build(false) > 90, 'a rod restores its length');
});

test('a fixed node never moves, and link mass is shared between its nodes', () => {
	const world = new XpbdWorld();
	const a = world.addNode({ x: 5, y: 5, fixed: true });
	const b = world.addNode({ x: 5, y: 45, mass: 1 });
	world.addLink({ a, b, stiffness: 1e4, mass: 3 });
	assert.equal(world.nodes[b].w, 1 / 2.5, 'node mass 1 plus half of the link mass 3');
	for (let i = 0; i < 30; i++) world.step();
	assert.deepEqual([world.nodes[a].x, world.nodes[a].y], [5, 5]);
});

test('applyForce acts for one step only', () => {
	const world = new XpbdWorld({ gravity: 0 });
	const node = world.addNode({ x: 0, y: 0, mass: 1 });
	world.applyForce(node, 600, 0);
	world.step();
	const pushed = world.nodes[node].x;
	assert.ok(pushed > 0);
	const before = world.nodes[node].vx;
	world.step();
	assert.ok(world.nodes[node].vx <= before, 'no further push on the second step');
});

test('bad inputs are refused by name', () => {
	const world = new XpbdWorld();
	const a = world.addNode({ x: 0, y: 0 });
	assert.throws(() => world.addNode({ x: 0, y: 0, mass: 0 }), /positive mass/);
	assert.throws(() => world.addLink({ a, b: 9, stiffness: 1 }), /two existing nodes/);
	const b = world.addNode({ x: 0, y: 0 });
	assert.throws(() => world.addLink({ a, b, stiffness: 1 }), /positive rest length/);
	const c = world.addNode({ x: 10, y: 0 });
	assert.throws(() => world.addLink({ a, b: c, stiffness: 0 }), /positive stiffness/);
});

test('a node falls onto flat ground and rests on it, losing sideways speed to friction', () => {
	const world = new XpbdWorld();
	world.ground = 100;
	const node = world.addNode({ x: 0, y: 0, mass: 1 });
	world.nodes[node].vx = 300;
	for (let i = 0; i < 180; i++) world.step();
	assert.ok(Math.abs(world.nodes[node].y - 100) < 0.5, `rests on the ground, y=${world.nodes[node].y}`);
	assert.ok(Math.abs(world.nodes[node].vx) < 1, 'friction stopped its slide');
});

test('ground can be a height function, and a structure stands on it', () => {
	const world = new XpbdWorld();
	world.ground = (x) => 100 + x * 0.1;
	const a = world.addNode({ x: 0, y: 60 });
	const b = world.addNode({ x: 40, y: 60 });
	world.addLink({ a, b, stiffness: 1e4 });
	for (let i = 0; i < 240; i++) world.step();
	for (const index of [a, b]) {
		const node = world.nodes[index];
		assert.ok(node.y <= 100 + node.x * 0.1 + 1e-6, 'never below the slope');
		assert.ok(node.y > 100 + node.x * 0.1 - 3, 'and resting on it');
	}
});
