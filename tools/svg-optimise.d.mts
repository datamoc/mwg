/** the svgo configuration `optimiseSvg` runs */
export declare const SVGO_CONFIG: {
	multipass: boolean;
	plugins: { name: string; params: { overrides: Record<string, boolean> } }[];
};

/** the SVG bytes minified; needs the optional `svgo` package, and throws for a file that is not valid SVG */
export declare function optimiseSvg(buffer: Buffer): Promise<Buffer>;
