export interface CompressOptions {
	gzip?: boolean;
	brotli?: boolean;
	xz?: boolean;
}

export interface CompressRow {
	file: string;
	raw: number;
	gzip: number;
	brotli: number;
	xz: number;
}

export function hasXz(): boolean;
export function compressDist(dir: string, options?: CompressOptions): Promise<CompressRow[]>;
