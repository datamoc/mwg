import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { launchChrome } from './find-chrome.mjs';

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
 */
export async function smokePage({ url, screenshot, keyToPress = null }) {
	await mkdir(dirname(screenshot), { recursive: true });
	const browser = await launchChrome({ argsEnv: 'MWG_VISUAL_CHROME_ARGS' });

	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
		const pageErrors = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') pageErrors.push(message.text());
		});

		await page.goto(url, { waitUntil: 'load' });
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

		//let the scene finish its first frames before reading pixels back
		await page.waitForTimeout(250);
		if (keyToPress) {
			await page.keyboard.press(keyToPress);
			//give whatever the key opened time to lay itself out and draw
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

		return { url, keyToPress, screenshot, pageErrors, ...state };
	} finally {
		await browser.close();
	}
}
