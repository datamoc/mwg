import { execFileSync } from 'node:child_process';
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const scripts = {
	'colour-transform': 'example:build',
	interface: 'example:ui:build',
	dialogue: 'example:dialogue:build',
	dungeon: 'example:dungeon:build',
	village: 'example:village:build',
	battle: 'example:battle:build',
	minigame: 'example:minigame:build',
	chess: 'example:chess:build',
	'tower-defense': 'example:tower-defense:build',
	'three-d': 'example:3d:build',
	loading: 'example:loading:build',
	'hello-world': 'example:hello-world:build',
	movement: 'example:movement:build',
	'save-load': 'example:save-load:build',
	audio: 'example:audio:build',
	i18n: 'example:i18n:build',
	'world-transition': 'example:world-transition:build',
	'event-system': 'example:event-system:build',
	headless: 'example:headless:build',
};

for (const [name, script] of Object.entries(scripts)) {
	console.log(`building ${name}...`);
	execFileSync('npm', ['run', script], { cwd: root, stdio: 'inherit', shell: true });

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
}

console.log('\nwebpage/examples/*/ now hold playable builds. Open webpage/examples/index.html to see them.');
