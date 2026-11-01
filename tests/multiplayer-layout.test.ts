import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createViewports, splitScreenHalves, splitScreenLayout } from '../src/two-d/render/Viewport.ts';
import type { ViewportOptions } from '../src/two-d/render/Viewport.ts';

const PLAYER_COUNTS = [1, 2, 3, 4] as const;

/** even sizes, where a strict area sum is the cleanest statement of "tiles the canvas" */
const EVEN_SIZES: readonly (readonly [number, number])[] = [
	[800, 600],
	[640, 480],
	[1024, 768],
	[400, 600],
];

/** odd sizes, where the rounding rule and coverage are the interesting part */
const ODD_SIZES: readonly (readonly [number, number])[] = [
	[801, 600],
	[800, 601],
	[801, 601],
	[639, 479],
];

function area(rect: { width: number; height: number }): number {
	return rect.width * rect.height;
}

function assertInsideCanvas(rects: readonly ViewportOptions[], width: number, height: number): void {
	for (const rect of rects) {
		assert.ok(rect.x >= 0 && rect.y >= 0, `rectangle starts off canvas: ${JSON.stringify(rect)}`);
		assert.ok(rect.x + rect.width <= width, `rectangle runs past the right edge: ${JSON.stringify(rect)}`);
		assert.ok(rect.y + rect.height <= height, `rectangle runs past the bottom edge: ${JSON.stringify(rect)}`);
		assert.ok(rect.width > 0 && rect.height > 0, `rectangle is empty: ${JSON.stringify(rect)}`);
	}
}

