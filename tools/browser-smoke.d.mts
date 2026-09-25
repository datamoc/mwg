import type { Page } from 'playwright-core';

export interface SmokePageOptions {
	/** a `file://` url of the built page */
	url: string;
	/** where the screenshot is written */
	screenshot: string;
	keyToPress?: string | null;
	reducedMotion?: 'reduce' | 'no-preference' | null;
	/** a JavaScript expression evaluated in the page, returned as `probe` */
	probe?: string | null;
	after?: ((page: Page) => Promise<void>) | null;
}

export interface SmokePageResult {
	url: string;
	screenshot: string;
	pageErrors: string[];
	gameReady: boolean;
	renderer: string;
	canvas: { width: number; height: number };
	sample: { width: number; height: number; sampled: number; opaque: number; distinctColours: number } | null;
	probe: unknown;
}

/** opens a built page from `file://` in headless Chrome and throws unless it rendered a live, non-blank game canvas */
export function smokePage(options: SmokePageOptions): Promise<SmokePageResult>;
