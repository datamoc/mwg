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
	/** minify embedded `.svg` assets through the optional `svgo` package (version 4 or newer); false by default */
	svgo?: boolean;
	/** Subset an embedded `.sf2` to the programs the embedded `.mid`/`.midi` files use. Default true; `false` embeds every SoundFont whole. */
	soundFont?: boolean;
	/** Explicit `{ bank, program }` list to subset a SoundFont to, overriding the MIDI-derived list. */
	soundFontUsage?: readonly SoundFontUsage[];
	/**
	 * How a plain `.sf2` is embedded: compressed into a SoundFont 3 in this codec (`'opus'` by default), or `false` to keep the
	 * SoundFont 2. Opus and Vorbis are encoded by `ffmpeg` on the developer machine (absent and not named: the font stays a
	 * SoundFont 2 with a warning; named: the build fails), FLAC needs nothing. The asset key is unchanged. A `.sf3` is kept as it is.
	 */
	soundFontCodec?: 'opus' | 'vorbis' | 'flac' | false;
	/** target bitrate in kbit/s (6 to 510) for an Opus SoundFont; ffmpeg's own default when absent. Ignored by the other codecs. */
	soundFontBitrate?: number;
	/** Vorbis quality level, -1 (smallest) to 10 (best); ffmpeg's own default when absent. Ignored by the other codecs. */
	soundFontQuality?: number;
	/** replaces the sample encoder (`(frames, rate, codec) => bytes`), mainly for tests */
	soundFontEncode?: (
		frames: Int16Array,
		rate: number,
		codec: 'opus' | 'vorbis' | 'flac',
		options?: { bitrate?: number; quality?: number },
	) => Uint8Array | Promise<Uint8Array>;
}

export interface CompileResourcesGroup {
	name: string;
	count: number;
	size: number;
}

export interface CompileResourcesResult {
	groups: CompileResourcesGroup[];
	/** the asset path of every embedded file, as game code passes it to `load()` */
	keys: string[];
	rawBytes: number;
	embeddedBytes: number;
	webpConverted: number;
	/** SVG assets embedded smaller than their source because of `svgo` */
	svgOptimised: number;
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
	/** the programs the game's MIDI files ask for that this font does not carry; empty when none */
	missing: SoundFontUsage[];
	/** the codec the font was compressed in as a SoundFont 3, or null when it was embedded as it was */
	codec: 'opus' | 'vorbis' | 'flac' | null;
	/** why a font stays a SoundFont 2 when the default compression could not run */
	warning?: string;
}

/** a numeric `--name=value` CLI argument, undefined when absent */
export function numberFlag(args: readonly string[], prefix: string): number | undefined;
/** parses a `--soundfont-codec=` CLI argument: a codec name, `false` for `none`, undefined when absent */
export function soundFontCodecFromFlag(arg: string | undefined): 'opus' | 'vorbis' | 'flac' | false | undefined;
/** parses a `--soundfont-usage=bank:program,...` CLI value; undefined when the flag is absent */
export function soundFontUsageFromFlag(value: string | undefined): SoundFontUsage[] | undefined;

export function compileResources(options: CompileResourcesOptions): Promise<CompileResourcesResult>;
