export interface AssetReportFile {
	path: string;
	raw: number;
	gzip: number;
	brotli: number;
	sha256: string;
	/** This file's gzip bytes over the page's total gzip bytes, 0 when the page is empty. */
	share: number;
}
export interface AssetReportSource {
	path: string;
	raw: number;
	sha256: string;
}
export interface AssetReportTotals {
	files: number;
	raw: number;
	gzip: number;
	brotli: number;
	assetFiles: number;
	assetRaw: number;
}
export interface AssetReport {
	dist: string;
	files: AssetReportFile[];
	assets: AssetReportSource[];
	/** Groups of source paths with byte-identical content, sorted; empty when none exist. */
	duplicates: string[][];
	totals: AssetReportTotals;
}
export function fingerprint(data: Uint8Array): string;
export function compressedSizes(data: Uint8Array): { gzip: number; brotli: number };
export function assetReport(options: {
	dist: string;
	assets?: string;
	mime?: Record<string, string>;
}): Promise<AssetReport>;
