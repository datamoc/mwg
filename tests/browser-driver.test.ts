import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import {
	bidiKeyActions,
	buildPointerActions,
	buildTapSequence,
	cdpKeySequence,
	keyInfoOf,
	pageTapSource,
	driveChrome,
	driveFirefox,
	findBrowser,
	parseBidiEndpoint,
	parseDevToolsEndpoint,
	pickFreePort,
	readinessExpression,
	serveDir,
	unwrapRemoteValue,
} from '../tools/browser-driver.mjs';

import type { BrowserDriver, DriveOptions } from '../tools/browser-driver.d.mts';

/**
 * P32: the dependency-free browser driver. The server/port/protocol-framing units run
 * everywhere with no browser; the two live tests run the same game-facing surface
 * (goto/waitReady/evaluate/tap/script/screenshot/consoleErrors) against real Chrome
 * and Firefox where they exist, and skip where neither does.
 */

const ROOT = resolvePath(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

test('a free port is actually free', async () => {
	const { createServer } = await import('node:net');
	const port = await pickFreePort();
	await new Promise<void>((resolveBound, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => server.close(() => resolveBound()));
	});
});

test('serveDir serves bytes with types, index.html, 404s and traversal refusals', async (t) => {
	const dir = mkdtempSync(join(ROOT, '.example-check', 'serve-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>', 'utf8');
	writeFileSync(join(dir, 'game.js'), 'console.log(1)', 'utf8');

	const served = await serveDir(dir);
	t.after(() => served.close());

	const index = await fetch(`${served.url}index.html`);
	assert.equal(index.status, 200);
	assert.match(index.headers.get('content-type') ?? '', /text\/html/);
	assert.match(await index.text(), /<h1>hi<\/h1>/);

	const root = await fetch(served.url);
	assert.equal(root.status, 200, 'a directory resolves to its index.html');

	const script = await fetch(`${served.url}game.js`);
	assert.match(script.headers.get('content-type') ?? '', /text\/javascript/);

	assert.equal((await fetch(`${served.url}missing.png`)).status, 404);
	assert.equal((await fetch(`${served.url}..%2fpackage.json`)).status, 403);
});

test('endpoint parsers read what each browser prints, and nothing else', () => {
	assert.equal(
		parseDevToolsEndpoint('DevTools listening on ws://127.0.0.1:51234/devtools/browser/abc\n'),
		'ws://127.0.0.1:51234/devtools/browser/abc',
	);
	assert.equal(parseDevToolsEndpoint('no endpoint here\n'), null);
	assert.equal(
		parseBidiEndpoint('WebDriver BiDi listening on ws://127.0.0.1:51234\n'),
		'ws://127.0.0.1:51234/session',
		'commands go to the /session path, not the bare printed URL',
	);
	assert.equal(parseBidiEndpoint('no endpoint here\n'), null);
});

test('a tap is the full pointer sequence at the given point', () => {
	const [moved, pressed, released] = buildTapSequence(150, 75);
	assert.deepEqual([moved.type, pressed.type, released.type], ['mouseMoved', 'mousePressed', 'mouseReleased']);
	assert.deepEqual([moved.x, moved.y, pressed.x, pressed.y], [150, 75, 150, 75]);
	assert.equal(pressed.buttons, 1);
	assert.equal(released.buttons, 0);

	const [pointer] = buildPointerActions(150, 75);
	assert.equal(pointer.type, 'pointer');
	assert.deepEqual(
		pointer.actions.map((action) => action.type),
		['pointerMove', 'pointerDown', 'pointerUp'],
	);
});

test('remote values unwrap to plain JSON, and handles to undefined', () => {
	assert.equal(unwrapRemoteValue({ type: 'number', value: 3 }), 3);
	assert.equal(unwrapRemoteValue({ type: 'string', value: 'probe' }), 'probe');
	assert.deepEqual(
		unwrapRemoteValue({
			type: 'object',
			value: [
				['w', { type: 'number', value: 800 }],
				['tags', { type: 'array', value: [{ type: 'string', value: 'a' }] }],
			],
		}),
		{ w: 800, tags: ['a'] },
	);
	assert.equal(unwrapRemoteValue({ type: 'node', handle: 'abc' }), undefined);
	assert.equal(unwrapRemoteValue(undefined), undefined);
});

test('the readiness predicate is the browser-smoke contract', () => {
	const expression = readinessExpression();
	assert.match(expression, /window\.__MWG__/);
	assert.match(expression, /window\.__MWG_3D__/);
	assert.match(expression, /querySelector\("canvas"\)/);
});

const FIXTURE = `<!doctype html>
<html><body><canvas id="game" width="300" height="150"></canvas>
<script>
window.__TAPS = 0;
document.getElementById('game').addEventListener('pointerdown', () => {
	window.__TAPS += 1;
});
const ctx = document.getElementById('game').getContext('2d');
ctx.fillStyle = '#224488';
ctx.fillRect(0, 0, 300, 150);
ctx.fillStyle = '#ffcc00';
ctx.fillRect(10, 10, 40, 40);
window.__MWG__ = { currentScene: 'probe' };
console.error('boom');
</script></body></html>
`;

/**
 * A browser profile cannot be removed while its browser is still releasing it: on
 * Windows an exiting browser (Firefox first, Chrome once it gets a profile of its
 * own) holds profile files briefly after `kill`, so a single `rmSync` throws EPERM
 * and fails the suite for its own cleanup. Retry briefly, then let the git-ignored
 * scratch go rather than failing the test over it.
 */
function removeProfileDir(dir: string, attempts = 5) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			rmSync(dir, { recursive: true, force: true });
			return;
		} catch {
			if (attempt === attempts) return;
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
		}
	}
}

