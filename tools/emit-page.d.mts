import type { CompileResourcesGroup, SoundFontEmbed, SoundFontUsage } from './compile-resources.mjs';
import type { CompressRow } from './compress-dist.mjs';
import type { SingleFileOptions, SingleFileResult } from './single-file.mjs';

export interface EmitPageOptions {
	/** the vite output folder holding `index.html` */
	dist: string;
	/** the asset source folder compiled into `dist/assets/*.js`; omit for a game with no assets */
	assets?: string;
	/** maps an asset path to its script's name; defaults to one script per top-level folder */
	groupBy?: (key: string) => string;
	/** Exact paths relative to the asset folder to embed. Omit to include all; [] includes none. Unknown entries fail by name. */
	assetFiles?: readonly string[];
	/** write `.gz`/`.br` siblings for a server to negotiate; default true */
	compress?: boolean;
	/** also write `.xz`, where the system `xz` binary exists */
	xz?: boolean;
	/** also write `standalone.html` with every script inlined */
	singleFile?: boolean | Omit<SingleFileOptions, 'dist'>;
	toWebp?: boolean;
	webpLossless?: boolean;
	webpQuality?: number;
	/** minify embedded `.svg` assets through the optional `svgo` package; false by default */
	svgo?: boolean;
	/** Subset an embedded `.sf2` to the programs the embedded `.mid`/`.midi` files use. Default true; `false` embeds every SoundFont whole. */
	soundFont?: boolean;
	/** Explicit `{ bank, program }` list to subset a SoundFont to, overriding the MIDI-derived list. */
	soundFontUsage?: readonly SoundFontUsage[];
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
	svgOptimised: number;
	/** one entry per embedded `.sf2`: the programs kept (null when embedded whole) and the byte saving */
	soundFonts: SoundFontEmbed[];
	compressed: CompressRow[] | null;
	single: SingleFileResult | null;
}

/** finishes a vite build as a page that opens from `file://` */
export function emitPage(options: EmitPageOptions): Promise<EmitPageResult>;
