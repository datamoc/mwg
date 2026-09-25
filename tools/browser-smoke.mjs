#!/usr/bin/env node
import { realpathSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome } from './find-chrome.mjs';

/**
 * Waits up to five seconds for an mwg game to be ready on `page` (`window.__MWG__` or
 * `window.__MWG_3D__` set, and a canvas with a size), and otherwise throws a sentence naming the
 * page and whatever errors it logged. Shared with `benchmark-browser.mjs`.
 */
export async function waitForGame(page, url, pageErrors = []) {
	try {
		await page.waitForFunction(
			() => {
				const canvas = document.querySelector('canvas');
				return (
					Boolean(window.__MWG__ || window.__MWG_3D__) &&
					Boolean(canvas && canvas.width > 0 && canvas.height > 0)
				);
			},
			undefined,
			{ timeout: 5000 },
		);
	} catch {
		const errors = pageErrors.length ? `; page errors: ${pageErrors.join('; ')}` : '';
		throw new Error(`no mwg game became ready within 5 s on ${url} (window.__MWG__ and a sized canvas)${errors}`);
	}
}

/**
 * Opens a built page from `file://` in headless Chrome and asserts it actually rendered.
 *
 * Shared by the per-pull-request visual smoke and the published-package smoke so both judge
 * a page the same way: no uncaught error, a canvas on Pixi's WebGL/WebGPU path, and pixels
 * that are neither empty nor one flat colour. Each caller chooses the page and where its
 * screenshot goes.
 *
 * It deliberately does not pixel-diff against a committed baseline. Font hinting and
 * anti-aliasing differ between a developer's machine and the Linux runner, and a gate that
 * fails for the renderer rather than the change is worse than no gate - the same argument the
 * scheduled browser benchmark records for keeping its fps history off the per-push path.
 *
 * `MWG_VISUAL_CHROME_ARGS` carries machine-specific flags, as on a runner with no GPU.
 *
 * Three optional extras let a caller check more than "it rendered":
 *
 *   - `reducedMotion`: `'reduce'` or `'no-preference'`, emulated before the page loads;
 *   - `probe`: a JavaScript expression evaluated in the page after it settles, returned as
 *     `state.probe` (the reduced-motion smoke reads `window.__MWG_MOTION__` this way);
 *   - `after`: an async hook run once the page has settled and `keyToPress` has fired, for a
 *     scenario that changes something while the page is open (flipping the emulated media).
 */
export async function smokePage({
	url,
	screenshot,
	keyToPress = null,
	reducedMotion = null,
	probe = null,
	after = null,
}) {
	await mkdir(dirname(screenshot), { recursive: true });
	const browser = await launchChrome({ argsEnv: 'MWG_VISUAL_CHROME_ARGS' });

	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
		if (reducedMotion) await page.emulateMedia({ reducedMotion });
		const pageErrors = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') pageErrors.push(message.text());
		});

		await page.goto(url, { waitUntil: 'load' });
		await waitForGame(page, url, pageErrors);

		//let the scene finish its first frames before reading pixels back
		await page.waitForTimeout(250);
		if (keyToPress) {
			await page.keyboard.press(keyToPress);
			//give whatever the key opened time to lay itself out and draw
			await page.waitForTimeout(250);
		}
		if (after) await after(page);

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
			//page having to preserve its WebGL drawing buffer
			const { pixels, width, height } = app.renderer.extract.pixels(app.stage);
			//sample every 16th pixel: enough to tell a painted scene from an empty or solid
			//one, without copying millions of values back to Node
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
		const probed =
			probe === null ? null : await page.evaluate((source) => new Function(`return (${source})`)(), probe);

		if (!state.gameReady || state.canvas.width === 0 || state.canvas.height === 0) {
			throw new Error(`page did not render a ready game canvas: ${url}`);
		}
		if (!['webgl', 'webgpu'].includes(state.renderer)) {
			throw new Error(`page is not on Pixi's WebGL/WebGPU path, got ${state.renderer}: ${url}`);
		}
		if (pageErrors.length) throw new Error(`page errors on ${url}: ${pageErrors.join('; ')}`);
		const sample = state.sample;
		if (!sample || sample.opaque < sample.sampled * 0.5 || sample.distinctColours < 8) {
			throw new Error(`canvas looks blank on ${url}: ${JSON.stringify(sample)}`);
		}

		return { url, keyToPress, reducedMotion, screenshot, pageErrors, ...state, probe: probed };
	} finally {
		await browser.close();
	}
}

/**
 * `mwg-smoke <page.html | dist folder> [--screenshot=<file.png>] [--key=<key>]`: the same check
 * from a game's own CI. Prints the result as JSON and exits non-zero when the page did not
 * render, so `vite build && mwg-smoke dist` proves a build still opens by double-clicking.
 * Needs `playwright-core` and a Chrome or Chromium (`CHROME_PATH` to name one).
 */
async function main(argv) {
	const target = argv.find((arg) => !arg.startsWith('--'));
	if (!target) {
		console.error('usage: mwg-smoke <page.html | dist folder> [--screenshot=<file.png>] [--key=<key>]');
		process.exit(1);
	}
	const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
	const page = statSync(target).isDirectory() ? join(target, 'index.html') : target;
	try {
		const result = await smokePage({
			url: pathToFileURL(resolve(page)).href,
			screenshot: resolve(value('screenshot') ?? join(dirname(page), 'smoke.png')),
			keyToPress: value('key') ?? null,
		});
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
	await main(process.argv.slice(2));