async function verifyDriver(
	t: TestContext,
	name: string,
	drive: (options?: DriveOptions) => Promise<BrowserDriver>,
	profileDir: string,
) {
	const executable = findBrowser(name === 'chrome' ? 'chrome' : 'firefox');
	if (!executable) {
		t.skip(`no ${name} executable (set ${name === 'chrome' ? 'CHROME_PATH' : 'FIREFOX_PATH'})`);
		return;
	}

	const dir = mkdtempSync(join(ROOT, '.example-check', `driver-${name}-`));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	writeFileSync(join(dir, 'index.html'), FIXTURE, 'utf8');
	const served = await serveDir(dir);
	t.after(() => served.close());

	const page = await drive({ profileDir });
	try {
		const url = `${served.url}index.html`;
		await page.goto(url);
		await page.waitReady(url);
		assert.equal(await page.evaluate('window.__MWG__.currentScene'), 'probe');

		assert.equal(await page.evaluate('window.__TAPS'), 0);
		await page.tap(0.5, 0.5);
		await new Promise((tick) => setTimeout(tick, 300));
		assert.equal(await page.evaluate('window.__TAPS'), 1, 'the full pointer sequence taps the canvas');

		assert.equal(
			await page.script(
				async (a: number, b: number) => a + b + (window as unknown as { __TAPS: number }).__TAPS,
				20,
				22,
			),
			43,
			'a consumer async script runs against the live page',
		);

		const shot = await page.screenshot();
		assert.equal(shot[0], 0x89);
		assert.equal(shot[1], 0x50);
		assert.ok(shot.length > 1000, `a real screenshot, not an empty buffer (${shot.length} bytes)`);

		assert.ok(
			page.consoleErrors().some((line) => line.includes('boom')),
			`console errors are captured: ${JSON.stringify(page.consoleErrors())}`,
		);
	} finally {
		await page.close();
	}
}

test('the Chrome CDP driver plays a page end to end', { timeout: 120000 }, async (t) => {
	const dir = mkdtempSync(join(ROOT, '.example-check', 'profile-'));
	t.after(() => removeProfileDir(dir));
	await verifyDriver(t, 'chrome', driveChrome, dir);
});

test('the Firefox BiDi driver plays a page end to end', { timeout: 120000 }, async (t) => {
	const dir = mkdtempSync(join(ROOT, '.example-check', 'profile-'));
	t.after(() => removeProfileDir(dir));
	await verifyDriver(t, 'firefox', driveFirefox, dir);
});

test('key mappings cover the named keys and printable characters, and refuse the unknown', () => {
	const enter = keyInfoOf('Enter');
	assert.equal(enter?.code, 'Enter');
	assert.equal(enter?.vk, 13);
	assert.equal(enter?.bidi, '\uE007');
	assert.equal(enter?.text, undefined, 'Enter types nothing');
	const a = keyInfoOf('a');
	assert.deepEqual([a?.code, a?.vk, a?.bidi, a?.text], ['KeyA', 65, 'a', 'a']);
	const five = keyInfoOf('5');
	assert.deepEqual([five?.code, five?.vk, five?.text], ['Digit5', 53, '5']);
	const space = keyInfoOf('Space');
	assert.equal(space?.text, ' ', 'Space types its own character');
	for (const named of [
		'Escape',
		'Tab',
		'Backspace',
		'ArrowUp',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
		'Shift',
		'F5',
		'F9',
		'Delete',
	]) {
		assert.ok(keyInfoOf(named), named + ' is mapped');
	}
	assert.equal(keyInfoOf('not-a-key'), null, 'an unknown key is null, not a guess');
});

test('a press is the CDP keyDown/keyUp pair, and the typed character rides the keyDown', () => {
	const [down, up] = cdpKeySequence('Enter') as { type: string; text?: string }[];
	assert.equal(down.type, 'keyDown');
	assert.equal(up.type, 'keyUp');
	assert.equal(down.text, undefined, 'Enter carries no character');
	const [aDown, aUp] = cdpKeySequence('a') as { type: string; text?: string }[];
	assert.equal(aDown.text, 'a', 'a types itself on the keyDown');
	assert.equal(aUp.text, undefined);
	assert.equal(cdpKeySequence('not-a-key'), null);
});

test('a press is the BiDi key action sequence with the hold as a pause, in WebDriver key values', () => {
	const actions = bidiKeyActions('Enter', 120) as {
		type: string;
		actions: { type: string; value?: string; duration?: number }[];
	}[];
	assert.equal(actions.length, 1);
	assert.equal(actions[0]!.type, 'key');
	assert.deepEqual(
		actions[0]!.actions.map((step) => step.type),
		['keyDown', 'pause', 'keyUp'],
	);
	assert.equal(actions[0]!.actions[0]!.value, '\uE007', 'the WebDriver Enter value, not the DOM key');
	assert.equal(actions[0]!.actions[1]!.duration, 120, 'the hold is the pause');
	const charActions = bidiKeyActions('a') as { actions: { value?: string }[] }[];
	assert.equal(charActions[0]!.actions[0]!.value, 'a');
	assert.equal(bidiKeyActions('not-a-key'), null);
});

test('the page tap source is the full pointer identity a real mouse carries', () => {
	const source = pageTapSource(320, 240);
	assert.match(source, /PointerEvent\("pointermove"/);
	assert.match(source, /PointerEvent\("pointerdown"/);
	assert.match(source, /PointerEvent\("pointerup"/);
	assert.match(source, /MouseEvent\("click"/);
	assert.match(source, /pointerType: "mouse"/);
	assert.match(source, /clientX: 320/);
	assert.match(source, /clientY: 240/);
	// the source must be an expression the driver's evaluate can wrap in parens
	assert.ok(source.endsWith(')()'), 'an IIFE with no trailing statement');
	new Function(source);
});
