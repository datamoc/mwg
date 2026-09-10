import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { smokePage } from './browser-smoke.mjs';

/**
 * The reduced-motion smoke (roadmap item 202).
 *
 * The unit tests can prove the policy; only a browser can prove the preference actually
 * arrives, that a page reacting to it draws correctly, and that a change mid-session is seen.
 * This opens the interface example's motion demo three ways and reads the state that demo
 * publishes on `window.__MWG_MOTION__`:
 *
 *   1. no preference: the diamond slides, so animated frames fill the demo's one-second window;
 *   2. `prefers-reduced-motion: reduce` before load: nothing animates;
 *   3. full motion, then the emulated media flips while the page is open: the
 *      `watchReducedMotion` subscription reports the change and the in-flight tween stops.
 *
 * Usage: `npm run motion:smoke` (which builds the interface example first).
 */
const root = resolve(import.meta.dirname, '..');
const url = pathToFileURL(resolve(root, 'examples/interface/dist/index.html')).href;
const screenshot = (name) => join(root, 'benchmark-results', 'motion-smoke', name);
const probe = 'window.__MWG_MOTION__';

const full = await smokePage({ url, screenshot: screenshot('full.png'), probe });
assert.equal(full.probe?.reduced, false, 'no preference should mean full motion');
assert.ok(
	full.probe.animatedFrames >= 5,
	`expected the demo to animate, saw ${full.probe?.animatedFrames} animated frames`,
);

const reduced = await smokePage({ url, screenshot: screenshot('reduced.png'), reducedMotion: 'reduce', probe });
assert.equal(reduced.probe?.reduced, true, 'the emulated preference should arrive');
assert.equal(reduced.probe.animatedFrames, 0, 'nothing should animate under reduced motion');

const flipped = await smokePage({
	url,
	screenshot: screenshot('flipped.png'),
	probe,
	after: async (page) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		//longer than the demo's one-second window, so frames from before the flip have aged out
		await page.waitForTimeout(1500);
	},
});
assert.equal(flipped.probe?.reduced, true, 'the change should be seen mid-session');
assert.ok(flipped.probe.changes >= 1, 'watchReducedMotion should report the change');
assert.equal(flipped.probe.animatedFrames, 0, 'the in-flight motion should stop');

console.log(JSON.stringify({ full: full.probe, reduced: reduced.probe, flipped: flipped.probe }, null, 2));
console.log('reduced-motion: the preference arrives, stops the motion, and is seen when it changes');
