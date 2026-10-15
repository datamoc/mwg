export const DEFAULT_MIME: Record<string, string>;

export function walk(dir: string): AsyncGenerator<string>;

export interface CompileResourcesOptions {
	from: string;
	to: string;
	mime?: Record<string, string>;
	groupBy?: (key: string) => string;
	/** Exact paths relative to the asset folder to embed. Omit to include all; [] includes none. Unknown entries fail by name. */
	assetFiles?: readonly string[];
	toWebp?: boolean;
	webpLossless?: boolean;
	webpQuality?: number;
	/** Subset an embedded `.sf2` to the programs the embedded `.mid`/`.midi` files use. Default true; `false` embeds every SoundFont whole. */
	soundFont?: boolean;
	/** Explicit `{ bank, program }` list to subset a SoundFont to, overriding the MIDI-derived list. */
	soundFontUsage?: readonly SoundFontUsage[];
}

export interface CompileResourcesGroup {
	name: string;
	count: number;
	size: number;
}

export interface CompileResourcesResult {
	groups: CompileResourcesGroup[];
	rawBytes: number;
	embeddedBytes: number;
	webpConverted: number;
	skipped: number;
	/** the `CREDITS.txt` text when the asset folder holds a `credits.json`, else null */
	credits: string | null;
	/** one entry per embedded `.sf2`: the programs kept (null when embedded whole) and the byte saving */
	soundFonts: SoundFontEmbed[];
}

/** the plain-text credits for a manifest (an array, or `{ credits: [...] }`, of `{ name, license, author?, url? }`) */
export function creditsText(manifest: unknown): string;

export interface SoundFontUsage {
	bank: number;
	program: number;
}

export interface SoundFontEmbed {
	key: string;
	/** programs kept, or null when the font was embedded whole for lack of a usage list */
	programs: number | null;
	rawBytes: number;
	embeddedBytes: number;
}

/** parses a `--soundfont-usage=bank:program,...` CLI value; undefined when the flag is absent */
export function soundFontUsageFromFlag(value: string | undefined): SoundFontUsage[] | undefined;

export function compileResources(options: CompileResourcesOptions): Promise<CompileResourcesResult>;
