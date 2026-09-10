export interface ExtractedHtmlResource {
	kind: 'script' | 'style' | 'json' | 'data-uri' | 'css-data-uri';
	path: string;
	mime: string;
	bytes: number;
	sourceOffset: number;
	sourceValue: string;
}

export interface ExtractHtmlResult {
	output: string;
	html: string;
	resources: ExtractedHtmlResource[];
	warnings: string[];
	manifest: Record<string, unknown>;
}

export function extractHtml(inputFile: string, outputDirectory?: string): Promise<ExtractHtmlResult>;
