import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Builds every example page, in the order `package.json` lists them.
 *
 * `npm run check` typechecks all of them and the per-pull-request visual smoke builds one,
 * but a broken `vite.config.ts` or an `emit-page`/`compile-resources` regression in any other
 * example would otherwise ship unnoticed, because CI only builds the ones the benchmarks and
 * the smoke happen to name. `npm run assets` runs first, since every example needs the
 * generated tiles and sounds.
 */

const root = resolve(import.meta.dirname, '..');
const { scripts } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const names = Object.keys(scripts).filter((name) => /^example:(?:[a-z0-9-]+:)?build$/.test(name));

if (names.length === 0) throw new Error('no example build scripts found in package.json');

console.log(`building ${names.length} examples`);
for (const name of names) {
	console.log(`\n== ${name} ==`);
	const result = spawnSync('npm', ['run', name], { cwd: root, stdio: 'inherit', shell: true });
	if (result.status !== 0) {
		console.error(`\n${name} failed`);
		process.exit(result.status ?? 1);
	}
}

console.log(`\nall ${names.length} examples built`);
