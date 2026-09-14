export const DEFAULT_MIME: Record<string, string>;

export function walk(dir: string): AsyncGenerator<string>;

export interface CompileResourcesOptions {
	from: string;
	to: string;
	mime?: Record<string, string>;
	groupBy?: (key: string) => string;
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
}

export function compileResources(options: CompileResourcesOptions): Promise<CompileResourcesResult>;
