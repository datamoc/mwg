import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Rewrites a bundler build's ES-module entry tag to a classic deferred script - the one HTML
 * edit every bundler-based game needs to open its own build by double-clicking, which is why
 * this is shipped rather than left for each game to reinvent (item 306).
 *
 * `type="module"` (and the `crossorigin` a bundler adds alongside it) both stop a `file://`
 * page from running the script; `defer` replaces the deferred-by-default behaviour a module
 * tag had, since a classic script is not deferred on its own and running from `<head>` before
 * `<body>` exists leaves a game with no canvas to attach to. The bundle itself must already be
 * a classic script (an IIFE or UMD build, not further ES module output) - this only touches
 * the tag pointing at it, the same split `mwg`'s own `vite.lib.config.ts` keeps between the
 * library's ES build and its `mwg.global.js` IIFE.
 *
 * Returns `null`, rather than guessing, when `html` carries no such tag - an unbuilt dev
 * template (Vite serves `/src/main.ts` directly, with no `crossorigin`, before a real build
 * emits a hashed asset path) is the case this guards a caller against silently "succeeding" on
 * the wrong file.
 *
 * @example
 * ```js
 * import { readFile, writeFile } from 'node:fs/promises';
 * import { toClassicScript } from '@datamoc/mw_games/tools/classic-html.mjs';
 *
 * const html = await readFile('dist/index.html', 'utf8');
 * const result = toClassicScript(html);
 * if (result) await writeFile('dist/index.html', result.html, 'utf8');
 * ```
 */
export function toClassicScript(html) {
	const scriptTag = /[ \t]*<script\b(?=[^>]*\btype="module")[^>]*\bsrc="([^"]+)"[^>]*><\/script>/;
	const match = scriptTag.exec(html);
	if (!match) return null;
	return { html: html.replace(scriptTag, `<script defer src="${match[1]}"></script>`), src: match[1] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const input = process.argv[2];
	if (!input) {
		console.error('Usage: node tools/classic-html.mjs dist/index.html');
		process.exitCode = 2;
	} else {
		const path = resolve(input);
		const html = await readFile(path, 'utf8');
		const result = toClassicScript(html);
		if (!result) {
			console.error(
				`${input}: no <script type="module" src="..."> entry tag found - is this a built page, ` +
					'not the unbuilt dev template? (a dev template serves its source path directly, ' +
					'with no bundled, hashed asset name yet)',
			);
			process.exitCode = 1;
		} else {
			await writeFile(path, result.html, 'utf8');
			console.log(`${input}: rewrote the ${result.src} entry tag to a classic deferred script`);
		}
	}
}
