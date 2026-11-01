import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLocalMultiplayer } from '../src/two-d/render/LocalMultiplayer.ts';
import { splitScreenLayout } from '../src/two-d/render/Viewport.ts';

test('four-player split mode builds four viewports and four inputs, one pad each', () => {
	const local = createLocalMultiplayer({
		players: ['p1', 'p2', 'p3', 'p4'],
		mode: 'split',
		layout: { width: 1280, height: 720, zoom: 2 },
	});

	assert.equal(local.mode, 'split');
	assert.equal(local.viewports.length, 4);
	assert.equal(local.inputs.length, 4);
	assert.equal(local.hotseat, null);

	assert.deepEqual(
		local.inputs.map((input) => input.id),
		['p1', 'p2', 'p3', 'p4'],
	);
	assert.deepEqual(
		local.inputs.map((input) => input.padIndex),
		[0, 1, 2, 3],
	);

	const rects = splitScreenLayout(4, 1280, 720);
	local.viewports.forEach((viewport, index) => {
		assert.equal(viewport.camera.zoom, 2);
		viewport.camera.snapTo(0, 0);
		assert.equal(viewport.camera.world.x, rects[index].x + rects[index].width / 2);
		assert.equal(viewport.camera.world.y, rects[index].y + rects[index].height / 2);
	});
});

test('split mode update eases each camera toward its own followed point', () => {
	const local = createLocalMultiplayer({
		players: ['p1', 'p2', 'p3', 'p4'],
		mode: 'split',
		layout: { width: 1280, height: 720 },
		follow: {
			p1: () => ({ x: 100, y: 0 }),
			p2: () => ({ x: -100, y: 0 }),
			p3: () => ({ x: 0, y: 100 }),
			p4: () => ({ x: 0, y: -100 }),
		},
	});

	//one large frame, so the easing covers almost the whole distance
	local.update(1);

	assert.ok(
		local.viewports[0].camera.x > 90,
		`p1's camera should have moved right, not ${local.viewports[0].camera.x}`,
	);
	assert.ok(
		local.viewports[1].camera.x < -90,
		`p2's camera should have moved left, not ${local.viewports[1].camera.x}`,
	);
	assert.ok(
		local.viewports[2].camera.y > 90,
		`p3's camera should have moved down, not ${local.viewports[2].camera.y}`,
	);
	assert.ok(
		local.viewports[3].camera.y < -90,
		`p4's camera should have moved up, not ${local.viewports[3].camera.y}`,
	);
});

test('padIndexFor overrides the default 0..n-1 gamepad assignment', () => {
	const local = createLocalMultiplayer({
		players: ['p1', 'p2'],
		mode: 'split',
		layout: { width: 800, height: 600 },
		padIndexFor: (player) => (player === 'p1' ? 3 : 1),
	});

	assert.deepEqual(
		local.inputs.map((input) => input.padIndex),
		[3, 1],
	);
});

test('hotseat mode builds one full-screen viewport, one input per player, and a turn order', async () => {
	const local = createLocalMultiplayer({
		players: ['a', 'b'],
		mode: 'hotseat',
		layout: { width: 800, height: 600 },
		follow: {
			a: () => ({ x: -100, y: 0 }),
			b: () => ({ x: 100, y: 0 }),
		},
	});

	assert.equal(local.mode, 'hotseat');
	assert.equal(local.viewports.length, 1);
	assert.equal(local.inputs.length, 2);
	assert.ok(local.hotseat);
	assert.equal(local.hotseat.active, 'a', 'hotseat mode starts on the first player');

	//the single viewport covers the whole canvas
	local.viewports[0].camera.snapTo(0, 0);
	assert.equal(local.viewports[0].camera.world.x, 400);
	assert.equal(local.viewports[0].camera.world.y, 300);

	local.update(1);
	assert.ok(
		local.viewports[0].camera.x < -90,
		`the camera should follow the first player, not ${local.viewports[0].camera.x}`,
	);

	await local.hotseat.next();
	assert.equal(local.hotseat.active, 'b');

	local.update(1);
	assert.ok(
		local.viewports[0].camera.x > 90,
		`the camera should follow the new active player, not ${local.viewports[0].camera.x}`,
	);
});

test('hotseat mode hands over when the turn clock runs out', async () => {
	const local = createLocalMultiplayer({
		players: ['a', 'b'],
		mode: 'hotseat',
		layout: { width: 800, height: 600 },
		turnSeconds: 5,
		autoAdvance: true,
	});

	assert.equal(local.hotseat?.active, 'a');
	local.update(5);
	assert.equal(local.hotseat?.active, 'b');
	assert.equal(local.hotseat?.turnRemaining, 5);
	await Promise.resolve();
});

test('split mode refuses more players than the screen can hold, and invalid ids', () => {
	assert.throws(
		() =>
			createLocalMultiplayer({
				players: ['a', 'b', 'c', 'd', 'e'],
				mode: 'split',
				layout: { width: 800, height: 600 },
			}),
		/1 to 4 players/,
	);

	assert.throws(
		() => createLocalMultiplayer({ players: ['a', 'a'], mode: 'split', layout: { width: 800, height: 600 } }),
		/listed twice/,
	);

	assert.throws(
		() => createLocalMultiplayer({ players: [], mode: 'split', layout: { width: 800, height: 600 } }),
		/at least one player/,
	);

	assert.throws(
		() => createLocalMultiplayer({ players: ['a', ''], mode: 'split', layout: { width: 800, height: 600 } }),
		/non-empty id/,
	);
});

test('without a layout and without a running Game, createLocalMultiplayer says what is missing', () => {
	assert.throws(() => createLocalMultiplayer({ players: ['a', 'b'], mode: 'split' }), /needs a layout/);
});
