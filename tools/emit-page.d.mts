import type { CompileResourcesGroup } from './compile-resources.mjs';
import type { CompressRow } from './compress-dist.mjs';
import type { SingleFileOptions, SingleFileResult } from './single-file.mjs';

export interface EmitPageOptions {
	/** the vite output folder holding `index.html` */
	dist: string;
	/** the asset source folder compiled into `dist/assets/*.js`; omit for a game with no assets */
	assets?: string;
	/** maps an asset path to its script's name; defaults to one script per top-level folder */
	groupBy?: (key: string) => string;
	/** write `.gz`/`.br` siblings for a server to negotiate; default true */
	compress?: boolean;
	/** also write `.xz`, where the system `xz` binary exists */
	xz?: boolean;
	/** also write `standalone.html` with every script inlined */
	singleFile?: boolean | Omit<SingleFileOptions, 'dist'>;
	toWebp?: boolean;
	webpLossless?: boolean;
	webpQuality?: number;
	/** the page's Content-Security-Policy: on by default, `false` to leave it out */
	csp?: boolean | CspOptions;
}

export interface CspOptions {
	/** origins the game connects to (`NewsClient`, `TelemetryClient`, `LockstepClient`...) */
	connect?: string[];
	/** keep `'unsafe-eval'`, which Pixi 8 needs unless the game imports `pixi.js/unsafe-eval`; default true */
	eval?: boolean;
}

export interface EmitPageResult {
	dist: string;
	entry: string;
	groups: CompileResourcesGroup[];
	rawBytes: number;
	embeddedBytes: number;
	webpConverted: number;
	compressed: CompressRow[] | null;
	single: SingleFileResult | null;
}

/** finishes a vite build as a page that opens from `file://` */
export function emitPage(options: EmitPageOptions): Promise<EmitPageResult>;
