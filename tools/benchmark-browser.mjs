#!/usr/bin/env node
import { statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome } from './find-chrome.mjs';
import { waitForGame } from './browser-smoke.mjs';
import { readHistory, appendHistory, bestSeen } from './benchmark-history.mjs';

/**
 * Measures a built page's frame rate in headless Chrome: `frames` frame intervals timed with
 * `requestAnimationFrame`, their mean as fps and their 95th percentile, and Chrome's JS heap
 * where it reports one. Throws when the page is not a ready game on Pixi's (or Babylon's)
 * WebGL/WebGPU path, when it logs an error, when it misses `minFps` or `maxP95FrameMs`, or, with
 * a `historyPath`, when it falls more than `maxFpsRegression` below the best fps that history
 * has seen (a fixed gate alone cannot see a slow decline that never quite crosses it). The run is
 * appended to that history either way.
 *
 * Shipped for a game (item 387) as `@datamoc/mw_games/tools/benchmark-browser` and
 * `mwg-bench <page | dist>`; this repository runs it through `npm run benchmark:*`. A CI runner
 * has no GPU, so Chrome there is told which software WebGL path to take through
 * `MWG_BENCHMARK_CHROME_ARGS` (`--use-gl=angle --use-angle=swiftshader`), a property of the
 * machine rather than of the page.
 */
export async function measurePage({
	url,
	frames = 180,
	minFps = 45,
	maxP95FrameMs = 40,
	historyPath = null,
	maxFpsRegression = 0.15,
	screenshot = join(tmpdir(), `mwg-browser-benchmark-${process.pid}.png`),
}) {
	if (!Number.isInteger(frames) || frames < 30) throw new Error('frames must be an integer of at least 30');
	const browser = await launchChrome();
	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
		const pageErrors = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') pageErrors.push(message.text());
		});
		await page.goto(url, { waitUntil: 'load' });
		await waitForGame(page, url, pageErrors);

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
			//`performance.memory` is a non-standard Chrome extension: null everywhere else,
			//reported as such rather than guessed at
			const memory = performance.memory;
			const memoryMB = memory ? memory.usedJSHeapSize / (1024 * 1024) : null;
			return { averageMs, p95FrameMs, fps: 1000 / averageMs, frames: samples.length, memoryMB };
		}, frames);

		await page.screenshot({ path: screenshot, type: 'png' });
		const result = {
			page: url,
			...state,
			...metrics,
			screenshot,
			pageErrors,
			thresholds: { minFps, maxP95FrameMs },
		};

		if (!['webgl', 'webgpu'].includes(state.renderer)) {
			throw new Error(`browser benchmark requires WebGL or WebGPU, got ${state.renderer}`);
		}
		if (pageErrors.length) throw new Error(`browser benchmark page errors: ${pageErrors.join('; ')}`);
		if (metrics.fps < minFps || metrics.p95FrameMs > maxP95FrameMs) {
			throw Object.assign(
				new Error(
					`browser performance threshold failed: ${metrics.fps.toFixed(1)} FPS, p95 ${metrics.p95FrameMs.toFixed(2)} ms`,
				),
				{ result },
			);
		}

		if (historyPath) {
			const history = await readHistory(historyPath);
			const bestPriorFps = bestSeen(history, (entry) => entry.fps);
			await appendHistory(historyPath, history, {
				timestamp: new Date().toISOString(),
				fps: metrics.fps,
				p95FrameMs: metrics.p95FrameMs,
				memoryMB: metrics.memoryMB,
			});
			if (bestPriorFps !== null && metrics.fps < bestPriorFps * (1 - maxFpsRegression)) {
				throw Object.assign(
					new Error(
						`browser performance regressed against history: ${metrics.fps.toFixed(1)} FPS now vs ` +
							`${bestPriorFps.toFixed(1)} FPS best-seen (${historyPath})`,
					),
					{ result },
				);
			}
		}
		return result;
	} finally {
		await browser.close();
	}
}

/**
 * `mwg-bench <page | dist> [--frames=180] [--min-fps=45] [--max-p95=40] [--history=<file>]`,
 * each option also read from `MWG_BENCHMARK_FRAMES`, `MWG_BENCHMARK_MIN_FPS`,
 * `MWG_BENCHMARK_MAX_P95_MS` and `MWG_BENCHMARK_MAX_FPS_REGRESSION`. The history defaults to
 * `benchmark-results/<page>.json`, named by the page so two pages keep separate histories.
 */
async function main(argv) {
	const value = (name, env, fallback) =>
		argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? process.env[env] ?? fallback;
	const target = argv.find((arg) => !arg.startsWith('--')) ?? 'examples/dungeon/dist/index.html';
	const relativePage = statSync(target).isDirectory() ? join(target, 'index.html') : target;
	const slug = relativePage.replace(/[\\/]/g, '-').replace(/\.html$/, '');
	try {
		const result = await measurePage({
			url: pathToFileURL(resolve(relativePage)).href,
			frames: Number(value('frames', 'MWG_BENCHMARK_FRAMES', 180)),
			minFps: Number(value('min-fps', 'MWG_BENCHMARK_MIN_FPS', 45)),
			maxP95FrameMs: Number(value('max-p95', 'MWG_BENCHMARK_MAX_P95_MS', 40)),
			maxFpsRegression: Number(process.env.MWG_BENCHMARK_MAX_FPS_REGRESSION ?? 0.15),
			historyPath: resolve(value('history', 'MWG_BENCHMARK_HISTORY', join('benchmark-results', `${slug}.json`))),
		});
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		if (error?.result) console.log(JSON.stringify(error.result, null, 2));
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
	await main(process.argv.slice(2));
