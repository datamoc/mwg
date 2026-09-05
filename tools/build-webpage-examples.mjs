import { execFileSync } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Builds the example games and copies each one's `dist/` into
 * `webpage/examples/<name>/`, so the website's Examples page has something to embed.
 *
 * The copies are generated output, not source: same rule as `examples/*\/dist` itself
 * (see .gitignore). Run this before viewing or deploying the site; it is not run as part
 * of `npm run build`, because the website is not part of the published package.
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
}

console.log('\nwebpage/examples/*/ now hold playable builds. Open webpage/examples/index.html to see them.');
