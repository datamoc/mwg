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

/** the Warren truss from `XpbdWorld`'s documentation, with a cart of `cartMass` at midspan */
function loadBridge(cartMass: number): { sag: number; broken: number; peakLoad: number } {
	const world = new XpbdWorld({ gravity: 520 });
	const spacing = 50;
	const bottom: number[] = [];
	for (let i = 0; i <= 6; i++) bottom.push(world.addNode({ x: i * spacing, y: 0, fixed: i === 0 || i === 6 }));
	const top: number[] = [];
	for (let i = 0; i < 6; i++) top.push(world.addNode({ x: i * spacing + spacing / 2, y: -45 }));
	const beam = (a: number, b: number): void => {
		world.addLink({ a, b, stiffness: 6e4, strength: 16000 });
	};
	for (let i = 0; i < 6; i++) beam(bottom[i], bottom[i + 1]);
	for (let i = 0; i < 5; i++) beam(top[i], top[i + 1]);
	for (let i = 0; i < 6; i++) {
		beam(bottom[i], top[i]);
		beam(top[i], bottom[i + 1]);
	}
	const cart = world.addNode({ x: 150, y: -6, mass: cartMass });
	world.addLink({ a: cart, b: bottom[3], stiffness: 6e4 });
	world.addLink({ a: cart, b: top[2], stiffness: 6e4 });
	world.breaking = true;
	for (let i = 0; i < 360; i++) world.step();
	return {
		sag: Math.max(...bottom.map((node) => world.nodes[node].y)),
		broken: world.links.filter((link) => link.broken).length,
		peakLoad: Math.max(...world.links.map((link) => link.ratio)),
	};
}

test('the documented bridge holds a light cart, breaks under a heavy one, and does both the same way twice', () => {
	const light = loadBridge(2);
	assert.equal(light.broken, 0);
	assert.ok(light.sag > 0 && light.sag < 100, `a small sag, got ${light.sag}`);
	assert.ok(light.peakLoad < 0.7, 'well inside what the beams carry');

	const heavy = loadBridge(20);
	assert.ok(heavy.broken > 0, 'too heavy: beams give way');
	assert.ok(heavy.peakLoad > 1);

	assert.deepEqual(loadBridge(2), light, 'fixed steps and no randomness: the same bridge, the same result');
});

test('breakLink breaks a link on demand, fires onBreak once and ignores a broken link', () => {
	const world = new XpbdWorld<{ material: string }>();
	const wall = world.addNode({ x: 0, y: 0, fixed: true });
	const weight = world.addNode({ x: 40, y: 0 });
	const rope = world.addLink({ a: wall, b: weight, stiffness: 2e4, data: { material: 'wood' } });
	const events: number[] = [];
	world.onBreak.add((e) => {
		events.push(e.link);
	});
	assert.equal(world.links[rope].data?.material, 'wood');
	world.breakLink(rope);
	world.breakLink(rope);
	assert.equal(world.links[rope].broken, true);
	assert.deepEqual(events, [rope]);
});

test('linksInBox and linksNear find unbroken links geometrically', () => {
	const world = new XpbdWorld();
	const a = world.addNode({ x: 0, y: 0, fixed: true });
	const b = world.addNode({ x: 100, y: 0, fixed: true });
	const c = world.addNode({ x: 100, y: 100, fixed: true });
	const flat = world.addLink({ a, b, stiffness: 1e4 });
	const drop = world.addLink({ a: b, b: c, stiffness: 1e4 });
	assert.deepEqual(world.linksInBox(40, -5, 60, 5), [flat]);
	assert.deepEqual(world.linksInBox(90, 40, 110, 60), [drop]);
	assert.deepEqual(world.linksInBox(200, 200, 300, 300), []);
	assert.deepEqual(world.linksNear(50, 8, 10), [flat]);
	assert.deepEqual(world.linksNear(100, 0, 1), [flat, drop]);
	world.breakLink(flat);
	assert.deepEqual(world.linksInBox(40, -5, 60, 5), []);
});

test('hash is equal for two identical runs and differs once the state does', () => {
	const run = (): XpbdWorld => {
		const world = new XpbdWorld();
		const wall = world.addNode({ x: 0, y: 0, fixed: true });
		const weight = world.addNode({ x: 40, y: 0 });
		world.addLink({ a: wall, b: weight, stiffness: 2e4 });
		for (let i = 0; i < 30; i++) world.step();
		return world;
	};
	const first = run();
	assert.equal(first.hash(), run().hash());
	assert.deepEqual(first.snapshot(), run().snapshot());
	first.step();
	assert.notEqual(first.hash(), run().hash());
});

test('snapshot and hash include forces queued for the next step and return detached arrays', () => {
	const world = new XpbdWorld();
	const node = world.addNode({ x: 0, y: 0 });
	const before = world.snapshot();
	const hash = world.hash();
	world.applyForce(node, 5, -10);
	assert.notEqual(world.hash(), hash);
	assert.deepEqual(before.forces, [[0, 0]]);
	assert.deepEqual(world.snapshot().forces, [[5, -10]]);
	world.step();
	assert.deepEqual(world.snapshot().forces, [[0, 0]]);
});
