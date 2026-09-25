#!/usr/bin/env node
import { readFile, writeFile, rm, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileResources } from './compile-resources.mjs';
import { compressDist } from './compress-dist.mjs';
import { toClassicScript } from './classic-html.mjs';
import { buildSingleFile } from './single-file.mjs';

/**
 * Turns a vite build into a folder that opens by double-clicking.
 *
 * Two things have to change from what vite emits:
 *
 *   - its entry tag is `<script type="module" crossorigin>`, and both attributes stop a
 *     `file://` page from running the script. The bundle is a plain IIFE, so the tag is
 *     rewritten as a classic script - with `defer`, because a module tag was implicitly
 *     deferred and a classic one is not: without it the scripts run from `<head>` before
 *     the body exists, and the game finds no canvas;
 *   - the assets have to be compiled into scripts and listed in the page, because a
 *     `file://` page cannot read a directory to discover them.
 *
 * Shipped as `@datamoc/mw_games/tools/emit-page` (`emitPage(options)`, the function every flag
 * below maps onto) and as the `mwg-emit` command; `@datamoc/mw_games/tools/vite`'s `mwgPage()`
 * plugin calls `emitPage` at the end of `vite build`, so a game needs neither by hand.
 *
 * usage: mwg-emit <project folder> [--dist=<dir>] [--assets=<dir>] [--no-compress] [--xz]
 *                 [--single-file] [--single-file-compress[=level]]
 *                 [--single-file-brotli[=quality]] [--to-webp] [--webp-lossy[=quality]]
 *
 * `--dist` defaults to `<project folder>/dist` and `--assets` to `<project folder>/assets`; with
 * no assets folder at all, the page is rewritten and nothing is compiled.
 *
 * After the page is rewritten, precompressed `.gz`/`.br` siblings are written next to
 * the text files (see `tools/compress-dist.mjs`): the `file://` page keeps loading the
 * originals, while a server in front of the same folder can serve the smaller files.
 * `--no-compress` (or `MWG_NO_COMPRESS=1`) skips that pass; `--xz` also writes `.xz`
 * archives where the system `xz` binary exists.
 *
 * `--single-file` additionally writes `dist/standalone.html` (see `tools/single-file.mjs`):
 * every script the page loads, inlined into one file with no sibling `.js` at all.
 * `--single-file-compress[=level]` gzips each inlined script; `--single-file-brotli[=quality]`
 * compresses with brotli instead (smaller, needs a newer browser - see `single-file.mjs`'s own
 * doc comment), unpacked either way at load with the browser's own `DecompressionStream`. Both
 * are additive - the regular multi-file `index.html` this function already writes is untouched
 * - so the build-options matrix (multi-file/single-file, compressed/not, gzip/brotli) is a
 * choice per build, not a fork of the pipeline.
 *
 * `--to-webp` converts `.png`/`.jpg`/`.jpeg` example assets to WebP before embedding (see
 * `tools/webp-convert.mjs`), lossless by default; `--webp-lossy[=quality]` opts into lossy
 * re-encoding instead. Needs the optional `sharp` devDependency installed.
 */

/**
 * Finishes a vite build in `dist` as a page that opens from `file://`: compiles `assets` into
 * scripts under `dist/assets`, rewrites the module entry tag to a classic deferred one with the
 * asset scripts before it, removes vite's `.vite` metadata, then optionally precompresses and
 * writes a single-file variant. Returns what it did, for a caller to report.
 */
