import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P19, in a consumer's own terms: `package.json`'s `files` list decides what gets installed,
 * but its `exports` map decides what can be *imported*. An exports map blocks every deep path it
 * does not name, so `@datamoc/mw_games/tools/classic-html.mjs` fails with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` while the file itself sits right there in the installed
 * package. That is how a consumer ended up hardcoding a `node_modules/...` path, which then
 * broke when the package was installed under an npm alias (its `tools/emit.mjs` stopped
 * resolving), and how a TypeScript consumer never saw the `.d.mts` files shipped beside these
 * helpers.
 *
 * This guard is deliberately in-repo and cheap: it reads `files` and `exports` from
 * `package.json`, and resolves each subpath through the package's own name. Node's
 * self-referencing goes through the same exports map an installed consumer's import does, so a
 * tool added to `files` without a subpath fails here rather than in someone else's build.
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
	name: string;
	files: string[];
	exports: Record<string, unknown>;
};

/** Shipped tool names, taken from `files` itself rather than a second list free to drift. */
const shipped = pkg.files
	.filter((file) => /^tools\/[^/]+\.mjs$/.test(file))
	.map((file) => file.replace(/^tools\//, '').replace(/\.mjs$/, ''));

/**
 * The names a tool's source exports at the top level, read as text rather than by importing it:
 * one shipped tool (`mwl.mjs`) dispatches its command line when loaded, so importing every
 * candidate to ask what it exports would run a CLI.
 */
function exportedNames(tool: string): string[] {
	const source = readFileSync(join(ROOT, 'tools', `${tool}.mjs`), 'utf8');
	return [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/gm)].map(
		(match) => match[1],
	);
}

test('every shipped tool that exports a value is importable by package specifier', () => {
	const missing = shipped.filter((tool) => exportedNames(tool).length > 0 && !pkg.exports[`./tools/${tool}`]);
	assert.deepEqual(missing, [], `shipped tools with no package subpath: ${missing.join(', ')}`);
});

test('each tools subpath resolves through the package name, carrying the symbols its source exports', async () => {
	for (const tool of shipped) {
		const subpath = `./tools/${tool}`;
		if (!pkg.exports[subpath]) continue;

		const module = (await import(`${pkg.name}/${subpath.slice(2)}`)) as Record<string, unknown>;
		for (const name of exportedNames(tool)) {
			assert.ok(name in module, `${subpath} should export ${name}`);
		}
	}
});

test('the deep .mjs path a consumer tried is refused precisely because it is one', async () => {
	await assert.rejects(() => import(`${pkg.name}/tools/classic-html.mjs`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});

test('the CLI-only tool has no subpath, because importing it would run it', () => {
	// `mwl.mjs` reads process.argv and dispatches at import time and exports nothing, so a
	// subpath would make `import '@datamoc/mw_games/tools/mwl'` print its usage and set an exit
	// code. Its library half is `@datamoc/mw_games/mwl`, which is typed and already exported.
	assert.deepEqual(exportedNames('mwl'), []);
	assert.equal(pkg.exports['./tools/mwl'], undefined);
});

test('every shipped tool with exports also ships the declaration a TypeScript consumer reads', () => {
	const undeclared = shipped.filter(
		(tool) => exportedNames(tool).length > 0 && !pkg.files.includes(`tools/${tool}.d.mts`),
	);
	assert.deepEqual(undeclared, [], `shipped tools with no declaration beside them: ${undeclared.join(', ')}`);
});
