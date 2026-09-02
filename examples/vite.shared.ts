import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * The build every example shares.
 *
 * They differ only in which folder they live in, so the configuration lives here once. The
 * two things it settles are the ones that matter for the target: the shared asset folder is
 * served at the root so an asset path reads the same in development as in a build, and the
 * bundle is a classic IIFE with relative urls, which is what lets the built page open from
 * a file:// url. `tools/emit-page.mjs` finishes the job.
 *
 * @param dir the example's own directory, normally `import.meta.dirname`
 */
export function exampleConfig(dir: string) {
	return defineConfig({
		root: dir,
		publicDir: resolve(dir, '..', 'assets'),
		base: './',
		build: {
			outDir: 'dist',
			emptyOutDir: true,
			target: 'es2022',
			//assets are compiled into scripts instead, so vite must not emit them itself
			assetsInlineLimit: 0,
			rollupOptions: {
				output: { format: 'iife', entryFileNames: 'game.js', assetFileNames: '[name][extname]' },
			},
		},
	});
}
