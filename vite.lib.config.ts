import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Builds the standalone bundle: dist/mwg.global.js
 *
 * This is the build for people who do not want a toolchain at all. It is a classic
 * script, so a plain HTML file can load it with <script src="mwg.global.js"> and get
 * `window.mwg` — including from file://, where ES modules are blocked.
 *
 * The npm package (built by tsc, see tsconfig.build.json) is the other half: it is what
 * developers who already use a bundler will install.
 */
export default defineConfig({
	build: {
		lib: {
			entry: resolve(import.meta.dirname, 'src/index.ts'),
			name: 'mwg',
			formats: ['iife'],
			fileName: () => 'mwg.global.js',
		},
		outDir: 'dist',
		emptyOutDir: false,
		target: 'es2022',
		//pixi and rot.js are bundled in: the point of this build is that it needs nothing else
		rollupOptions: {},
	},
});
