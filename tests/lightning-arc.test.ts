import assert from 'node:assert/strict';
import test from 'node:test';
import { LightningArc } from '../src/two-d/render/LightningArc.ts';

function fixedRandom(...values: number[]): () => number {
	let i = 0;
	return () => values[i++ % values.length];
}

test('points starts and ends exactly at the given endpoints', () => {
	const arc = new LightningArc({ x: 0, y: 0 }, { x: 100, y: 0 }, { segments: 4, random: fixedRandom(0.5) });
	const points = arc.points;
	assert.deepEqual(points[0], { x: 0, y: 0 });
	assert.deepEqual(points[points.length - 1], { x: 100, y: 0 });
	assert.equal(points.length, 6); // 2 endpoints + 4 interior points
});

test('interior points are jittered off the straight line, endpoints tapered to zero offset', () => {
	const arc = new LightningArc({ x: 0, y: 0 }, { x: 100, y: 0 }, { segments: 1, jitter: 10, random: fixedRandom(1) });
	const [start, middle, end] = arc.points;
	assert.equal(start.y, 0);
	assert.equal(end.y, 0);
	assert.notEqual(middle.y, 0, 'the interior point should be jittered perpendicular to the line');
});

test('a zero-length arc (from equals to) never throws and has zero jitter', () => {
	const arc = new LightningArc({ x: 5, y: 5 }, { x: 5, y: 5 }, { segments: 3, jitter: 20 });
	for (const point of arc.points) assert.deepEqual(point, { x: 5, y: 5 });
});

test('segments: 0 produces just the two endpoints', () => {
	const arc = new LightningArc({ x: 0, y: 0 }, { x: 10, y: 10 }, { segments: 0 });
	assert.equal(arc.points.length, 2);
});

test('update reports done exactly once duration elapses', () => {
	const arc = new LightningArc({ x: 0, y: 0 }, { x: 1, y: 0 }, { duration: 0.2 });
	assert.equal(arc.update(0.1), false);
	assert.equal(arc.done, false);
	assert.equal(arc.update(0.15), true);
	assert.equal(arc.done, true);
	assert.equal(arc.update(1), false, 'no repeated true after it has already expired');
});

test('an arc with no duration never expires on its own', () => {
	const arc = new LightningArc({ x: 0, y: 0 }, { x: 1, y: 0 });
	for (let i = 0; i < 100; i += 1) assert.equal(arc.update(1), false);
	assert.equal(arc.done, false);
});

test('with no flickerInterval, the jittered shape holds steady across updates', () => {
	let calls = 0;
	const random = () => {
		calls += 1;
		return 0.7;
	};
	const arc = new LightningArc({ x: 0, y: 0 }, { x: 50, y: 0 }, { segments: 3, random });
	const before = arc.points.map((p) => ({ ...p }));
	arc.update(1 / 60);
	arc.update(1 / 60);
	assert.deepEqual(arc.points, before, 'no re-roll happened, so the shape is unchanged');
	assert.equal(calls, 3, 'random was only consulted once, at construction');
});

test('flickerInterval re-rolls the jittered shape periodically', () => {
	let call = 0;
	const random = () => (call++ % 2 === 0 ? 0 : 1); // alternates each reroll
	const arc = new LightningArc(
		{ x: 0, y: 0 },
		{ x: 50, y: 0 },
		{ segments: 1, jitter: 10, flickerInterval: 0.1, random },
	);
	const first = arc.points.map((p) => ({ ...p }));
	arc.update(0.05); // not yet a full interval
	assert.deepEqual(arc.points, first);
	arc.update(0.06); // crosses the interval, re-rolls
	assert.notDeepEqual(arc.points, first);
});

test('retarget moves an endpoint and reshapes the line between the new points', () => {
	const arc = new LightningArc({ x: 0, y: 0 }, { x: 10, y: 0 }, { segments: 0 });
	arc.retarget(undefined, { x: 20, y: 20 });
	assert.deepEqual(arc.points[0], { x: 0, y: 0 });
	assert.deepEqual(arc.points[1], { x: 20, y: 20 });
});
