import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { findChrome } from './find-chrome.mjs';

const root = resolve(import.meta.dirname, '..');
const relativePage = process.argv[2] ?? 'examples/dungeon/dist/index.html';
const pageUrl = pathToFileURL(resolve(root, relativePage)).href;
const framesToMeasure = Number(process.env.MWG_BENCHMARK_FRAMES ?? 180);
//The renderer may use a hardware GPU or Chrome's software WebGL implementation in CI, but
//it must remain on Pixi's WebGL/WebGPU path rather than silently falling back to canvas 2D.
const minFps = Number(process.env.MWG_BENCHMARK_MIN_FPS ?? 45);
const maxP95FrameMs = Number(process.env.MWG_BENCHMARK_MAX_P95_MS ?? 40);

if (!Number.isInteger(framesToMeasure) || framesToMeasure < 30) {
	throw new Error('MWG_BENCHMARK_FRAMES must be an integer of at least 30');
}

const executablePath = process.env.CHROME_PATH ?? await findChrome();
const screenshot = join(tmpdir(), `mwg-browser-benchmark-${process.pid}.png`);
const browser = await chromium.launch({
	executablePath,
	headless: true,
	args: [
		'--allow-file-access-from-files',
	],
});

try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') pageErrors.push(message.text());
	});
	await page.goto(pageUrl, { waitUntil: 'load' });
	await page.waitForFunction(() => {
		const canvas = document.querySelector('canvas');
		return Boolean(window.__MWG__ || window.__MWG_3D__) && Boolean(canvas && canvas.width > 0 && canvas.height > 0);
	}, undefined, { timeout: 5000 });

	const state = await page.evaluate(() => {
		const canvas = document.querySelector('canvas');
		const app = window.__PIXI_APP__;
		const babylon = window.__MWG_3D__;
		return {
			gameReady: Boolean(window.__MWG__ || babylon),
			canvas: { width: canvas?.width ?? 0, height: canvas?.height ?? 0 },
			renderer: babylon?.engine?.isWebGPU
				? 'webgpu'
				: babylon?.engine?.webGLVersion > 0
					? 'webgl'
					: String(app?.renderer?.name ?? 'unknown').toLowerCase(),
			webGLVersion: babylon?.engine?.webGLVersion ?? null,
			meshes: babylon?.scene?.meshes?.length ?? null,
		};
	});
	const metrics = await page.evaluate(async (count) => {
		const samples = [];
		let previous;
		await new Promise((resolve) => {
			const frame = (now) => {
				if (previous !== undefined) samples.push(now - previous);
				previous = now;
				if (samples.length >= count) resolve();
				else requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
		});
		samples.sort((a, b) => a - b);
		const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
		const p95FrameMs = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
		return { averageMs, p95FrameMs, fps: 1000 / averageMs, frames: samples.length };
	}, framesToMeasure);

	await page.screenshot({ path: screenshot, type: 'png' });
	const result = { page: pageUrl, ...state, ...metrics, screenshot, pageErrors, thresholds: { minFps, maxP95FrameMs } };
	console.log(JSON.stringify(result, null, 2));

	if (!state.gameReady || state.canvas.width === 0 || state.canvas.height === 0) {
		throw new Error('browser benchmark page did not render a ready game canvas');
	}
	if (!['webgl', 'webgpu'].includes(state.renderer)) {
		throw new Error(`browser benchmark requires WebGL or WebGPU, got ${state.renderer}`);
	}
	if (pageErrors.length) throw new Error(`browser benchmark page errors: ${pageErrors.join('; ')}`);
	if (metrics.fps < minFps || metrics.p95FrameMs > maxP95FrameMs) {
		throw new Error(
			`browser performance threshold failed: ${metrics.fps.toFixed(1)} FPS, ` +
			`p95 ${metrics.p95FrameMs.toFixed(2)} ms`,
		);
	}
} finally {
	await browser.close();
}