function assertNoOverlap(rects: readonly ViewportOptions[]): void {
	for (let i = 0; i < rects.length; i++) {
		for (let j = i + 1; j < rects.length; j++) {
			const a = rects[i];
			const b = rects[j];
			const apart =
				a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
			assert.ok(apart, `rectangles ${i} and ${j} overlap: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
		}
	}
}

test('every player count tiles an even canvas exactly, with no overlap', () => {
	for (const [width, height] of EVEN_SIZES) {
		for (const players of PLAYER_COUNTS) {
			const rects = splitScreenLayout(players, width, height);
			assert.equal(rects.length, players, `${players} players should get ${players} rectangles`);

			assertInsideCanvas(rects, width, height);
			assertNoOverlap(rects);

			//inside the canvas plus no overlap plus an exact area sum is a tiling: there is
			//nowhere left for a gap to hide
			const total = rects.reduce((sum, rect) => sum + area(rect), 0);
			assert.equal(
				total,
				width * height,
				`${players} players at ${width}x${height} leaves a gap or a double cover`,
			);
		}
	}
});

test('odd canvases still tile exactly: the spare pixel goes to the piece that starts further right or down', () => {
	for (const [width, height] of ODD_SIZES) {
		for (const players of PLAYER_COUNTS) {
			const rects = splitScreenLayout(players, width, height);
			assertInsideCanvas(rects, width, height);
			assertNoOverlap(rects);

			//floor plus the remainder on the second piece keeps integer arithmetic exact even
			//for odd sizes, so the strict sum holds here too rather than only being bounded
			const total = rects.reduce((sum, rect) => sum + area(rect), 0);
			assert.equal(total, width * height, `${players} players at ${width}x${height} does not cover the canvas`);
		}
	}

	const [left, right] = splitScreenLayout(2, 801, 600);
	assert.equal(left.width, 400);
	assert.equal(right.width, 401, 'two players: the extra column goes to the right half');
	assert.equal(left.x + left.width, right.x);

	const quadrants = splitScreenLayout(4, 801, 601);
	assert.equal(quadrants[0].width, 400);
	assert.equal(quadrants[1].width, 401, 'four players: the extra column goes to the right quadrant');
	assert.equal(quadrants[0].height, 300);
	assert.equal(quadrants[2].height, 301, 'four players: the extra row goes to the bottom quadrant');
});

test('two players are exactly the rectangles splitScreenHalves already produced', () => {
	for (const [width, height] of [...EVEN_SIZES, ...ODD_SIZES]) {
		const halves = splitScreenHalves(width, height);
		assert.deepEqual(splitScreenLayout(2, width, height), [{ ...halves[0] }, { ...halves[1] }]);
	}
});

test('one player fills the whole canvas', () => {
	for (const [width, height] of [...EVEN_SIZES, ...ODD_SIZES]) {
		assert.deepEqual(splitScreenLayout(1, width, height), [{ x: 0, y: 0, width, height }]);
	}
});

test('three players: one half plus two quarters of the other half', () => {
	for (const [width, height] of [...EVEN_SIZES, ...ODD_SIZES]) {
		const rects = splitScreenLayout(3, width, height);
		const large = rects.reduce((biggest, rect) => (area(rect) > area(biggest) ? rect : biggest));
		const quarters = rects.filter((rect) => rect !== large);

		assert.equal(quarters.length, 2);
		for (const quarter of quarters)
			assert.ok(area(large) > area(quarter), 'the large share should be bigger than either quarter');

		if (width >= height) {
			assert.equal(large.height, height, 'landscape: the large share keeps the full height');
			for (const quarter of quarters) assert.equal(quarter.width, width - large.width);
			assert.equal(quarters[0].height + quarters[1].height, height, 'the two quarters stack to the full height');
		} else {
			assert.equal(large.width, width, 'portrait: the large share keeps the full width');
			for (const quarter of quarters) assert.equal(quarter.height, height - large.height);
			assert.equal(quarters[0].width + quarters[1].width, width, 'the two quarters sit side by side');
		}
	}
});

test('three players: the large share sits on the side each variant names', () => {
	const landscape = splitScreenLayout(3, 800, 600, { three: 'large-left' });
	assert.equal(landscape[0].width, 400);
	assert.equal(landscape[0].x, 0, 'large-left puts the big rectangle at the left edge');
	assert.equal(landscape[0].height, 600);

	const right = splitScreenLayout(3, 800, 600, { three: 'large-right' });
	const largeRight = right[right.length - 1];
	assert.equal(largeRight.width, 400);
	assert.equal(largeRight.x + largeRight.width, 800, 'large-right puts the big rectangle at the right edge');
	assert.equal(largeRight.height, 600);

	//the default is the same shape as large-left
	assert.deepEqual(splitScreenLayout(3, 800, 600), landscape);
	assert.deepEqual(splitScreenLayout(3, 800, 600, { three: 'half-and-quarters' }), landscape);

	//portrait: the same two names mean top and bottom
	const portrait = splitScreenLayout(3, 600, 800, { three: 'large-left' });
	assert.equal(portrait[0].height, 400);
	assert.equal(portrait[0].y, 0, 'portrait: large-left is the top half');

	const portraitRight = splitScreenLayout(3, 600, 800, { three: 'large-right' });
	const bottom = portraitRight[portraitRight.length - 1];
	assert.equal(bottom.height, 400);
	assert.equal(bottom.y + bottom.height, 800, 'portrait: large-right is the bottom half');
});

test('four players are the four quadrants, ordered left to right then top to bottom', () => {
	const rects = splitScreenLayout(4, 800, 600);
	assert.deepEqual(rects, [
		{ x: 0, y: 0, width: 400, height: 300 },
		{ x: 400, y: 0, width: 400, height: 300 },
		{ x: 0, y: 300, width: 400, height: 300 },
		{ x: 400, y: 300, width: 400, height: 300 },
	]);
});

test('splitScreenLayout rejects a player count or a canvas size it cannot tile', () => {
	assert.throws(() => splitScreenLayout(0 as 1, 800, 600), /1 to 4 players/);
	assert.throws(() => splitScreenLayout(5 as 1, 800, 600), /1 to 4 players/);
	assert.throws(() => splitScreenLayout(2.5 as 1, 800, 600), /1 to 4 players/);

	assert.throws(() => splitScreenLayout(2, 0, 600), /splitScreenLayout width/);
	assert.throws(() => splitScreenLayout(2, 800, 0), /splitScreenLayout height/);
	assert.throws(() => splitScreenLayout(2, -800, 600), /splitScreenLayout width/);
	assert.throws(() => splitScreenLayout(2, 800, -1), /splitScreenLayout height/);
	assert.throws(() => splitScreenLayout(2, Number.NaN, 600), /splitScreenLayout width/);
	assert.throws(() => splitScreenLayout(2, 800, Number.POSITIVE_INFINITY), /splitScreenLayout height/);
});

test('createViewports builds one viewport per player, in layout order, with zoom set', () => {
	for (const players of PLAYER_COUNTS) {
		const rects = splitScreenLayout(players, 1280, 720);
		const viewports = createViewports(players, { width: 1280, height: 720, zoom: 3 });

		assert.equal(viewports.length, players);
		viewports.forEach((viewport, index) => {
			assert.equal(viewport.camera.zoom, 3);
			//world origin lands at the centre of this player's own rectangle
			viewport.camera.snapTo(0, 0);
			assert.equal(viewport.camera.world.x, rects[index].x + rects[index].width / 2);
			assert.equal(viewport.camera.world.y, rects[index].y + rects[index].height / 2);
		});
	}
});

test('createViewports honours the three-player variant it is given', () => {
	const viewports = createViewports(3, { width: 800, height: 600, three: 'large-right' });
	const large = viewports[viewports.length - 1];
	large.camera.snapTo(0, 0);
	assert.equal(large.camera.world.x, 400 + 200, 'the last viewport should be the large right-hand share');
});
