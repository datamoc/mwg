import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { driveChrome, findBrowser } from './browser-driver.mjs';

/**
 * The retro-audio browser check (roadmap 442): open the built example from `file://` in a
 * real headless Chrome, tap an engine button (the tap is the gesture that may start an
 * `AudioContext`), and read the state the example publishes for tests. It asserts the
 * context started after the gesture, that picking another engine changes the engine that
 * voices the tune, and that asking for an absent engine announces a fallback rather than
 * failing or changing the sound silently. Loop, crossfade and suspend/resume timing are
 * the unit-tested half (`Music`/`MusicPlayer`); what only a browser can prove is the
 * gesture-to-sound path, and that is what this checks.
 *
 * Usage: `node tools/retro-audio-smoke.mjs` (after `npm run example:retro-audio:build`)
 */

const page = resolve('examples/retro-audio/dist/index.html');
const url = pathToFileURL(page).href;

if (!findBrowser('chrome')) {
	console.log('retro-audio smoke skipped: no Chrome executable found (set CHROME_PATH)');
	process.exit(0);
}

const state = (page) => page.evaluate('window.__mwg_test__?.retroAudio');
const until = async (page, read, wanted, what) => {
	for (let waited = 0; waited < 10000; waited += 100) {
		const value = await read(page);
		if (wanted(value)) return value;
		await new Promise((tick) => setTimeout(tick, 100));
	}
	throw new Error(`timed out waiting for ${what}; last state: ${JSON.stringify(await read(page))}`);
};

const browser = await driveChrome({});
try {
	await browser.goto(url);
	await browser.waitReady(url);
	const height = await browser.evaluate('window.__MWG__.height');
	const buttonY = (index) => (110 + index * 40 + 15) / height;

	const initial = await until(browser, state, (s) => s && s.status.includes('retro:sine'), 'the engine list');
	assert.match(initial.status, /gm-soundfont, builtin, retro:sine, retro:square/);

	//the first tap is the gesture: after it, a context exists and is running, voiced by sine
	await browser.tap(0.5, buttonY(0));
	const sine = await until(browser, state, (s) => s.engine === 'retro:sine', 'the sine engine to voice the tune');
	assert.equal(sine.contextState, 'running', 'the AudioContext started after the tap gesture');

	//an engine change re-voices the same tune through the other registered engine
	await browser.tap(0.5, buttonY(1));
	await until(browser, state, (s) => s.engine === 'retro:square', 'the square engine after the change');

	//an absent engine falls back to the internal path and says so
	await browser.tap(0.5, buttonY(3));
	const fallen = await until(browser, state, (s) => s.fallbacks >= 1, 'the fallback announcement');
	assert.equal(fallen.engine, 'builtin');
	assert.match(fallen.status, /fallback: retro:mt32/);

	assert.deepEqual(browser.consoleErrors(), [], 'no page errors across the whole run');

	const folder = resolve('benchmark-results/retro-audio');
	await mkdir(folder, { recursive: true });
	await writeFile(resolve(folder, 'final.png'), await browser.screenshot());
	console.log('retro-audio smoke: gesture start, engine change and announced fallback all verified in Chrome');
} finally {
	await browser.close();
}
