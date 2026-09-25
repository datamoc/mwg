import { createHash } from 'node:crypto';

/**
 * The Content-Security-Policy `emitPage` writes into every page it finishes (item 374), as a
 * `<meta http-equiv>` at the top of `<head>`, so a game gets it with no configuration.
 *
 * What it buys, for a page that opens from `file://`: no script from anywhere but the page's own
 * folder and the hashed inline scripts it ships with, no network request except to the
 * endpoints the game declares (`connect`), so a compromised dependency cannot send a save or
 * anything else away, and no exfiltration through an image, font or media URL either, since
 * those only accept `data:`/`blob:`. `base-uri`, `form-action` and `object-src` are `'none'`.
 *
 * `'unsafe-eval'` stays allowed by default, measured rather than assumed: Pixi 8 refuses to start
 * without it ("please use pixi.js/unsafe-eval") unless the game imports `pixi.js/unsafe-eval`,
 * which swaps its generated uniform uploads for slower polyfills. mwg itself never evaluates
 * data, so the eval permission gives nothing to an attacker who does not already have code in
 * the bundle. A game that imports that module passes `eval: false`.
 *
 * @param {string} html the finished page
 * @param {{ connect?: string[], eval?: boolean, scripts?: string[] }} [options] `scripts` are
 *   extra script texts to allow by hash (a single-file loader's unpacked scripts)
 */
export function contentSecurityPolicy(html, { connect = [], eval: allowEval = true, scripts = [] } = {}) {
	const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
	const hashes = [...new Set([...inline, ...scripts].map((text) => `'sha256-${sha256(text)}'`))];
	const directives = {
		'default-src': ["'none'"],
		'script-src': ["'self'", 'file:', ...hashes, ...(allowEval ? ["'unsafe-eval'"] : [])],
		'style-src': ["'self'", 'file:', "'unsafe-inline'"],
		'img-src': ["'self'", 'file:', 'data:', 'blob:'],
		'media-src': ["'self'", 'file:', 'data:', 'blob:'],
		'font-src': ["'self'", 'file:', 'data:'],
		//Pixi loads a `data:` texture through fetch, so `data:` is a connect source
		'connect-src': ['data:', 'blob:', ...connect],
		'worker-src': ['blob:'],
		'base-uri': ["'none'"],
		'form-action': ["'none'"],
		'object-src': ["'none'"],
	};
	return Object.entries(directives)
		.map(([name, values]) => `${name} ${values.join(' ')}`)
		.join('; ');
}

/** `html` with the policy inserted as the first element of `<head>`, replacing an earlier one */
export function withContentSecurityPolicy(html, options) {
	const cleaned = html.replace(/[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/i, '');
	const policy = contentSecurityPolicy(cleaned, options);
	const meta = `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, '&quot;')}">`;
	if (!/<head[^>]*>/i.test(cleaned)) throw new Error('page has no <head> to carry a Content-Security-Policy');
	return cleaned.replace(/<head[^>]*>/i, (head) => `${head}\n\t${meta}`);
}

function sha256(text) {
	return createHash('sha256').update(text, 'utf8').digest('base64');
}
