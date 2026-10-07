#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createServer as createNetServer } from 'node:net';

/**
 * The dependency-free browser driver: open a page, tap it, evaluate against it,
 * screenshot it, and collect its console errors - with no Playwright install, over
 * `node:http`, `node:net`, `node:child_process` and the global `WebSocket` only.
 *
 * `tools/browser-smoke` answers "did it render" through `playwright-core` and only
 * from a `file://` page, with one probe expression and an `after` hook for anything
 * more. Anything interactive - tapping through a title screen, evaluating scene state
 * mid-run, running a consumer-authored check script against the live game, across two
 * engines - gets this driver instead. The game-facing surface stays generic
 * (`goto`/`waitReady`/`tap`/`evaluate`/`script`/`screenshot`/`consoleErrors`/`close`);
 * anything game-specific is a consumer script run through `evaluate`/`script`.
 *
 * Readiness reuses `browser-smoke`'s contract (`window.__MWG__`/`window.__MWG_3D__`
 * plus a sized canvas, 5 s), and deliberately not its pixels: font hinting and
 * anti-aliasing differ between machines, so a pixel-diff baseline fails for the
 * renderer rather than the change.
 *
 * Engines: Chrome over CDP (`driveChrome`) and Firefox over WebDriver BiDi
 * (`driveFirefox`). Both are verified live where the browsers exist; where neither
 * does, the server/port/protocol-framing units below still run - see
 * `tests/browser-driver.test.ts`.
 */

const READY_TIMEOUT_MS = 5000;

/** the readiness predicate `browser-smoke`'s `waitForGame` waits on, as page JS */
export function readinessExpression() {
	return '(() => { const canvas = document.querySelector("canvas"); return Boolean((window.__MWG__ || window.__MWG_3D__) && canvas && canvas.width > 0 && canvas.height > 0); })()';
}

/** an OS-chosen free port, so Windows' excluded-port ranges cannot bite */
export function pickFreePort() {
	return new Promise((resolvePort, reject) => {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const port = server.address().port;
			server.close((error) => (error ? reject(error) : resolvePort(port)));
		});
	});
}

const CONTENT_TYPES = new Map([
	['.html', 'text/html; charset=utf-8'],
	['.js', 'text/javascript; charset=utf-8'],
	['.mjs', 'text/javascript; charset=utf-8'],
	['.css', 'text/css; charset=utf-8'],
	['.json', 'application/json; charset=utf-8'],
	['.png', 'image/png'],
	['.jpg', 'image/jpeg'],
	['.webp', 'image/webp'],
	['.svg', 'image/svg+xml'],
	['.wasm', 'application/wasm'],
	['.mp3', 'audio/mpeg'],
	['.ogg', 'audio/ogg'],
	['.wav', 'audio/wav'],
]);

/**
 * Serves `root` over HTTP on an OS-chosen free port: `url` is the base to open pages
 * from, `close()` stops the server. Path traversal (`..`) is refused, directories
 * resolve to their `index.html`, and unknown suffixes are served as bytes.
 */
export async function serveDir(root) {
	const base = realpathSync(root);
	const server = createServer((request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
			let file = normalize(join(base, pathname));
			if (file !== base && !file.startsWith(base + sep)) {
				response.writeHead(403, { 'content-type': 'text/plain' });
				response.end('forbidden');
				return;
			}
			if (statSync(file, { throwIfNoEntry: false })?.isDirectory()) file = join(file, 'index.html');
			const bytes = readFileSync(file);
			response.writeHead(200, {
				'content-type': CONTENT_TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
			});
			response.end(bytes);
		} catch {
			response.writeHead(404, { 'content-type': 'text/plain' });
			response.end('not found');
		}
	});

	const port = await pickFreePort();
	await new Promise((resolveReady, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => resolveReady());
	});

	const sockets = new Set();
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
	});

	return {
		url: `http://127.0.0.1:${port}/`,
		port,
		close: () =>
			new Promise((resolveClosed, rejectClose) => {
				//idle keep-alive connections otherwise hold `close()` open indefinitely
				for (const socket of sockets) socket.destroy();
				server.close((error) => (error ? rejectClose(error) : resolveClosed()));
			}),
	};
}

/** the `ws://` endpoint Chrome prints as `DevTools listening on ...`, or null */
export function parseDevToolsEndpoint(stderr) {
	const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
	return match ? match[1] : null;
}

/**
 * The `ws://` endpoint Firefox prints as `WebDriver BiDi listening on ...`, or null.
 * Commands go to its `/session` path: the bare printed URL opens no session.
 */
