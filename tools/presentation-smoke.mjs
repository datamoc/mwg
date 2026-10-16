import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { smokePage } from './browser-smoke.mjs';

//a runner with no GPU draws through software GL, where this page (it times its own frames just before)
//can take longer than playwright's 30 s default to hand back one frame
const SCREENSHOT_TIMEOUT_MS = 120_000;

const folder = resolve('benchmark-results/mwl-presentation');
await mkdir(folder, { recursive: true });
const report = await smokePage({
	url: pathToFileURL(resolve('examples/mwl-presentation/dist/index.html')).href,
	screenshot: resolve(folder, 'final.png'),
	after: async (page) => {
		await page.waitForFunction(() => Boolean(window.__MWG_PRESENTATION__));
		await page.keyboard.press('Tab');
		assert.match(await page.evaluate(() => window.__MWG_PRESENTATION__.ui.focusId), /toolbar\/biome$/);
		await page.keyboard.press('ArrowUp');
		const result = await page.evaluate(() => {
			const demo = window.__MWG_PRESENTATION__,
				ui = demo.ui;
			const before = demo.snapshot();
			const wood = ui.get('bridge/hud/materials/wood/material');
			const world = ui.get('bridge/world');
			const decor = ui.get('bridge/decor'),
				oldTexture = decor.children[0].texture;
			// Six tab steps reach the second material, which is initially steel.
			for (let i = 0; i < 5; i++) ui.handleAction('next');
			const focus = ui.focusId;
			demo.reorder();
			const stableFocus = ui.focusId === focus;
			const stableWood = ui.get('bridge/hud/materials/wood/material') === wood;
			ui.handleAction('confirm');
			const chosen = demo.snapshot().material;
			demo.add();
			demo.context('alpine');
			const after = demo.snapshot();
			const stableWorld = ui.get('bridge/world') === world;
			const alpineSky = ui.palette.sky;
			const changedDecor = ui.get('bridge/decor') === decor && decor.children[0].texture !== oldTexture;
			demo.setRows(['steel']);
			const removed = ui.get('bridge/hud/materials/wood/material') === null && wood.destroyed;
			demo.setRows(['steel', 'wood']);
			demo.open();
			const blocked = ui.windows.blocksWorld && ui.focusId.startsWith('bridge/results/');
			ui.handleAction('cancel');
			const closed = !demo.snapshot().showWindow && ui.windows.isEmpty && ui.get('bridge/results') === null;
			ui.update();
			const remainsClosed = ui.get('bridge/results') === null;
			const samples = [];
			for (let i = 0; i < 120; i++) {
				const start = performance.now();
				for (let n = 0; n < 20; n++) ui.update(1 / 60);
				samples.push((performance.now() - start) / 20);
			}
			samples.sort((a, b) => a - b);
			const rendered = [],
				stepped = [];
			const app = window.__PIXI_APP__,
				game = window.__MWG__;
			for (let i = 0; i < 120; i++) {
				let start = performance.now();
				app.renderer.render(app.stage);
				rendered.push(performance.now() - start);
				start = performance.now();
				game.step(1 / 60);
				stepped.push(performance.now() - start);
			}
			rendered.sort((a, b) => a - b);
			stepped.sort((a, b) => a - b);
			return {
				before,
				after,
				stableFocus,
				stableWood,
				chosen,
				stableWorld,
				alpineSky,
				changedDecor,
				removed,
				blocked,
				closed,
				remainsClosed,
				p95UpdateMs: samples[Math.floor(samples.length * 0.95)],
				p95RenderSubmissionMs: rendered[114],
				p95FrameSubmissionMs: stepped[114],
			};
		});
		assert.equal(result.stableFocus, true);
		assert.equal(result.stableWood, true);
		assert.equal(result.chosen, 'steel');
		assert.equal(result.after.beams, result.before.beams + 1);
		assert.equal(result.after.created, 1);
		assert.equal(result.stableWorld, true);
		assert.equal(result.alpineSky, 0x839eb3);
		assert.equal(result.changedDecor, true);
		assert.equal(result.removed, true);
		assert.equal(result.blocked, true);
		assert.equal(result.closed, true);
		assert.equal(result.remainsClosed, true);
		assert.ok(result.p95UpdateMs < 8, `presentation updates cost ${result.p95UpdateMs} ms at p95`);
		assert.ok(
			result.p95FrameSubmissionMs < 30,
			`submitted game frames cost ${result.p95FrameSubmissionMs} ms at p95`,
		);
		await page.screenshot({ path: resolve(folder, 'desktop.png'), timeout: SCREENSHOT_TIMEOUT_MS });
		await page.setViewportSize({ width: 390, height: 700 });
		//wait for the layout to answer the resize rather than for a fixed time: a software renderer can
		//take several frames to handle it
		await page.waitForFunction(
			() => {
				const ui = window.__MWG_PRESENTATION__.ui;
				return ui.get('bridge/hud/controls/toolbar/open').y > ui.get('bridge/hud/controls/toolbar/add').y;
			},
			undefined,
			{ timeout: SCREENSHOT_TIMEOUT_MS },
		);
		const narrow = await page.evaluate(() => {
			const ui = window.__MWG_PRESENTATION__.ui;
			const add = ui.get('bridge/hud/controls/toolbar/add');
			const results = ui.get('bridge/hud/controls/toolbar/open');
			return {
				wrapped: results.y > add.y,
				bounds: ['bridge/hud', 'bridge/hud/materials/wood/material', 'bridge/hud/controls/toolbar/open'].map(
					(id) => {
						const r = ui.get(id).getBounds();
						return { x: r.x, y: r.y, width: r.width, height: r.height };
					},
				),
			};
		});
		assert.equal(narrow.wrapped, true);
		for (const bounds of narrow.bounds) {
			assert.ok(
				bounds.x >= -1 && bounds.x + bounds.width <= 391,
				`off-screen horizontally: ${JSON.stringify(bounds)}`,
			);
			assert.ok(
				bounds.y >= -1 && bounds.y + bounds.height <= 701,
				`off-screen vertically: ${JSON.stringify(bounds)}`,
			);
		}
		await page.screenshot({ path: resolve(folder, 'narrow.png'), timeout: SCREENSHOT_TIMEOUT_MS });
		await page.evaluate(() => window.__MWG_PRESENTATION__.open());
		await page.screenshot({ path: resolve(folder, 'modal.png'), timeout: SCREENSHOT_TIMEOUT_MS });
		const addPoint = await page.evaluate(() => {
			const r = window.__MWG_PRESENTATION__.ui.get('bridge/hud/controls/toolbar/add').getBounds();
			return { x: r.x + r.width / 2, y: r.y + r.height / 2, beams: window.__MWG_PRESENTATION__.snapshot().beams };
		});
		await page.mouse.click(addPoint.x, addPoint.y);
		assert.equal(
			await page.evaluate(() => window.__MWG_PRESENTATION__.snapshot().beams),
			addPoint.beams,
			'modal blocker prevents clicks reaching the editor',
		);
		await page.evaluate(() => {
			const d = window.__MWG_PRESENTATION__;
			d.close();
			for (let i = 0; i < 20; i++) d.context(i % 2 ? 'alpine' : '');
		});
		await page.mouse.click(addPoint.x, addPoint.y);
		assert.equal(
			await page.evaluate(() => window.__MWG_PRESENTATION__.snapshot().beams),
			addPoint.beams + 1,
			'context switching does not duplicate callbacks',
		);
		await page.evaluate(() => window.__MWG_PRESENTATION__.open());
		await page.keyboard.press('Escape');
		assert.equal(await page.evaluate(() => window.__MWG_PRESENTATION__.snapshot().showWindow), false);
		await page.evaluate(() => window.__MWG_PRESENTATION__.open());
		const cleanupPage = await page.context().browser().newPage();
		await cleanupPage.goto(page.url());
		await cleanupPage.waitForFunction(() => Boolean(window.__MWG_PRESENTATION__));
		const cleanup = await cleanupPage.evaluate(() => {
			const demo = window.__MWG_PRESENTATION__;
			window.__PIXI_APP__.ticker.stop();
			demo.open();
			demo.remove();
			const snapshot = demo.snapshot();
			return snapshot;
		});
		await cleanupPage.close();
		assert.equal(cleanup.destroyed, 1);
		assert.equal(cleanup.changes, 0);
		assert.equal(cleanup.input, cleanup.baselineInput);
		assert.equal(cleanup.themes, cleanup.baselineThemes);
		await writeFile(
			resolve(folder, 'acceptance.json'),
			JSON.stringify({ ...result, narrow, cleanup }, null, 2) + '\n',
		);
	},
});
console.log(JSON.stringify(report, null, 2));
