export interface ServedDir {
	url: string;
	port: number;
	/**
	 * Presses and releases one key through the engine's trusted input channel (P41): a
	 * named key from the table (`Enter`, `Escape`, `ArrowUp`, ...), or a single character
	 * that types itself. `holdMs` parks between the down and the up.
	 */
	press(key: string, holdMs?: number): Promise<void>;
	close(): Promise<void>;
}

export interface CdpMouseEvent {
	type: 'mouseMoved' | 'mousePressed' | 'mouseReleased';
	x: number;
	y: number;
	button: 'none' | 'left';
	buttonValue?: number;
	clickCount?: number;
	buttons: number;
}

export interface BidiPointerAction {
	type: 'pointer';
	id: string;
	parameters: { pointerType: 'mouse' };
	actions: (
		| { type: 'pointerMove'; x: number; y: number }
		| { type: 'pointerDown'; button: number }
		| { type: 'pointerUp'; button: number }
	)[];
}

export interface BrowserDriver {
	kind: 'chrome-cdp' | 'firefox-bidi';
	goto(url: string): Promise<void>;
	waitReady(url: string, timeoutMs?: number): Promise<void>;
	evaluate<T>(expression: string): Promise<T>;
	script<Args extends unknown[], T>(fn: (...args: Args) => T | Promise<T>, ...args: Args): Promise<T>;
	tap(xFraction: number, yFraction: number): Promise<void>;
	screenshot(): Promise<Buffer>;
	consoleErrors(): string[];
	close(): Promise<void>;
}

export interface DriveOptions {
	executable?: string;
	chromeArgs?: string[];
	firefoxArgs?: string[];
	profileDir?: string;
	/**
	 * The inner page viewport, applied through each engine's protocol call (CDP
	 * `Emulation.setDeviceMetricsOverride`, BiDi `browsingContext.setViewport`) rather
	 * than window flags, whose outer size is what a consumer's compensation kept
	 * rediscovering (P41).
	 */
	viewport?: { width: number; height: number };
	/** show the browser window instead of running headless, for watching a driven run */
	headed?: boolean;
}

/** the readiness predicate browser-smoke's waitForGame waits on, as page JS */
export function readinessExpression(): string;

/** an OS-chosen free port, so Windows' excluded-port ranges cannot bite */
export function pickFreePort(): Promise<number>;

/** serves root over HTTP on an OS-chosen free port */
export function serveDir(root: string): Promise<ServedDir>;

/** the ws:// endpoint Chrome prints as DevTools listening on ..., or null */
export function parseDevToolsEndpoint(stderr: string): string | null;

/** the ws:// endpoint Firefox prints as WebDriver BiDi listening on ..., or null */
export function parseBidiEndpoint(stderr: string): string | null;

/** the CDP Input.dispatchMouseEvent sequence a tap is, at CSS pixels */
export function buildTapSequence(x: number, y: number): CdpMouseEvent[];

/** the BiDi input.performActions pointer half of a tap, at CSS pixels */
export function buildPointerActions(x: number, y: number): BidiPointerAction[];

/** everything a named key's press needs per protocol: DOM `code`, Windows VK, the typed character, the WebDriver key value; null for the unmapped */
export function keyInfoOf(key: string): { code: string; vk: number; bidi: string; text?: string } | null;

/** the CDP `Input.dispatchKeyEvent` pair one press is */
export function cdpKeySequence(key: string): unknown[] | null;

/** the BiDi `input.performActions` key sequence one press is, with the hold as a pause */
export function bidiKeyActions(key: string, holdMs?: number): unknown[] | null;

/**
 * The in-page synthetic pointer sequence a tap is, as page JS - the Firefox tap path,
 * because the BiDi pointer actions do not reach Pixi 8's canvas EventSystem (P41).
 */
export function pageTapSource(x: number, y: number): string;

/** unwraps a WebDriver BiDi remote value into plain JSON */
export function unwrapRemoteValue(node: unknown): unknown;

/** locates a browser executable without a driver install, or null when neither yields anything */
export function findBrowser(kind: 'chrome' | 'firefox'): string | null;

/** drives headless Chrome over CDP */
export function driveChrome(options?: DriveOptions): Promise<BrowserDriver>;

/** drives headless Firefox over WebDriver BiDi, with the same surface as driveChrome */
export function driveFirefox(options?: DriveOptions): Promise<BrowserDriver>;