export function parseBidiEndpoint(stderr) {
	const match = stderr.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
	if (!match) return null;
	return match[1].endsWith('/session') ? match[1] : `${match[1].replace(/\/$/, '')}/session`;
}

/**
 * The CDP `Input.dispatchMouseEvent` sequence a tap is: move, press, release, at CSS
 * pixels, with the button state each step carries. Pure so the suite can pin the
 * coordinates without a browser.
 */
export function buildTapSequence(x, y) {
	return [
		{ type: 'mouseMoved', x, y, button: 'none', buttons: 0 },
		{ type: 'mousePressed', x, y, button: 'left', buttonValue: 0, clickCount: 1, buttons: 1 },
		{ type: 'mouseReleased', x, y, button: 'left', buttonValue: 0, clickCount: 1, buttons: 0 },
	];
}

/**
 * Unwraps a WebDriver BiDi remote value into plain JSON: primitives read off
 * `.value`, arrays unwrap element-wise, objects/maps unwrap their key/value pairs,
 * sets unwrap to arrays. Handles (nodes, windows) carry no value and unwrap to
 * `undefined` - evaluate for a primitive or a plain-data shape instead.
 */
export function unwrapRemoteValue(node) {
	if (node === null || typeof node !== 'object') return node;
	if (Array.isArray(node)) return node.map(unwrapRemoteValue);
	const { type, value } = node;
	switch (type) {
		case 'array':
			return (value ?? []).map(unwrapRemoteValue);
		case 'object':
		case 'map':
			return Object.fromEntries((value ?? []).map(([key, item]) => [key, unwrapRemoteValue(item)]));
		case 'set':
			return (value ?? []).map(unwrapRemoteValue);
		case 'undefined':
			return undefined;
		case 'null':
			return null;
		case 'nan':
			return NaN;
		case 'infinity':
			return Infinity;
		case '-infinity':
			return -Infinity;
		case '-0':
			return -0;
		case 'bigint':
			return typeof value === 'string' ? BigInt(value) : value;
		default:
			return value;
	}
}

/** the BiDi `input.performActions` pointer half of a tap, at CSS pixels */
export function buildPointerActions(x, y) {
	return [
		{
			type: 'pointer',
			id: 'mwg-mouse',
			parameters: { pointerType: 'mouse' },
			actions: [
				{ type: 'pointerMove', x, y },
				{ type: 'pointerDown', button: 0 },
				{ type: 'pointerUp', button: 0 },
			],
		},
	];
}

function findOnPath(names) {
	const locator = process.platform === 'win32' ? 'where' : 'which';
	for (const name of names) {
		try {
			const found = spawnSync(locator, [name], { encoding: 'utf8', shell: process.platform === 'win32' });
			const candidate = (found.stdout ?? '').split('\n')[0].trim();
			if (candidate) return candidate;
		} catch {
			continue;
		}
	}
	return null;
}

/**
 * Locates a browser executable without a driver install: the `CHROME_PATH` /
 * `FIREFOX_PATH` override first, then well-known install locations. Returns null
 * when neither yields anything, so callers skip rather than fail.
 */
export function findBrowser(kind) {
	const override = process.env[kind === 'chrome' ? 'CHROME_PATH' : 'FIREFOX_PATH'];
	if (override) return override;
	const onPath = findOnPath(kind === 'chrome' ? ['chrome', 'chromium', 'google-chrome'] : ['firefox']);
	if (onPath) return onPath;

	const candidates =
		kind === 'chrome'
			? [
					'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
					'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
					'/usr/bin/google-chrome',
					'/usr/bin/chromium',
					'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
				]
			: [
					'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
					'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
					'/usr/bin/firefox',
					'/Applications/Firefox.app/Contents/MacOS/firefox',
				];
	try {
		for (const candidate of candidates) {
			if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
		}
	} catch {
		return null;
	}
	return null;
}

/**
 * Waits for `match` in the child's output, watching both stdout and stderr: which of the
 * two a given browser build prints its debugging endpoint on is not something to bet on.
 * The timeout message carries what was seen, because "no endpoint" alone cannot tell a
 * slow cold start from a browser that started and refused to open one.
 */
