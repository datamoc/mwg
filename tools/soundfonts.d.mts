/** how freely a catalogue font may be shipped inside a game */
export type SoundFontLicenceClass =
	'public-domain' | 'permissive' | 'attribution' | 'share-alike' | 'copyleft' | 'check';

export interface SoundFontCatalogEntry {
	name: string;
	licence: string;
	licenceClass: SoundFontLicenceClass;
	web?: string;
	/** instrument files the collection carries for this font (programs for a bundled bank) */
	programs: number;
	/** megabytes of a full General MIDI bank, SoundFont 3 compressed; absent for the bundled bank */
	gmMB?: number;
	/** megabytes of every instrument file, SoundFont 3 compressed (the bundled bank's own size) */
	fullMB: number;
	/** the file of a bundled bank, relative to the package root */
	file?: string;
	note?: string;
}

export interface SoundFontCatalog {
	description: string;
	/** where the per-instrument files are fetched from by default */
	source: string;
	/** the name of the bank the package ships and games use unless they choose another */
	default: string;
	bundled: SoundFontCatalogEntry[];
	fonts: SoundFontCatalogEntry[];
}

export interface SoundFontProgramRef {
	bank: number;
	program: number;
}

export interface FetchSoundFontOptions {
	/** a catalogue font name, from `mwg-soundfonts list` */
	name: string;
	programs: SoundFontProgramRef[];
	catalog?: SoundFontCatalog;
	/** a folder or `http(s)` URL laid out as `<font>/<bank>/<program>.sf3`; the catalogue's source by default */
	source?: string;
	/** required for a licence class that is not public-domain, permissive or attribution */
	acceptLicence?: boolean;
	/** the decoded font is a SoundFont 2 (`ffmpeg` needed) instead of a SoundFont 3; `sf3` by default */
	format?: 'sf2' | 'sf3';
	/** Ogg Vorbis bytes to mono 16-bit frames, for `format: 'sf2'`; `ffmpeg` by default */
	decode?: (ogg: Uint8Array, rate: number) => Int16Array | Promise<Int16Array>;
	/** replaces the file reader, mainly for tests */
	read?: (path: string) => Promise<Uint8Array | null>;
}

export interface FetchedSoundFont {
	/** one font holding the found programs, in `format` */
	bytes: Uint8Array;
	format: 'sf2' | 'sf3';
	found: SoundFontProgramRef[];
	/** requested programs the collection does not carry */
	missing: SoundFontProgramRef[];
	font: SoundFontCatalogEntry;
}

/** the licence-classified catalogue of fetchable fonts */
export declare const CATALOG_PATH: string;
export declare function readCatalog(path?: string): SoundFontCatalog;
export declare function findFont(catalog: SoundFontCatalog, name: string): SoundFontCatalogEntry | undefined;
/** `"0,24,128:0"`: a bare number is a program of bank 0, `bank:program` names both */
export declare function parseProgramList(text: string): SoundFontProgramRef[];
/** mono 16-bit frames from Ogg Vorbis bytes, through `ffmpeg` */
export declare function ffmpegDecode(ogg: Uint8Array): Int16Array;
/** a SoundFont 3 decoded into SoundFont 2 bytes (`ffmpeg` unless `decode` is given) */
export declare function sf3ToSf2(
	bytes: Uint8Array,
	decode?: (ogg: Uint8Array, rate: number) => Int16Array | Promise<Int16Array>,
): Promise<Uint8Array>;
export declare function readCollectionFile(source: string, path: string): Promise<Uint8Array | null>;
export declare function fetchSoundFont(options: FetchSoundFontOptions): Promise<FetchedSoundFont>;
/** the credits note that travels beside a fetched font */
export declare function creditsFor(font: SoundFontCatalogEntry, programs: SoundFontProgramRef[]): string;
