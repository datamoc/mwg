export interface ServedDir {
	url: string;
	port: number;
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

/** unwraps a WebDriver BiDi remote value into plain JSON */
export function unwrapRemoteValue(node: unknown): unknown;

/** locates a browser executable without a driver install, or null when neither yields anything */
export function findBrowser(kind: 'chrome' | 'firefox'): string | null;

/** drives headless Chrome over CDP */
export function driveChrome(options?: DriveOptions): Promise<BrowserDriver>;

/** drives headless Firefox over WebDriver BiDi, with the same surface as driveChrome */
export function driveFirefox(options?: DriveOptions): Promise<BrowserDriver>;