function waitForEndpoint(child, match, timeoutMs = 30000) {
	return new Promise((resolveEndpoint, reject) => {
		let seen = '';
		const timer = setTimeout(() => {
			child.kill();
			reject(
				new Error(
					`browser printed no debugging endpoint within ${timeoutMs} ms; output so far:\n${seen || '(none)'}`,
				),
			);
		}, timeoutMs);
		const onChunk = (chunk) => {
			seen += chunk.toString();
			const endpoint = match(seen);
			if (endpoint) {
				clearTimeout(timer);
				resolveEndpoint({ endpoint, seen });
			}
		};
		child.stdout?.on('data', onChunk);
		child.stderr?.on('data', onChunk);
		child.once('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.once('exit', () => {
			clearTimeout(timer);
			reject(new Error(`browser exited before printing a debugging endpoint:\n${seen}`));
		});
	});
}

/** a JSON-RPC channel over one WebSocket: `send(method, params)` awaits its reply, `onEvent` receives the rest */
function cdpChannel(socket) {
	let nextId = 1;
	const pending = new Map();
	const listeners = new Map();

	socket.addEventListener('message', (event) => {
		const frame = JSON.parse(event.data.toString());
		if (frame.id !== undefined && pending.has(frame.id)) {
			const { resolveFrame, rejectFrame } = pending.get(frame.id);
			pending.delete(frame.id);
			if (frame.error) rejectFrame(new Error(`CDP ${frame.error.message ?? JSON.stringify(frame.error)}`));
			else resolveFrame(frame.result ?? {});
		} else if (frame.method) {
			for (const listener of listeners.get(frame.method) ?? []) listener(frame.params ?? {});
		}
	});

	return {
		send: (method, params = {}) =>
			withTimeout(
				new Promise((resolveFrame, rejectFrame) => {
					const id = nextId++;
					pending.set(id, { resolveFrame, rejectFrame });
					socket.send(JSON.stringify({ id, method, params }));
				}),
				20000,
				`CDP ${method} timed out`,
			),
		onEvent: (method, listener) => {
			if (!listeners.has(method)) listeners.set(method, []);
			listeners.get(method).push(listener);
		},
	};
}

function openSocket(url, timeoutMs = 10000) {
	return new Promise((resolveSocket, reject) => {
		const socket = new WebSocket(url);
		const timer = setTimeout(() => {
			try {
				socket.close();
			} catch {
				// already gone; the rejection below is what matters
			}
			reject(new Error(`cannot open ${url} within ${timeoutMs} ms`));
		}, timeoutMs);
		socket.addEventListener('error', () => reject(new Error(`cannot open ${url}`)), { once: true });
		socket.addEventListener(
			'open',
			() => {
				clearTimeout(timer);
				socket.addEventListener('error', () => {});
				resolveSocket(socket);
			},
			{ once: true },
		);
	});
}

/** rejects when `work` takes longer than `ms`: no protocol send may hang a suite forever */
function withTimeout(work, ms, message) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), ms);
	});
	//the loser must not hold the event loop: a suite that finished its work exits
	timer.unref?.();
	return Promise.race([work.finally(() => clearTimeout(timer)), timeout]);
}

function cdpTextOf(args) {
	return args
		.map((arg) => {
			if (typeof arg?.value === 'string') return arg.value;
			if (typeof arg?.description === 'string') return arg.description;
			return JSON.stringify(arg?.value ?? null);
		})
		.join(' ');
}

/**
 * Drives headless Chrome over CDP. The game-facing half of P32: `goto` a served page,
 * `waitReady` for the `browser-smoke` contract, `tap` at canvas fractions with the
 * full pointer sequence, `evaluate`/`script` against the live page, `screenshot` to
 * a PNG buffer, `consoleErrors` across console/page-error channels, `close`. The
 * browser runs against its own profile (`options.profileDir`, or a temp dir this
 * driver creates and removes on `close`), never the machine's default one.
 */
/**
 * Polls the shared readiness predicate through either engine's `evaluate` until it
 * reads true: the `browser-smoke` contract (`window.__MWG__`/`window.__MWG_3D__` plus
 * a sized canvas), with the same timeout and failure shape on both.
 */
async function waitForReadyPage(evaluate, consoleErrors, url, timeoutMs = READY_TIMEOUT_MS) {
	const started = Date.now();
	for (;;) {
		if ((await evaluate(readinessExpression())) === true) return;
		if (Date.now() - started > timeoutMs) {
			const errors = consoleErrors();
			const suffix = errors.length ? `; page errors: ${errors.join('; ')}` : '';
			throw new Error(
				`no mwg game became ready within ${Math.round(timeoutMs / 1000)} s on ${url} (window.__MWG__ and a sized canvas)${suffix}`,
			);
		}
		await new Promise((tick) => setTimeout(tick, 100));
	}
}

/** runs a consumer function against the live page, awaiting it when it is async */
function runPageScript(evaluate, fn, args) {
	return evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
}

