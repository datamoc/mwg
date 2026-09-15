/** Options for {@link compressDist}. */
export interface CompressOptions {
	/** Write `.gz` siblings (default true). */
	gzip?: boolean;
	/** Write `.br` siblings (default true). */
	brotli?: boolean;
	/** Also write `.xz` siblings where smaller (default false, needs the system `xz`). */
	xz?: boolean;
}

/**
 * One considered file, with the sizes of the siblings actually written for it: `file` is
 * relative to `dir`, and a size is 0 when that sibling was not asked for, was not smaller
 * than the original, or (for `.xz`) needs a system binary that is not there. Files under the
 * size floor, and extensions that are already compressed or not text, never produce a row.
 */
export interface CompressRow {
	file: string;
	raw: number;
	gzip: number;
	brotli: number;
	xz: number;
}

/** True when the system `xz` binary (LZMA2) is available for the opt-in archive pass. */
export function hasXz(): boolean;

/**
 * Writes compressed siblings for the large files in `dir`, *into that same folder*: the
 * originals are left untouched, and each `<file>` gains `<file>.gz`, `<file>.br` and, when
 * opted into, `<file>.xz`, beside it. There is no separate output directory, so pass a
 * directory you own or a copy of the build output, not one you are about to publish.
 */
export function compressDist(dir: string, options?: CompressOptions): Promise<CompressRow[]>;
