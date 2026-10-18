#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { realpathSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, DEFAULT_MIME } from './compile-resources.mjs';

/**
 * Reports what a built page actually ships, so a game can see where its bytes go.
 *
 * Two halves, both deterministic (sorted paths, fixed compression settings, hashes):
 *
 *   - `files`: every file under `dist` (precompressed `.gz`/`.br`/`.xz` siblings
 *     excluded - they are derived artifacts, and the gzip/brotli columns already count
 *     them) with raw, gzip (level 9) and brotli (quality 11) weights plus its share of
 *     the compressed page, the same settings `tools/compress-dist.mjs` writes with;
 *   - `assets`: every source file the asset folder embeds (the root `credits.json`
 *     and unknown extensions excluded, exactly the files `compileResources` skips),
 *     with duplicates grouped by SHA-256 so an asset embedded twice is visible.
 *
 * Shipped as `@datamoc/mwg/tools/asset-report` (`assetReport(options)`, what the
 * flags below map onto) and as the `mwg-assets` command.
 *
 * usage: mwg-assets <dist folder> [--assets=<dir>] [--json=<report file>]
 */

const DERIVED_SIBLINGS = new Set(['.gz', '.br', '.xz']);

export function fingerprint(data) {
	return createHash('sha256').update(data).digest('hex');
}

export function compressedSizes(data) {
	return {
		gzip: gzipSync(data, { level: 9 }).length,
		brotli: brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
	};
}

function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * @param options.dist the built page folder to measure
 * @param options.assets the asset source folder to inventory (skipped when absent)
 * @param options.mime extension to MIME type, merged over the compile defaults, so a
 *   game embedding extra types reports the same set the build embeds
 * @returns the sorted files, sources, duplicate groups and totals described above
 */
export async function assetReport({ dist, assets, mime = {} } = {}) {
	if (!dist || !isDirectory(dist))
		throw new Error(`assetReport needs the dist folder of a built page, got "${dist}"`);
	if (assets !== undefined && !isDirectory(assets))
		throw new Error(`assetReport needs a readable assets folder, got "${assets}"`);

	const files = [];
	for await (const file of walk(dist)) {
		if (DERIVED_SIBLINGS.has(extname(file).toLowerCase())) continue;
		const data = await readFile(file);
		const { gzip, brotli } = compressedSizes(data);
		files.push({
			path: relative(dist, file).split(sep).join('/'),
			raw: data.length,
			gzip,
			brotli,
			sha256: fingerprint(data),
			share: 0,
		});
	}
	files.sort((a, b) => (a.path < b.path ? -1 : 1));
	const totalGzip = files.reduce((sum, file) => sum + file.gzip, 0);
	for (const file of files) file.share = totalGzip ? file.gzip / totalGzip : 0;

	const sources = [];
	const duplicates = [];
	if (assets !== undefined) {
		const types = { ...DEFAULT_MIME, ...mime };
		const creditsFile = join(assets, 'credits.json');
		const byHash = new Map();
		for await (const file of walk(assets)) {
			if (file === creditsFile) continue;
			if (!types[extname(file).toLowerCase()]) continue;
			const data = await readFile(file);
			const sha256 = fingerprint(data);
			const key = relative(assets, file).split(sep).join('/');
			sources.push({ path: key, raw: data.length, sha256 });
			const group = byHash.get(sha256) ?? [];
			group.push(key);
			byHash.set(sha256, group);
		}
		sources.sort((a, b) => (a.path < b.path ? -1 : 1));
		for (const group of byHash.values()) if (group.length > 1) duplicates.push([...group].sort());
		duplicates.sort((a, b) => (a[0] < b[0] ? -1 : 1));
	}

	return {
		dist,
		files,
		assets: sources,
		duplicates,
		totals: {
			files: files.length,
			raw: files.reduce((sum, file) => sum + file.raw, 0),
			gzip: totalGzip,
			brotli: files.reduce((sum, file) => sum + file.brotli, 0),
			assetFiles: sources.length,
			assetRaw: sources.reduce((sum, source) => sum + source.raw, 0),
		},
	};
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const percent = (share) => (share * 100).toFixed(1) + '%';

async function main(argv) {
	const folder = argv.find((arg) => !arg.startsWith('--'));
	if (!folder) {
		console.error('usage: mwg-assets <dist folder> [--assets=<dir>] [--json=<report file>]');
		process.exit(1);
	}
	const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
	const report = await assetReport({ dist: folder, assets: value('assets') });

	console.log(`\n  ${report.dist}`);
	for (const file of report.files) {
		console.log(
			`  ${file.path.padEnd(40)}${kb(file.raw).padStart(10)}  gz ${kb(file.gzip).padStart(10)}  br ${kb(file.brotli).padStart(10)}  ${percent(file.share).padStart(6)}`,
		);
	}
	console.log(
		`  ${report.totals.files} file(s), ${kb(report.totals.raw)} raw -> ${kb(report.totals.gzip)} gz / ${kb(report.totals.brotli)} br`,
	);
	if (report.assets.length) {
		console.log(`  ${report.totals.assetFiles} embedded asset(s), ${kb(report.totals.assetRaw)} raw`);
		for (const group of report.duplicates) console.log(`  duplicate: ${group.join(' == ')}`);
	}
	const json = value('json');
	if (json) {
		await writeFile(json, JSON.stringify(report, null, 2) + '\n', 'utf8');
		console.log(`  report written to ${json}`);
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
//no top-level await: a vite config loaded as CommonJS has to be able to require() this module
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
	main(process.argv.slice(2)).catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
