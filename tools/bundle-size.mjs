#!/usr/bin/env node
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The bundle-size budget: the rendering-backend policy weighs bundle cost, and this is the
 * number it weighs. Here it records the classic global build (the one file a script-tag player
 * downloads, raw and gzipped) and the whole published `dist` tree, source maps excluded so
 * the separate map-files decision cannot perturb it.
 *
 * `npm run size:check` fails when either grows past `MWG_SIZE_TOLERANCE` (default 2%) over
 * the committed baseline; `npm run size:update` rewrites the baseline after a deliberate
 * growth, the same "commit the new number on purpose" shape `npm run api:report` uses.
 * Run `npm run build` first.
 *
 * A game uses the same gate on its own build (item 386): `mwg-size dist` measures every file a
 * player receives, raw and gzipped, plus their total, against `size-budget.json` beside the
 * project (`--baseline=` to move it, `--update` to write it on purpose). A page that grows past
 * the tolerance fails the game's CI, which matters most for a player on a phone.
 */

/** every file under `dir`, recursively */
function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

/**
 * Raw and gzipped bytes of every file a player receives from a finished build, keyed by path,
 * plus `total`. Source maps, precompressed siblings and SBOMs are left out: none of them is
 * what the page loads.
 */
export function measureBuild(dist) {
	const current = {};
	let raw = 0;
	let gzip = 0;
	for (const file of walk(dist).sort()) {
		const path = relative(dist, file).split(sep).join('/');
		if (/\.(map|gz|br|xz)$/.test(path) || path.endsWith('.cdx.json')) continue;
		const bytes = readFileSync(file);
		const entry = { raw: bytes.length, gzip: gzipSync(bytes).length };
		current[path] = entry;
		raw += entry.raw;
		gzip += entry.gzip;
	}
	current.total = { raw, gzip };
	return current;
}

/**
 * Compares `current` with `baseline` metric by metric: a metric more than `tolerance` over its
 * baseline fails, one with no baseline (a new file) is reported and passes, since the total
 * still counts it. Returns the report lines and whether anything is over.
 */
export function compareBudget(current, baseline, tolerance = 0.02) {
	const lines = [];
	let failed = false;
	for (const [name, metrics] of Object.entries(current)) {
		for (const [metric, bytes] of Object.entries(metrics)) {
			const before = baseline[name]?.[metric];
			if (before === undefined) {
				lines.push(`${name} ${metric}: ${bytes} B (no baseline)`);
				continue;
			}
			const growth = bytes / before - 1;
			const over = growth > tolerance;
			if (over) failed = true;
			lines.push(
				`${name} ${metric}: ${bytes} B vs ${before} B baseline (${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}%) ${over ? 'OVER' : 'ok'}`,
			);
		}
	}
	return { lines, failed };
}

/** this repository's own budget: the global bundle and the published `dist` tree */
function measureFramework(root) {
	const dist = join(root, 'dist');
	const globalBundle = join(dist, 'mw_games.global.js');
	if (!existsSync(globalBundle)) {
		throw new Error(`no build found at ${relative(root, globalBundle)} - run "npm run build" first`);
	}
	const globalBytes = readFileSync(globalBundle);
	return {
		'mw_games.global.js': { raw: globalBytes.length, gzip: gzipSync(globalBytes).length },
		dist: {
			raw: walk(dist)
				.filter((file) => !file.endsWith('.map'))
				.reduce((sum, file) => sum + statSync(file).size, 0),
		},
	};
}

function main(argv) {
	const tolerance = Number(
		argv.find((a) => a.startsWith('--tolerance='))?.slice(12) ?? process.env.MWG_SIZE_TOLERANCE ?? 0.02,
	);
	const target = argv.find((arg) => !arg.startsWith('--'));
	const root = resolve(import.meta.dirname, '..');
	let current;
	let baselinePath;
	if (target) {
		const dist = resolve(target);
		if (!existsSync(join(dist, 'index.html')))
			throw new Error(`${target} holds no index.html - build the game first`);
		current = measureBuild(dist);
		baselinePath = resolve(argv.find((a) => a.startsWith('--baseline='))?.slice(11) ?? 'size-budget.json');
	} else {
		current = measureFramework(root);
		baselinePath = join(import.meta.dirname, 'bundle-size.json');
	}
	const update = target ? 'mwg-size --update' : 'npm run size:update';

	if (argv.includes('--update') || (target && !existsSync(baselinePath))) {
		writeFileSync(baselinePath, `${JSON.stringify(current, null, '\t')}\n`);
		console.log(`wrote ${relative(process.cwd(), baselinePath)}`);
		for (const [name, metrics] of Object.entries(current)) console.log(`  ${name}: ${JSON.stringify(metrics)}`);
		return;
	}
	const { lines, failed } = compareBudget(current, JSON.parse(readFileSync(baselinePath, 'utf8')), tolerance);
	for (const line of lines) console.log(line);
	if (failed) {
		console.error(
			`bundle grew more than ${(tolerance * 100).toFixed(0)}% - trim it, or run "${update}" and explain the growth in the commit`,
		);
		process.exitCode = 1;
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
