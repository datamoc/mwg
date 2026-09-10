import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The bundle-size budget: the rendering-backend policy weighs bundle cost, and this is the
 * number it weighs. It records the classic global build (the one file a script-tag player
 * downloads, raw and gzipped) and the whole published `dist` tree, source maps excluded so
 * the separate map-files decision cannot perturb it.
 *
 * `npm run size:check` fails when either grows past `MWG_SIZE_TOLERANCE` (default 2%) over
 * the committed baseline; `npm run size:update` rewrites the baseline after a deliberate
 * growth, the same "commit the new number on purpose" shape `npm run api:report` uses.
 * Run `npm run build` first.
 */

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const globalBundle = join(dist, 'mw_games.global.js');
const baselinePath = join(import.meta.dirname, 'bundle-size.json');
const tolerance = Number(process.env.MWG_SIZE_TOLERANCE ?? 0.02);

if (!existsSync(globalBundle)) {
	throw new Error(`no build found at ${relative(root, globalBundle)} - run "npm run build" first`);
}

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

const globalBytes = readFileSync(globalBundle);
const current = {
	'mw_games.global.js': {
		raw: globalBytes.length,
		gzip: gzipSync(globalBytes).length,
	},
	dist: {
		raw: walk(dist)
			.filter((file) => !file.endsWith('.map'))
			.reduce((sum, file) => sum + statSync(file).size, 0),
	},
};

if (process.argv.includes('--update')) {
	writeFileSync(baselinePath, `${JSON.stringify(current, null, '\t')}\n`);
	console.log(`wrote ${relative(root, baselinePath)}`);
	for (const [name, metrics] of Object.entries(current)) console.log(`  ${name}: ${JSON.stringify(metrics)}`);
} else {
	const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
	let failed = false;

	for (const [name, metrics] of Object.entries(current)) {
		for (const [metric, bytes] of Object.entries(metrics)) {
			const before = baseline[name]?.[metric];
			if (before === undefined) continue;

			const growth = bytes / before - 1;
			const over = growth > tolerance;
			if (over) failed = true;
			console.log(
				`${name} ${metric}: ${bytes} B vs ${before} B baseline (${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}%) ${over ? 'OVER' : 'ok'}`,
			);
		}
	}

	if (failed) {
		console.error(
			`bundle grew more than ${(tolerance * 100).toFixed(0)}% - trim it, or run "npm run size:update" and explain the growth in the commit`,
		);
		process.exit(1);
	}
}
