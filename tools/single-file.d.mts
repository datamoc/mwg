export interface SingleFileOptions {
	dist: string;
	compress?: boolean;
	algorithm?: 'gzip' | 'brotli';
	level?: number;
	splash?: boolean;
	output?: string;
}

export interface SingleFileResult {
	path: string;
	scripts: number;
	rawBytes: number;
	embeddedBytes: number;
}

export function buildSingleFile(options: SingleFileOptions): Promise<SingleFileResult>;
