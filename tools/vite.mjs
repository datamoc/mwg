import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { emitPage } from './emit-page.mjs';
import { buildArtifactSbom, serialize, shippedFiles } from './sbom.mjs';

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
 * It also writes `sbom.cdx.json` into the output folder (`sbom: false` to skip it): a CycloneDX
 * SBOM of what this build ships, the npm packages whose modules reached the bundle, from vite's
 * own module graph, and every shipped file with its SHA-256. That is the inventory a player's
 * copy actually contains, which a lockfile SBOM (`mwg-sbom`) cannot give: the lockfile lists
 * vite and TypeScript, and cannot tell which dependencies tree-shaking kept.
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
	const modules = new Set();
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
		generateBundle(_options, bundle) {
			for (const chunk of Object.values(bundle))
				if (chunk.type === 'chunk') for (const id of Object.keys(chunk.modules)) modules.add(id);
		},
		configResolved(config) {
			root = config.root;
			outDir = config.build.outDir;
			building = config.command === 'build';
		},
		async closeBundle() {
			//vite also closes the bundle when a dev server stops; only a real build is finished
			if (!building || this.meta?.watchMode) return;
			const { assets: _assets, sbom = true, ...emitOptions } = options;
			const source = assets ? resolve(root, assets) : undefined;
			const dist = resolve(root, outDir);
			await emitPage({ ...emitOptions, dist, assets: source && existsSync(source) ? source : undefined });
			if (sbom) {
				const manifest = join(root, 'package.json');
				const packageJson = existsSync(manifest)
					? JSON.parse(readFileSync(manifest, 'utf8'))
					: { name: basename(root), version: '0.0.0' };
				const bom = buildArtifactSbom({ packageJson, modules: [...modules], files: await shippedFiles(dist) });
				await writeFile(join(dist, 'sbom.cdx.json'), serialize(bom), 'utf8');
			}
		},
	};
}
