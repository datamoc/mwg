import { execFile } from 'node:child_process';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

/**
 * Builds the example games and copies each one's `dist/` into
 * `webpage/examples/<name>/`, so the website's Examples page has something to embed.
 *
 * The copies are generated output, not source: same rule as `examples/*\/dist` itself
 * (see .gitignore). Run this before viewing or deploying the site; it is not run as part
 * of `npm run build`, because the website is not part of the published package.
 *
 * Alongside the build, each example's own `.ts` source (`main.ts`, plus any sibling helper
 * like dungeon's `combat.ts`) is written as `source.js`: a plain `window.MWG_EXAMPLE_SOURCE =
 * "..."` assignment, loaded the same way the compiled `game.js` is, so `view.html` can show
 * "the code below the example" without a `fetch()` that `file://` would block.
 *
 * Builds run concurrently down a capped lane queue (vite builds are CPU-heavy, so lanes
 * default to the machine's parallelism capped at 4): process-level parallelism for the
 * build farm, beside the `threads.spawn` parallelism the chess example itself uses
 * in the page. Pass example names to rebuild only those (`node
 * tools/build-webpage-examples.mjs chess`), and `--jobs=N` to resize the lanes.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const run = promisify(execFile);

const scripts = {
	'colour-transform': 'example:build',
	interface: 'example:ui:build',
	dialogue: 'example:dialogue:build',
	dungeon: 'example:dungeon:build',
	village: 'example:village:build',
	battle: 'example:battle:build',
	minigame: 'example:minigame:build',
	'multi-turn-beam': 'example:multi-turn-beam:build',
	chess: 'example:chess:build',
	'tower-defense': 'example:tower-defense:build',
	'three-d': 'example:3d:build',
	loading: 'example:loading:build',
	'hello-world': 'example:hello-world:build',
	movement: 'example:movement:build',
	'save-load': 'example:save-load:build',
	audio: 'example:audio:build',
	i18n: 'example:i18n:build',
	'string-editor': 'example:string-editor:build',
	'world-transition': 'example:world-transition:build',
	'event-system': 'example:event-system:build',
	headless: 'example:headless:build',
	'mwl-content': 'example:mwl-content:build',
};

function defaultJobs() {
	try {
		const parallelism = globalThis.process?.getBuiltinModule?.('node:os')?.availableParallelism?.();
		if (typeof parallelism === 'number' && Number.isInteger(parallelism) && parallelism > 0) {
			return Math.min(parallelism, 4);
		}
	} catch {
		//a build farm must never fail for lack of a hint about its own host
	}
	return 2;
}

const args = process.argv.slice(2);
const jobsArg = args.find((arg) => arg.startsWith('--jobs='));
const jobs = jobsArg ? Math.max(1, Math.floor(Number(jobsArg.slice(7)))) : defaultJobs();
if (!Number.isInteger(jobs)) {
	console.error('jobs must be a positive integer, e.g. --jobs=4');
	process.exit(1);
}
const wanted = args.filter((arg) => !arg.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(scripts);
for (const name of names) {
	if (!scripts[name]) {
		console.error(`unknown example: "${name}" (known: ${Object.keys(scripts).join(', ')})`);
		process.exit(1);
	}
}

async function buildOne(name) {
	const started = Date.now();
	console.log(`building ${name}...`);
	try {
		await run('npm', ['run', scripts[name]], { cwd: root, shell: process.platform === 'win32' });
	} catch (error) {
		return { name, ok: false, output: [error.stdout, error.stderr].filter(Boolean).join('\n') };
	}

	const from = join(root, 'examples', name, 'dist');
	const to = join(root, 'webpage', 'examples', name);
	await rm(to, { recursive: true, force: true });
	await cp(from, to, { recursive: true });

	const exampleDir = join(root, 'examples', name);
	const sourceFiles = (await readdir(exampleDir))
		.filter((file) => file.endsWith('.ts') && file !== 'vite.config.ts')
		.sort((a, b) => (a === 'main.ts' ? -1 : b === 'main.ts' ? 1 : a.localeCompare(b)));
	const source = (
		await Promise.all(
			sourceFiles.map(async (file) => {
				const contents = await readFile(join(exampleDir, file), 'utf8');
				const heading = sourceFiles.length > 1 ? `// ---- ${file} ----\n` : '';
				return heading + contents;
			}),
		)
	).join('\n');
	await writeFile(join(to, 'source.js'), `window.MWG_EXAMPLE_SOURCE = ${JSON.stringify(source)};\n`);
	console.log(`built ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
	return { name, ok: true, output: '' };
}

let next = 0;
const width = Math.max(1, Math.min(jobs, names.length));
const results = [];
await Promise.all(
	Array.from({ length: width }, async () => {
		for (;;) {
			const index = next++;
			if (index >= names.length) return;
			results.push(await buildOne(names[index]));
		}
	}),
);

const failures = results.filter((result) => !result.ok);
for (const failure of failures) {
	console.error(`\n${failure.name} failed:\n${failure.output.slice(-4000)}`);
}
if (failures.length) process.exit(1);

console.log('\nwebpage/examples/*/ now hold playable builds. Open webpage/examples/index.html to see them.');