export async function emitPage({
	dist,
	assets,
	groupBy,
	compress = true,
	xz = false,
	singleFile = false,
	toWebp = false,
	webpLossless = true,
	webpQuality = 90,
}) {
	if (!dist) throw new Error('emitPage needs the dist folder of a vite build');
	const compiled = assets
		? await compileResources({ from: assets, to: join(dist, 'assets'), groupBy, toWebp, webpLossless, webpQuality })
		: { groups: [], rawBytes: 0, embeddedBytes: 0, webpConverted: 0 };

	const html = await readFile(join(dist, 'index.html'), 'utf8');
	const classic = toClassicScript(html);
	if (!classic) {
		throw new Error('no <script type="module"> entry tag found in the vite output - did the build succeed?');
	}
	const tag = `<script defer src="${classic.src}"></script>`;
	const assetTags = compiled.groups.map((g) => `\t<script defer src="./assets/${g.name}.js"></script>`).join('\n');
	//defer preserves document order, so the asset scripts still run before the game does
	const page = assetTags ? classic.html.replace(tag, `${assetTags}\n\t${tag}`) : classic.html;
	await writeFile(join(dist, 'index.html'), page, 'utf8');

	//vite leaves a .vite folder of build metadata that the shipped folder does not need
	await rm(join(dist, '.vite'), { recursive: true, force: true });

	const compressed = compress ? await compressDist(dist, { xz }) : null;
	const single = singleFile ? await buildSingleFile({ dist, ...(singleFile === true ? {} : singleFile) }) : null;
	return { dist, entry: classic.src, ...compiled, compressed, single };
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';

async function main(argv) {
	const folder = argv.find((arg) => !arg.startsWith('--'));
	if (!folder) {
		console.error('usage: mwg-emit <project folder> [--dist=<dir>] [--assets=<dir>] [options]');
		process.exit(1);
	}
	const option = (name) => argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
	const value = (name) => option(name)?.split('=').slice(1).join('=') || undefined;
	const root = resolvePath(folder);
	const dist = resolvePath(value('dist') ?? join(root, 'dist'));
	const assetsDir = resolvePath(value('assets') ?? join(root, 'assets'));
	const hasAssets = (await stat(assetsDir).catch(() => null))?.isDirectory() ?? false;

	const webpLossyFlag = option('webp-lossy');
	const brotliFlag = option('single-file-brotli');
	const compressFlag = option('single-file-compress');
	const levelFlag = brotliFlag ?? compressFlag;
	const singleFile = argv.includes('--single-file') && {
		compress: Boolean(brotliFlag || compressFlag),
		algorithm: brotliFlag ? 'brotli' : 'gzip',
		level: levelFlag?.includes('=') ? Number(levelFlag.split('=')[1]) : undefined,
	};

	const result = await emitPage({
		dist,
		assets: hasAssets ? assetsDir : undefined,
		//a flat assets folder becomes one script, whatever its subfolders
		groupBy: () => 'assets',
		compress: !(argv.includes('--no-compress') || process.env.MWG_NO_COMPRESS === '1'),
		xz: argv.includes('--xz'),
		singleFile,
		toWebp: argv.includes('--to-webp'),
		webpLossless: !webpLossyFlag,
		webpQuality: webpLossyFlag?.includes('=') ? Number(webpLossyFlag.split('=')[1]) : 90,
	});

	console.log(`\n  ${dist}`);
	console.log(
		`  index.html + ${result.entry} + ${result.groups.length} asset script(s), ${kb(result.rawBytes)} of assets`,
	);
	if (argv.includes('--to-webp')) {
		console.log(
			`  ${result.webpConverted} image(s) converted to WebP (${webpLossyFlag ? 'lossy' : 'lossless'}), ` +
				`${kb(result.rawBytes)} -> ${kb(result.embeddedBytes)} embedded`,
		);
	}
	console.log('  open index.html directly - no server needed');
	if (result.compressed) {
		for (const row of result.compressed) {
			const parts = [`${row.file}: ${kb(row.raw)}`];
			if (row.gzip) parts.push(`gz ${kb(row.gzip)}`);
			if (row.brotli) parts.push(`br ${kb(row.brotli)}`);
			if (row.xz) parts.push(`xz ${kb(row.xz)}`);
			console.log('  ' + parts.join(', '));
		}
	} else {
		console.log('  (compression skipped)');
	}
	if (result.single) {
		const { algorithm, level } = singleFile;
		console.log(
			`\n  ${result.single.path}`,
			`\n  ${result.single.scripts} script(s) inlined, ${kb(result.single.rawBytes)} raw -> ${kb(result.single.embeddedBytes)} embedded` +
				(singleFile.compress
					? ` (${algorithm} level ${level ?? (algorithm === 'brotli' ? 11 : 9)})`
					: ' (uncompressed)'),
		);
		console.log('  one file, no server, no sibling script - open it directly');
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
	await main(process.argv.slice(2));
