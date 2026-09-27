import { readFile, writeFile } from 'node:fs/promises';
import { relative, extname, basename } from 'node:path';
import { gzip, brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
import { availableParallelism } from 'node:os';
import { spawnSync } from 'node:child_process';
import { walk } from './compile-resources.mjs';

/**
 * Writes precompressed siblings (`.gz`, `.br`, optionally `.xz`) next to a build's
 * text files, for servers that can serve them with a `Content-Encoding` header.
 *
 * The originals stay exactly where they are, so a page opened from `file://` keeps
 * working with no server: the compressed files are only ever picked up when a server
 * negotiates them (nginx `gzip_static`, Apache `mod_rewrite`, a CDN, Capacitor live
 * reload, and so on). Nothing in the page references them.
 *
 * Only Node built-ins are used, so this adds no dependency. Gzip (level 9) is the
 * universal fallback every server understands; brotli (quality 11) is smaller and served
 * by preference where the client offers `br`. LZMA2 (`.xz`, via the system `xz` binary
 * when present, opt-in with `--xz`) compresses a little further, but browsers do not
 * decode `xz` as a `Content-Encoding`, so it is an offline archive format, not something
 * a server can negotiate: `gz` stays the fallback.
 *
 * usage: node tools/compress-dist.mjs <dist folder> [--xz] [--no-gzip] [--no-brotli]
 *
 * Files compress in parallel over async `zlib` (the libuv threadpool, not worker
 * threads): one chain per job over a shared queue, defaulting to MWG_COMPRESS_JOBS
 * when it names a positive integer, else the machine's thread count, else 4. Rows
 * land by index, so the report keeps walk order no matter who finishes first.
 */

const TEXT_EXTENSIONS = new Set(['.js', '.html', '.css', '.svg', '.json', '.txt', '.map']);
const ALREADY_COMPRESSED = new Set([
	'.gz',
	'.br',
	'.xz',
	'.png',
	'.jpg',
	'.jpeg',
	'.webp',
	'.gif',
	'.wav',
	'.ogg',
	'.mp3',
	'.ttf',
	'.woff2',
]);
const MIN_BYTES = 1024;

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/**
 * How many files `compressDist` works on at once: `MWG_COMPRESS_JOBS` when it names
 * a positive integer, else the machine's own thread count, else 4. An env knob rather
 * than a constant so a loaded CI host can turn one build down without editing anything.
 */
export function compressJobs() {
	const raw = Number(process.env.MWG_COMPRESS_JOBS);
	if (Number.isInteger(raw) && raw > 0) return raw;
	try {
		const parallel = availableParallelism();
		if (Number.isInteger(parallel) && parallel > 0) return parallel;
	} catch {
		//a build tool must never fail for lack of a hint about its own host
	}
	return 4;
}

/** true when the system `xz` binary (LZMA2) is available for the opt-in archive pass */
export function hasXz() {
	try {
		const found = spawnSync('xz', ['--version'], { stdio: 'ignore' });
		return found.status === 0;
	} catch {
		return false;
	}
}

function compressXz(data) {
	const out = spawnSync('xz', ['-c', '-9'], { input: data });
	if (out.status !== 0 || !out.stdout) return undefined;
	return out.stdout;
}

/**
 * Writes sibling files *into the folder it is given*: each `<file>.gz`/`.br`/`.xz` appears
 * beside its original inside `dir`, which is rewritten in place, with no separate output
 * directory. The originals themselves are never modified, so a caller whose `dist` is also
 * what it publishes should still hand this a copy.
 *
 * @param dir folder to compress, normally an example's `dist`
 * @param options.gzip write `.gz` siblings (default true)
 * @param options.brotli write `.br` siblings (default true)
 * @param options.xz also write `.xz` siblings where smaller (default false, needs `xz`)
 * @param options.jobs files to compress at once (default `compressJobs()`)
 * @returns one row per file considered, with the sizes actually written, in walk order
 */
export async function compressDist(dir, { gzip = true, brotli = true, xz = false, jobs = compressJobs() } = {}) {
	const candidates = [];
	for await (const file of walk(dir)) {
		const ext = extname(file).toLowerCase();
		if (!TEXT_EXTENSIONS.has(ext) || ALREADY_COMPRESSED.has(ext)) continue;
		candidates.push(file);
	}
	const wantXz = xz && hasXz();
	const lanes = Math.max(1, Math.min(Math.floor(jobs) || 1, Math.max(candidates.length, 1)));
	const rows = new Array(candidates.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: lanes }, async () => {
			for (;;) {
				const index = next++;
				if (index >= candidates.length) return;
				rows[index] = await compressOne(dir, candidates[index], { gzip, brotli, wantXz });
			}
		}),
	);
	return rows.filter((row) => row !== undefined);
}

/** gzip and brotli of one file, or undefined when it is too small to bother with */
async function compressOne(dir, file, { gzip, brotli, wantXz }) {
	const data = await readFile(file);
	if (data.length < MIN_BYTES) return undefined;
	const row = { file: relative(dir, file), raw: data.length, gzip: 0, brotli: 0, xz: 0 };
	if (gzip) {
		const zipped = await gzipAsync(data, { level: 9 });
		if (zipped.length < data.length) {
			await writeFile(file + '.gz', zipped);
			row.gzip = zipped.length;
		}
	}
	if (brotli) {
		const squeezed = await brotliAsync(data, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
		});
		if (squeezed.length < data.length) {
			await writeFile(file + '.br', squeezed);
			row.brotli = squeezed.length;
		}
	}
	if (wantXz) {
		//the opt-in archive pass stays synchronous: xz is a child process either way, and
		//it sits outside the measured gzip/brotli path this parallelizes
		const archived = compressXz(data);
		if (archived && archived.length < data.length) {
			await writeFile(file + '.xz', archived);
			row.xz = archived.length;
		}
	}
	return row;
}

const isMain = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));

if (isMain) {
	const [dir, ...flags] = process.argv.slice(2);
	if (!dir) {
		console.error('usage: node tools/compress-dist.mjs <dist folder> [--xz] [--no-gzip] [--no-brotli]');
		process.exit(1);
	}
	const rows = await compressDist(dir, {
		gzip: !flags.includes('--no-gzip'),
		brotli: !flags.includes('--no-brotli'),
		xz: flags.includes('--xz'),
	});
	const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' KB';
	for (const row of rows) {
		const parts = [`${row.file.padEnd(36)}${kb(row.raw)}`];
		if (row.gzip) parts.push(`gz:${kb(row.gzip)}`);
		if (row.brotli) parts.push(`br:${kb(row.brotli)}`);
		if (row.xz) parts.push(`xz:${kb(row.xz)}`);
		console.log('  ' + parts.join('  '));
	}
	if (flags.includes('--xz') && !hasXz()) {
		console.log('  (xz requested but no `xz` binary found - skipping LZMA2, gz stays the fallback)');
	}
	console.log(`  ${rows.length} file(s) considered in ${relative(process.cwd(), dir)}`);
}