export async function driveChrome(options = {}) {
	const executable = options.executable ?? findBrowser('chrome');
	const debuggingPort = await pickFreePort();
	if (!executable) throw new Error('no Chrome executable found (set CHROME_PATH)');
	const extraArgs = (process.env.MWG_DRIVER_CHROME_ARGS ?? '').split(' ').filter(Boolean);

	//a dedicated profile, never the machine's own default one: a desktop Chrome already
	//running on it (a dev machine) or a first-ever start against it (a cold CI runner) can
	//hold the endpoint past any reasonable startup budget, and Chrome has said the default
	//profile is the one configuration whose debugging port it may refuse. Fresh temp dir
	//unless the caller owns the profile, and then it is the caller's to remove.
	const ownsProfile = !options.profileDir;
	const profileDir = resolve(options.profileDir ?? mkdtempSync(join(tmpdir(), 'mwg-chrome-')));
	const child = spawn(
		executable,
		[
			'--headless',
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-extensions',
			'--allow-file-access-from-files',
			`--user-data-dir=${profileDir}`,
			`--remote-debugging-port=${debuggingPort}`,
			'--remote-allow-origins=*',
			...(options.chromeArgs ?? extraArgs),
			'about:blank',
		],
		{ stdio: ['ignore', 'pipe', 'pipe'] },
	);
	await waitForEndpoint(child, parseDevToolsEndpoint);

	const target = await (
		await fetch(`http://127.0.0.1:${debuggingPort}/json/new?about:blank`, { method: 'PUT' })
	).json();
	const socket = await openSocket(target.webSocketDebuggerUrl);
	const cdp = cdpChannel(socket);
	const errors = [];
	cdp.onEvent('Runtime.consoleAPICalled', (params) => {
		if (params.type === 'error') errors.push(cdpTextOf(params.args ?? []));
	});
	cdp.onEvent('Log.entryAdded', (params) => {
		if (params.entry?.level === 'error') errors.push(params.entry.text ?? JSON.stringify(params.entry));
	});
	cdp.onEvent('Runtime.exceptionThrown', (params) => {
		errors.push(params.exceptionDetails?.text ?? params.exceptionDetails?.exception?.description ?? 'exception');
	});
	await cdp.send('Page.enable');
	await cdp.send('Runtime.enable');
	await cdp.send('Log.enable');

	let closed = false;
	const evaluate = async (expression, awaitPromise = false) => {
		const { result } = await cdp.send('Runtime.evaluate', {
			expression: `(${expression})`,
			returnByValue: true,
			awaitPromise,
		});
		if (result?.subtype === 'error' || result?.type === 'error') {
			throw new Error(`page evaluation threw: ${result.description ?? expression}`);
		}
		return result?.value;
	};

	return {
		kind: 'chrome-cdp',
		goto: (url) => cdp.send('Page.navigate', { url }).then(() => undefined),
		waitReady: (url, timeoutMs) => waitForReadyPage(evaluate, () => errors, url, timeoutMs),
		evaluate,
		script: (fn, ...args) => runPageScript(evaluate, fn, args),
		tap: async (xFraction, yFraction) => {
			const point = await evaluate(
				'(() => { const box = document.querySelector("canvas").getBoundingClientRect(); return { x: box.x, y: box.y, w: box.width, h: box.height }; })()',
			);
			const x = Math.round(point.x + point.w * xFraction);
			const y = Math.round(point.y + point.h * yFraction);
			for (const event of buildTapSequence(x, y)) {
				await cdp.send('Input.dispatchMouseEvent', event);
			}
		},
		screenshot: async () => {
			const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
			return Buffer.from(data, 'base64');
		},
		consoleErrors: () => [...errors],
		close: async () => {
			if (closed) return;
			closed = true;
			try {
				await withTimeout(cdp.send('Browser.close'), 5000, 'Browser.close timed out');
			} catch {
				// already gone; the kill below is the backstop
			}
			try {
				socket.close();
			} catch {
				// already closed
			}
			child.kill();
			//the pipes must go: a browser's surviving helper processes can hold them (and so
			//the whole suite) open past the main process's death
			child.stdout?.destroy();
			child.stderr?.destroy();
			if (ownsProfile) {
				//a browser releases its profile files briefly after the kill, so wait for
				//the exit and retry: a profile left behind is clutter, not a failure
				await new Promise((done) => {
					if (child.exitCode !== null) return done();
					const giveUp = setTimeout(done, 2000);
					giveUp.unref?.();
					child.once('exit', () => {
						clearTimeout(giveUp);
						done();
					});
				});
				for (let attempt = 0; attempt < 5; attempt++) {
					try {
						rmSync(profileDir, { recursive: true, force: true });
						return;
					} catch {
						await new Promise((tick) => setTimeout(tick, 100));
					}
				}
			}
		},
	};
}

