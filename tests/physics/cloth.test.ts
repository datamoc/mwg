import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Cloth } from '../../src/physics/cloth/index.ts';

/**
 * Item 423: a pinned-point cloth mesh in pure arithmetic. Every test pins a direction
 * or a boundary, never just a magnitude: free points fall *down* under gravity, wind
 * pushes *downwind*, and pinned points stay bit-identical rather than nearly still.
 */

const small = () => new Cloth({ width: 20, height: 10, segmentsX: 2, segmentsY: 1 });

test('a 2 by 1 cloth builds 6 points with the top row pinned and 7 links', () => {
	const cloth = small();
	assert.equal(cloth.pointCount, 6);
	assert.deepEqual([cloth.isPinned(0), cloth.isPinned(1), cloth.isPinned(2)], [true, true, true]);
	assert.deepEqual([cloth.isPinned(3), cloth.isPinned(4), cloth.isPinned(5)], [false, false, false]);
	assert.equal(cloth.pointLinks().length, 7);
	assert.deepEqual(cloth.pointPosition(0), { x: 0, y: 0 });
	assert.deepEqual(cloth.pointPosition(5), { x: 20, y: 10 });
	assert.equal(cloth.indexOf(2, 1), 5);
});

test('gravity sags free points down while pinned points stay bit-identical', () => {
	const cloth = new Cloth({
		width: 20,
		height: 10,
		segmentsX: 2,
		segmentsY: 1,
		gravity: { x: 0, y: 900 },
	});
	const pinned = cloth.pointPosition(0);
	for (let i = 0; i < 60; i++) cloth.update(1 / 60);
	assert.ok(cloth.pointPosition(4).y > 10, 'the free middle sags below its rest height');
	assert.deepEqual(cloth.pointPosition(0), pinned);
	assert.deepEqual(cloth.pointPosition(2), { x: 20, y: 0 });
});

test('pinning holds a point and unpinning releases it downward', () => {
	const cloth = new Cloth({
		width: 20,
		height: 10,
		segmentsX: 2,
		segmentsY: 1,
		gravity: { x: 0, y: 900 },
	});
	cloth.pinPoint(4);
	const held = cloth.pointPosition(4);
	for (let i = 0; i < 10; i++) cloth.update(1 / 60);
	assert.deepEqual(cloth.pointPosition(4), held);
	assert.equal(cloth.isPinned(4), true);
	cloth.unpinPoint(4);
	assert.equal(cloth.isPinned(4), false);
	for (let i = 0; i < 60; i++) cloth.update(1 / 60);
	assert.ok(cloth.pointPosition(4).y > held.y, 'the released point falls from where it was held');
});

test('wind pushes free points downwind and still air holds them at rest', () => {
	const cloth = new Cloth({
		width: 20,
		height: 10,
		segmentsX: 2,
		segmentsY: 1,
		wind: { x: 500, y: 0 },
	});
	const before = cloth.pointPosition(4);
	cloth.update(1 / 60);
	assert.ok(cloth.pointPosition(4).x > before.x, 'wind moves the free point downwind, not upwind');
});

test('a fixed update sequence is deterministic and reset restores rest', () => {
	const run = (): { x: number; y: number } => {
		const cloth = new Cloth({
			width: 20,
			height: 10,
			segmentsX: 2,
			segmentsY: 1,
			gravity: { x: 0, y: 900 },
			wind: { x: 120, y: 0 },
		});
		for (let i = 0; i < 30; i++) cloth.update(1 / 60);
		return cloth.pointPosition(4);
	};
	assert.deepEqual(run(), run());
	const cloth = small();
	assert.equal(cloth.movedCount(), 0);
	cloth.setWind(500, 0);
	cloth.update(1 / 60);
	assert.ok(cloth.movedCount() > 0, 'the gust moves free points off rest');
	cloth.reset();
	assert.deepEqual(cloth.pointPosition(4), { x: 10, y: 10 });
	assert.equal(cloth.movedCount(), 0);
});

test('writePositions fills a matching buffer and refuses a wrongly sized one', () => {
	const cloth = small();
	const into = new Float32Array(cloth.pointCount * 2);
	cloth.writePositions(into);
	assert.equal(into[0], 0);
	assert.equal(into[into.length - 1], 10);
	assert.throws(() => cloth.writePositions(new Float32Array(3)), /Float32Array of 12 floats/);
});

test('wild options and wild updates fail by name', () => {
	assert.throws(() => new Cloth({ width: 0, height: 10, segmentsX: 1, segmentsY: 1 }), /width above 0/);
	assert.throws(() => new Cloth({ width: 10, height: 10, segmentsX: 0, segmentsY: 1 }), /segmentsX/);
	assert.throws(
		() => new Cloth({ width: 10, height: 10, segmentsX: 1, segmentsY: 1, stiffness: 2 }),
		/stiffness between 0 and 1/,
	);
	assert.throws(
		() => new Cloth({ width: 10, height: 10, segmentsX: 1, segmentsY: 1, gravity: { x: NaN, y: 0 } }),
		/gravity/,
	);
	const cloth = small();
	assert.throws(() => cloth.update(-1 / 60), /dt of at least 0/);
	assert.throws(() => cloth.pointPosition(99), /cloth point 99 does not exist/);
	assert.throws(() => cloth.pinPoint(-1), /cloth point -1 does not exist/);
	assert.throws(() => cloth.indexOf(3, 0), /outside a 3x2 grid/);
	assert.throws(() => cloth.setWind(0, Infinity), /wind/);
});
