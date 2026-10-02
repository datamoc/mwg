import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { launchChrome } from './find-chrome.mjs';
import { waitForGame } from './browser-smoke.mjs';

//Automated regression: real file:// workers, UI input during rollouts and stale results.
const browser = await launchChrome();
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	const url = pathToFileURL(resolve('examples/neural/dist/index.html')).href;
	await page.goto(url);
	await waitForGame(page, url, errors);
	const start = await page.evaluate(() => {
		const scene = window.__MWG__.currentScene;
		window.__NEURAL_CHECK__ = {
			frames: [],
			last: null,
			active: true,
			inputAt: null,
			latency: null,
			inputWhileWorking: false,
		};
		const check = window.__NEURAL_CHECK__;
		const frame = (now) => {
			if (check.last !== null) check.frames.push(now - check.last);
			check.last = now;
			if (check.active) requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
		document.querySelector('canvas').addEventListener(
			'pointerdown',
			() => {
				check.inputAt = performance.now();
				check.inputWhileWorking = scene.abort !== null;
			},
			{ once: true },
		);
		let paused = scene.paused;
		Object.defineProperty(scene, 'paused', {
			get: () => paused,
			set: (value) => {
				paused = value;
				check.latency = performance.now() - check.inputAt;
			},
		});
		window.__NEURAL_PENDING__ = scene.backgroundRollouts();
		const pause = scene.controls.toGlobal({ x: 75, y: 228 });
		return { x: pause.x, y: pause.y, backgroundStarted: scene.abort !== null };
	});
	assert.equal(start.backgroundStarted, true);
	await page.mouse.click(start.x, start.y);
	const metrics = await page.evaluate(async () => {
		await window.__NEURAL_PENDING__;
		await new Promise((resolve) => setTimeout(resolve, 300));
		const check = window.__NEURAL_CHECK__;
		check.active = false;
		const sorted = check.frames.sort((a, b) => a - b);
		const scene = window.__MWG__.currentScene;
		const mean = sorted.reduce((sum, dt) => sum + dt, 0) / sorted.length;
		const before = scene.policy.predict([0.25, -0.5]);
		const batch = await scene.policy.predictBatchAsync([[0.25, -0.5]]);
		return {
			frames: sorted.length,
			fps: 1000 / mean,
			p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
			inputLatencyMs: check.latency,
			inputWhileWorking: check.inputWhileWorking,
			paused: scene.paused,
			workerReport: scene.report,
			inferenceMatches: Array.from(before).every((value, i) => value === batch[0][i]),
			renderer: String(window.__PIXI_APP__.renderer.name).toLowerCase(),
		};
	});
	assert.ok(['webgl', 'webgpu'].includes(metrics.renderer), metrics.renderer);
	assert.equal(metrics.paused, true, 'pause click was processed during worker execution');
	assert.equal(metrics.inputWhileWorking, true, 'input must be tested while rollouts are still running');
	assert.equal(metrics.inferenceMatches, true);
	assert.ok(metrics.workerReport.includes('256 episodes in'), metrics.workerReport);
	assert.ok(metrics.frames >= 10);
	assert.ok(metrics.p95FrameMs < 80, JSON.stringify(metrics));
	assert.ok(metrics.inputLatencyMs !== null && metrics.inputLatencyMs < 100, JSON.stringify(metrics));
	const stale = await page.evaluate(async () => {
		const scene = window.__MWG__.currentScene;
		const pending = scene.backgroundRollouts();
		scene.reset();
		const report = scene.report;
		await pending;
		return scene.report === report && scene.abort === null;
	});
	assert.equal(stale, true, 'reset cancels work and discards stale reports');
	assert.deepEqual(errors, []);
	mkdirSync('notes', { recursive: true });
	await page.screenshot({ path: 'notes/neural-example.png' });
	await page.setViewportSize({ width: 800, height: 720 });
	await page.screenshot({ path: 'notes/neural-example-narrow.png' });
	console.log(JSON.stringify({ ...metrics, resetDropsStaleResult: stale, errors }, null, 2));
} finally {
	await browser.close();
}
