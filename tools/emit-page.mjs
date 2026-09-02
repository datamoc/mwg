import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { compileResources } from './compile-resources.mjs';

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
 * usage: node tools/emit-page.mjs <example folder>
 */

const exampleDir = process.argv[2];
if (!exampleDir) {
	console.error('usage: node tools/emit-page.mjs <example folder>');
	process.exit(1);
}

const root = resolvePath(exampleDir);
const dist = join(root, 'dist');
const assetsSource = resolvePath(root, '..', 'assets');

const { groups, rawBytes } = await compileResources({
	from: assetsSource,
	to: join(dist, 'assets'),
	//the example assets sit in one flat folder, so they become one script
	groupBy: () => 'assets',
});

const html = await readFile(join(dist, 'index.html'), 'utf8');

//vite names the entry chunk with a hash, so it is found rather than assumed
const entry = (await readdir(join(dist, 'assets').replace(/assets$/, ''))).find(
	(name) => name.endsWith('.js') && name !== 'assets'
);

const scriptTag = /[ \t]*<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/;
const match = scriptTag.exec(html);

if (!match) {
	throw new Error('no script tag found in the vite output - did the build succeed?');
}

const assetTags = groups.map((g) => `\t<script defer src="./assets/${g.name}.js"></script>`).join('\n');
//defer preserves document order, so the asset scripts still run before the game does
const page = html.replace(scriptTag, `${assetTags}\n\t<script defer src="${match[1]}"></script>`);

await writeFile(join(dist, 'index.html'), page, 'utf8');

//vite leaves a .vite folder of build metadata that the shipped folder does not need
await rm(join(dist, '.vite'), { recursive: true, force: true });

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`\n  ${dist}`);
console.log(`  index.html + ${entry ?? 'bundle'} + ${groups.length} asset script(s), ${kb(rawBytes)} of assets`);
console.log('  open index.html directly - no server needed');
