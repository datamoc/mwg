import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { emitPage } from './emit-page.mjs';

/**
 * The vite side of a `file://` game in one plugin: `plugins: [mwgPage()]` and `vite build` alone
 * writes a folder that opens by double-clicking, the build every example here uses.
 *
 * It sets the configuration that target needs (a classic IIFE bundle named `game.js`, relative
 * urls through `base: './'`, no inlined or copied assets since they are compiled instead) and
 * serves `assets` (default `'assets'`, `false` for none) as the public folder, so an asset path reads the same in `vite` dev as in the
 * build. At the end of the build it runs `emitPage` over the output folder with the same
 * options. A setting the game's own config gives explicitly still wins, since vite merges a
 * plugin's `config` result under the user's.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { mwgPage } from '@datamoc/mw_games/tools/vite';
 *
 * export default defineConfig({ plugins: [mwgPage({ assets: 'assets', singleFile: true })] });
 * ```
 */
export function mwgPage(options = {}) {
	const assets = options.assets ?? 'assets';
	let root = process.cwd();
	let outDir = 'dist';
	let building = false;
	return {
		name: 'mwg-page',
		config() {
			return {
				base: './',
				publicDir: assets || false,
				build: {
					target: 'es2022',
					assetsInlineLimit: 0,
					copyPublicDir: false,
					//emitPage writes real .gz/.br files, so vite need not estimate them in memory
					reportCompressedSize: false,
					rollupOptions: {
						output: { format: 'iife', entryFileNames: 'game.js', assetFileNames: '[name][extname]' },
					},
				},
			};
		},
		configResolved(config) {
			root = config.root;
			outDir = config.build.outDir;
			building = config.command === 'build';
		},
		async closeBundle() {
			//vite also closes the bundle when a dev server stops; only a real build is finished
			if (!building || this.meta?.watchMode) return;
			const { assets: _assets, ...emitOptions } = options;
			const source = assets ? resolve(root, assets) : undefined;
			await emitPage({
				...emitOptions,
				dist: resolve(root, outDir),
				assets: source && existsSync(source) ? source : undefined,
			});
		},
	};
}
