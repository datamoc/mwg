import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { launchChrome } from './find-chrome.mjs';
import { waitForGame } from './browser-smoke.mjs';

const browser = await launchChrome();
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	const url = pathToFileURL(resolve('examples/pacman/dist/index.html')).href;
	await page.goto(url);
	await waitForGame(page, url, errors);
	const press = async (key) => {
		await page.keyboard.down(key);
		await page.evaluate(() => window.__MWG__.step(1 / 60));
		await page.keyboard.up(key);
		await page.evaluate(() => window.__MWG__.step(1 / 60));
	};
	await press('Space');
	assert.equal(await page.evaluate(() => window.__MWG__.currentScene.paused), true);
	const playerStart = await page.evaluate(() => window.__MWG__.currentScene.state.player);
	await press('ArrowRight');
	await press('Space');
	await page.evaluate(() => window.__MWG__.step(0.12));
	assert.ok(
		(await page.evaluate(() => window.__MWG__.currentScene.state.player)) > playerStart,
		'keyboard steering changes the player direction',
	);
	await press('Space');
	const before = await page.evaluate(() => structuredClone(window.__MWG__.currentScene.state));
	await press('p');
	await press('g');
	const switched = await page.evaluate(() => {
		const scene = window.__MWG__.currentScene;
		return { player: scene.playerMode, ghost: scene.ghostMode, state: scene.state };
	});
	assert.equal(switched.player, 'random');
	assert.equal(switched.ghost, 'heuristic');
	assert.deepEqual(switched.state, before, 'switching AI preserves the current game');
	const positions = await page.evaluate(() => {
		const scene = window.__MWG__.currentScene;
		return [scene.playerChoices, scene.ghostChoices].map((choices) => choices.toGlobal({ x: 70, y: 84 }));
	});
	for (const at of positions) await page.mouse.click(at.x, at.y);
	assert.deepEqual(
		await page.evaluate(() => {
			const scene = window.__MWG__.currentScene;
			return [scene.playerMode, scene.ghostMode];
		}),
		['neural', 'neural'],
	);
	await press('Space');
	const metrics = await page.evaluate(async () => {
		const frames = [];
		let last = performance.now();
		await new Promise((resolve) => {
			const frame = (now) => {
				frames.push(now - last);
				last = now;
				if (frames.length < 180) requestAnimationFrame(frame);
				else resolve();
			};
			requestAnimationFrame(frame);
		});
		const scene = window.__MWG__.currentScene;
		frames.sort((a, b) => a - b);
		return {
			fps: 1000 / (frames.reduce((sum, dt) => sum + dt, 0) / frames.length),
			p95FrameMs: frames[Math.floor(frames.length * 0.95)],
			decisionMs: scene.lastDecisionMs,
			ticks: scene.state.tick,
			renderer: String(window.__PIXI_APP__.renderer.name).toLowerCase(),
		};
	});
	assert.ok(['webgl', 'webgpu'].includes(metrics.renderer));
	assert.ok(metrics.ticks >= 10);
	assert.ok(metrics.p95FrameMs < 80, JSON.stringify(metrics));
	assert.ok(metrics.decisionMs < 50, JSON.stringify(metrics));
	await press('r');
	assert.ok(await page.evaluate(() => window.__MWG__.currentScene.state.lives === 3));
	await press('Space');
	mkdirSync('notes', { recursive: true });
	for (const [name, width, height] of [
		['wide', 1280, 800],
		['narrow', 800, 720],
		['mobile', 500, 800],
	]) {
		await page.setViewportSize({ width, height });
		await page.evaluate(() => window.__MWG__.step(1 / 60));
		await page.screenshot({ path: `notes/pacman-${name}.png` });
	}
	assert.deepEqual(errors, []);
	console.log(JSON.stringify({ ...metrics, switchingPreservesState: true, errors }, null, 2));
} finally {
	await browser.close();
}
