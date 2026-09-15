/** Options for {@link buildSingleFile}. */
export interface SingleFileOptions {
	/** Path to the folder `emit-page.mjs` already wrote. */
	dist: string;
	/** Compress each inlined script before embedding it (default false). */
	compress?: boolean;
	/** Algorithm used when `compress` is set (default 'gzip'). */
	algorithm?: 'gzip' | 'brotli';
	/** gzip level 1-9, or brotli quality 0-11 (default 9 for gzip, 11 for brotli). */
	level?: number;
	/** Show a splash screen while the embedded scripts decode (default true). */
	splash?: boolean;
	/**
	 * Output file *name*, written inside `dist` (default `standalone.html`). A name, not a
	 * path: one containing a separator is refused with a thrown error rather than joined
	 * onto `dist`. Additive, so `dist/index.html` is left as it was.
	 */
	output?: string;
}

/** What {@link buildSingleFile} wrote. */
export interface SingleFileResult {
	/** Path of the written file: `dist` joined with `output`. */
	path: string;
	/** How many `<script src>` payloads were inlined. */
	scripts: number;
	/** Total size of that script code before compression. */
	rawBytes: number;
	/** Total length of the base64 payloads actually embedded, so after compression. */
	embeddedBytes: number;
}

export function buildSingleFile(options: SingleFileOptions): Promise<SingleFileResult>;
