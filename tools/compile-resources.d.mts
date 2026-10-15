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
}

/** the plain-text credits for a manifest (an array, or `{ credits: [...] }`, of `{ name, license, author?, url? }`) */
export function creditsText(manifest: unknown): string;

export function compileResources(options: CompileResourcesOptions): Promise<CompileResourcesResult>;
