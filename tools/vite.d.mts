import type { EmitPageOptions } from './emit-page.mjs';

export interface MwgPageOptions extends Omit<EmitPageOptions, 'dist' | 'assets'> {
	/** the asset source folder, relative to the vite root; served in dev and compiled in the build. Default `'assets'`, `false` for none */
	assets?: string | false;
	/** write `sbom.cdx.json`, the CycloneDX SBOM of what the build ships; default true */
	sbom?: boolean;
}

/** the vite plugin that makes `vite build` alone write a page that opens from `file://` */
export function mwgPage(options?: MwgPageOptions): {
	name: string;
	config(): Record<string, unknown>;
	configResolved(config: { root: string; command: string; build: { outDir: string } }): void;
	generateBundle(options: unknown, bundle: Record<string, { type: string; modules?: Record<string, unknown> }>): void;
	closeBundle(this: { meta?: { watchMode?: boolean } }): Promise<void>;
};