/**
 * Drives headless Firefox over WebDriver BiDi: the same game-facing surface as
 * `driveChrome` (`goto`/`waitReady`/`tap`/`evaluate`/`script`/`screenshot`/
 * `consoleErrors`/`close`), so a consumer script runs unchanged on either engine.
 */
export async function driveFirefox(options = {}) {
	const executable = options.executable ?? findBrowser('firefox');
	if (!executable) throw new Error('no Firefox executable found (set FIREFOX_PATH)');

	const profile = resolve(options.profileDir ?? join(process.cwd(), '.example-check', 'firefox-profile'));
	const bidiPort = await pickFreePort();
	const child = spawn(
		executable,
		[
			'--headless',
			'--no-remote',
			'--profile',
			profile,
			'--remote-debugging-port',
			String(bidiPort),
			...(options.firefoxArgs ?? []),
			'about:blank',
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] },
	);
	const { endpoint } = await waitForEndpoint(child, parseBidiEndpoint);
	const socket = await openSocket(endpoint);
	let nextId = 1;
	const pending = new Map();
	const listeners = [];
	socket.addEventListener('message', (event) => {
		const frame = JSON.parse(event.data.toString());
		if (frame.id !== undefined && pending.has(frame.id)) {
			const { resolveFrame, rejectFrame } = pending.get(frame.id);
			pending.delete(frame.id);
			if (frame.type === 'error') rejectFrame(new Error(`BiDi ${frame.message ?? JSON.stringify(frame)}`));
			else resolveFrame(frame.result ?? {});
		} else if (frame.type === 'event') {
			for (const listener of listeners) listener(frame);
		}
	});
	const send = (method, params = {}, session) =>
		withTimeout(
			new Promise((resolveFrame, rejectFrame) => {
				const id = nextId++;
				pending.set(id, { resolveFrame, rejectFrame });
				socket.send(JSON.stringify({ id, type: 'command', method, params, ...(session ? { session } : {}) }));
			}),
			20000,
			`BiDi ${method} timed out`,
		);

	const { sessionId } = await send('session.new', { capabilities: {} });
	const errors = [];
	listeners.push((frame) => {
		if (frame.method === 'log.entryAdded' && frame.params?.level === 'error') {
			errors.push(frame.params.text ?? JSON.stringify(frame.params));
		}
	});
	await send('session.subscribe', { events: ['log.entryAdded'] }, sessionId);
	const { context } = await send('browsingContext.create', { type: 'tab' }, sessionId);

	const evaluate = async (expression, awaitPromise = false) => {
		const outer = await send(
			'script.evaluate',
			{ expression: `(${expression})`, target: { context }, awaitPromise, resultOwnership: 'root' },
			sessionId,
		);
		if (outer?.type === 'exception') {
			throw new Error(`page evaluation threw: ${outer.exceptionDetails?.text ?? expression}`);
		}
		return unwrapRemoteValue(outer?.result);
	};

	let closed = false;
	return {
		kind: 'firefox-bidi',
		goto: (url) =>
			send('browsingContext.navigate', { context, url, wait: 'complete' }, sessionId).then(() => undefined),
		waitReady: (url, timeoutMs) => waitForReadyPage(evaluate, () => errors, url, timeoutMs),
		evaluate,
		script: (fn, ...args) => runPageScript(evaluate, fn, args),
		tap: async (xFraction, yFraction) => {
			const point = await evaluate(
				'(() => { const box = document.querySelector("canvas").getBoundingClientRect(); return { x: box.x, y: box.y, w: box.width, h: box.height }; })()',
			);
			const x = Math.round(point.x + point.w * xFraction);
			const y = Math.round(point.y + point.h * yFraction);
			await send('input.performActions', { context, actions: buildPointerActions(x, y) }, sessionId);
		},
		screenshot: async () => {
			const { data } = await send('browsingContext.captureScreenshot', { context }, sessionId);
			return Buffer.from(data, 'base64');
		},
		consoleErrors: () => [...errors],
		close: async () => {
			if (closed) return;
			closed = true;
			try {
				await withTimeout(send('session.end', {}, sessionId), 5000, 'session.end timed out');
			} catch {
				// already gone; the kill below is the backstop
			}
			try {
				socket.close();
			} catch {
				// already closed
			}
			child.kill();
		},
	};
}
