import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FixedStepper, StoredValue, defaultStorage } from '../src/core/index.ts';
import { flowLayout } from '../src/two-d/ui/Layout.ts';
import { resolve } from '../src/assets/paths.ts';
import { synthesizeSound } from '../src/audio/Synth.ts';
import { fakeAudio } from '../src/testing/index.ts';
import { Camera } from '../src/two-d/render/Camera.ts';
import { Shape2D } from '../src/two-d/render/Shape2D.ts';
import { memoryStorage } from '../src/testing/index.ts';

test('FixedStepper runs whole steps, carries the remainder and bounds a slow frame', () => {
	const stepper = new FixedStepper(0.1, 3);
	let ticks = 0;
	assert.equal(
		stepper.advance(0.25, () => ticks++),
		2,
	);
	assert.ok(Math.abs(stepper.alpha - 0.5) < 1e-9, 'half a step is left over');
	assert.equal(
		stepper.advance(0.06, () => ticks++),
		1,
	);
	assert.equal(ticks, 3);
	assert.equal(
		stepper.advance(10, () => ticks++),
		3,
		'a long frame is capped at maxSubsteps',
	);
	assert.equal(stepper.alpha, 0, 'and the backlog is dropped rather than banked');
	assert.throws(() => new FixedStepper(0), /positive/);
});

test('StoredValue and defaultStorage are public and round-trip JSON', () => {
	const value = new StoredValue<{ solved: number[] }>(memoryStorage(), 'k');
	assert.deepEqual(value.read({ solved: [] }), { solved: [] });
	value.write({ solved: [1, 2] });
	assert.deepEqual(value.read({ solved: [] }), { solved: [1, 2] });
	assert.equal(typeof defaultStorage, 'function');
});

test('flowLayout wraps rows, aligns them and reports the height', () => {
	const items = [
		{ width: 40, height: 10 },
		{ width: 40, height: 20 },
		{ width: 40, height: 10 },
	];
	const { positions, height } = flowLayout(items, 100, { gap: 5 });
	assert.deepEqual(positions, [
		{ x: 0, y: 0 },
		{ x: 45, y: 0 },
		{ x: 0, y: 25 },
	]);
	assert.equal(height, 35);
	const centred = flowLayout(items, 100, { gap: 5, align: 'center' });
	assert.equal(centred.positions[2].x, 30, 'a lone item is centred in the width');
	assert.deepEqual(flowLayout([], 100), { positions: [], height: 0 });
	const wide = flowLayout([{ width: 300, height: 8 }], 100);
	assert.deepEqual(wide.positions, [{ x: 0, y: 0 }], 'an oversize item sits alone, not dropped');
});

test('a data: or blob: URL resolves to itself, so a synthesized tone composes with Sound', () => {
	assert.equal(resolve('data:audio/wav;base64,AAAA'), 'data:audio/wav;base64,AAAA');
	assert.equal(resolve('blob:null/1234'), 'blob:null/1234');
	const created: string[] = [];
	const sound = synthesizeSound({ duration: 0.01 }, { create: (u) => (created.push(u), fakeAudio()) });
	assert.ok(created.every((u) => u.startsWith('data:audio/wav')));
	sound.play(1, 1.2);
});

test('Camera.fit frames a fixed world inside the viewport', () => {
	const camera = new Camera();
	camera.setViewport(1600, 550);
	camera.fit(800, 550);
	assert.equal(camera.zoom, 1);
	assert.deepEqual(camera.toScreen(400, 275), { x: 800, y: 275 }, 'the world centre lands on the screen centre');
});

test('Shape2D.dashedLine chains and ignores a zero-length line', () => {
	const shape = new Shape2D();
	assert.equal(shape.dashedLine(0, 0, 100, 0, 10, 10), shape);
	assert.equal(shape.dashedLine(5, 5, 5, 5), shape);
});

test('buildDragSequence presses, moves with the button held, then releases at the end', async () => {
	const { buildDragSequence, pageDragSource } = await import('../tools/browser-driver.mjs');
	const events = buildDragSequence(0, 0, 80, 40, 4) as { type: string; x: number; y: number; buttons: number }[];
	assert.deepEqual(
		events.map((e) => e.type),
		['mouseMoved', 'mousePressed', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseReleased'],
	);
	assert.deepEqual([events[5].x, events[5].y, events[5].buttons], [80, 40, 1]);
	assert.deepEqual([events[6].x, events[6].y, events[6].buttons], [80, 40, 0]);
	assert.match(pageDragSource(0, 0, 10, 10, 2), /pointerdown[\s\S]*pointermove[\s\S]*pointerup/);
});

test('the vite plugin and the build tools can be require()d (no top-level await)', async () => {
	const { createRequire } = await import('node:module');
	const require = createRequire(import.meta.url);
	for (const tool of ['vite', 'emit-page', 'compile-resources', 'compress-dist', 'single-file', 'sbom']) {
		assert.doesNotThrow(() => require(`../tools/${tool}.mjs`), tool);
	}
});

test('mwgPage drops the EMPTY_IMPORT_META noise and keeps every other log', async () => {
	const { mwgPage } = await import('../tools/vite.mjs');
	const config = mwgPage().config() as {
		build: {
			rollupOptions: { onLog: (level: string, log: { code: string }, next: (...a: unknown[]) => void) => void };
		};
	};
	const seen: string[] = [];
	const next = (_level: unknown, log: unknown) => seen.push((log as { code: string }).code);
	config.build.rollupOptions.onLog('warn', { code: 'EMPTY_IMPORT_META' }, next);
	config.build.rollupOptions.onLog('warn', { code: 'OTHER' }, next);
	assert.deepEqual(seen, ['OTHER']);
});
