import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { smokePage } from './browser-smoke.mjs';

/**
 * The per-pull-request visual smoke: open one built example from `file://` in a real headless
 * Chrome and assert it actually rendered.
 *
 * A typechecker cannot see a window placed off-screen or text drawn over itself, which is the
 * class of bug 1.0 must not ship - the same gap `DEVELOPMENT.md`'s verification loop names.
 * This catches the coarse half of that class (a page that throws on load, or a canvas that
 * paints nothing) and writes a screenshot a reviewer can open, instead of only describing what
 * a screenshot would probably show. `browser-smoke.mjs` holds the Chrome-and-pixels half, so
 * the published-package smoke judges a page the same way.
 *
 * Usage: `node tools/visual-smoke.mjs [examples/<name>/dist/index.html] [key-to-press]`
 */

const root = resolve(import.meta.dirname, '..');
const relativePage = process.argv[2] ?? 'examples/interface/dist/index.html';
//an example whose interesting layout only appears after a keypress (the interface example's
//windowed screens) can name that key, so the screenshot shows the windows
const keyToPress = process.argv[3] ?? null;

const screenshot = join(
	root,
	'benchmark-results',
	'visual-smoke',
	relativePage.replace(/[\\/]/g, '-').replace(/\.html$/, '.png'),
);

const result = await smokePage({
	url: pathToFileURL(resolve(root, relativePage)).href,
	screenshot,
	keyToPress,
});

console.log(JSON.stringify(result, null, 2));
