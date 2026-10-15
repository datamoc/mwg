export interface ExampleIndexSymbol {
	name: string;
	kind: string;
	/** the declaring file, relative to the repository root */
	file: string;
	summary: string;
	example: string;
	moreLines: number;
	link: { label: string; href: string };
}

export interface ExampleIndexModule {
	name: string;
	specifier: string;
	entry: string;
	reference: string;
	/** the file-header example, only for a module with no symbol examples */
	overview: string | null;
	symbols: ExampleIndexSymbol[];
	/** names of the runnable examples importing this module */
	runnable: string[];
}

export interface ExampleIndexRunnable {
	name: string;
	level: string;
	description: string;
	/** the built page relative to `webpage/documentation/`, or null when not built */
	page: string | null;
	source: string;
	modules: string[];
}

export interface ExampleIndexModel {
	modules: ExampleIndexModule[];
	runnable: ExampleIndexRunnable[];
}

export interface ExampleIndexOptions {
	root?: string;
	apiDir?: string | null;
	referenceHref?: string;
}

export function escapeHtml(text: string): string;
/** the index model, read from the sources of the checkout at `root` */
export function buildExampleIndex(options?: ExampleIndexOptions): ExampleIndexModel;
/** the model as one self-contained HTML page */
export function renderExampleIndex(model: ExampleIndexModel): string;
/** builds and writes the page (default `webpage/documentation/examples.html`); returns its path */
export function writeExampleIndex(options?: { root?: string; outFile?: string }): string;
