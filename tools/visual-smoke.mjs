import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { findChrome } from './find-chrome.mjs';

/**
 * The per-pull-request visual smoke: open one built example from `file://` in a real
 * headless Chrome and assert it actually rendered something.
 *
 * A typechecker cannot see a window placed off-screen or text drawn over itself, which is
 * the class of bug 1.0 must not ship - the same gap `DEVELOPMENT.md`'s verification loop
 * names. This catches the coarse half of that class (a page that throws on load, or a
 * canvas that paints nothing) and writes a screenshot a reviewer can open, instead of
 * only describing what a screenshot would probably show.
 *
 * It deliberately does not pixel-diff against a committed baseline. Font hinting and
 * anti-aliasing differ between a developer's machine and the Linux runner, and a gate
 * that fails for the renderer rather than for the change is worse than no gate - the same
 * argument the scheduled browser benchmark records for keeping its fps history off the
 * per-push path.
 *
 * Usage: `node tools/visual-smoke.mjs [examples/<name>/dist/index.html] [key-to-press]`
 * `MWG_VISUAL_CHROME_ARGS` carries machine-specific flags, as on a runner with no GPU.
 */

const root = resolve(import.meta.dirname, '..');
const relativePage = process.argv[2] ?? 'examples/interface/dist/index.html';
//an example whose interesting layout only appears after a keypress (the interface
//example's windowed screens) can name that key, so the screenshot shows the windows
const keyToPress = process.argv[3] ?? null;
const pageUrl = pathToFileURL(resolve(root, relativePage)).href;
const screenshotDir = resolve(root, 'benchmark-results', 'visual-smoke');
const screenshot = join(screenshotDir, relativePage.replace(/[\\/]/g, '-').replace(/\.html$/, '.png'));

const executablePath = process.env.CHROME_PATH ?? (await findChrome());
const extraChromeArgs = (process.env.MWG_VISUAL_CHROME_ARGS ?? '').split(' ').filter(Boolean);

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({
	executablePath,
	headless: true,
	args: [
		//the page loads its compiled assets from a neighbouring file, which file:// allows
		'--allow-file-access-from-files',
		...extraChromeArgs,
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
	await page.waitForFunction(
		() => {
			const canvas = document.querySelector('canvas');
			return Boolean(window.__MWG__) && Boolean(canvas && canvas.width > 0 && canvas.height > 0);
		},
		undefined,
		{ timeout: 5000 },
	);

	//let the example's own scene finish its first frames before reading pixels back
	await page.waitForTimeout(250);
	if (keyToPress) {
		await page.keyboard.press(keyToPress);
		//give the window the key opened time to lay itself out and draw
		await page.waitForTimeout(250);
	}

	const state = await page.evaluate(() => {
		const canvas = document.querySelector('canvas');
		const app = window.__PIXI_APP__;
		const renderer = String(app?.renderer?.name ?? 'unknown').toLowerCase();
		const base = {
			gameReady: Boolean(window.__MWG__),
			renderer,
			canvas: { width: canvas?.width ?? 0, height: canvas?.height ?? 0 },
			sample: null,
		};
		if (!app?.renderer?.extract) return base;

		//Pixi's own extract reads the rendered pixels back, so this works without the
		//example having to preserve its WebGL drawing buffer
		const { pixels, width, height } = app.renderer.extract.pixels(app.stage);
		//sample every 16th pixel: enough to tell a painted scene from an empty or solid one,
		//without copying millions of values back to Node
		const colours = new Set();
		let opaque = 0;
		let sampled = 0;
		for (let i = 0; i < pixels.length; i += 4 * 16) {
			sampled++;
			if (pixels[i + 3] === 0) continue;
			opaque++;
			if (colours.size < 64) colours.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
		}
		return { ...base, sample: { width, height, sampled, opaque, distinctColours: colours.size } };
	});

	await page.screenshot({ path: screenshot, type: 'png' });
	console.log(JSON.stringify({ page: pageUrl, keyToPress, screenshot, pageErrors, ...state }, null, 2));

	if (!state.gameReady || state.canvas.width === 0 || state.canvas.height === 0) {
		throw new Error('visual smoke page did not render a ready game canvas');
	}
	if (!['webgl', 'webgpu'].includes(state.renderer)) {
		throw new Error(`visual smoke requires Pixi's WebGL/WebGPU path, got ${state.renderer}`);
	}
	if (pageErrors.length) throw new Error(`visual smoke page errors: ${pageErrors.join('; ')}`);
	const sample = state.sample;
	if (!sample || sample.opaque < sample.sampled * 0.5 || sample.distinctColours < 8) {
		throw new Error(`visual smoke canvas looks blank: ${JSON.stringify(sample)}`);
	}
} finally {
	await browser.close();
}
