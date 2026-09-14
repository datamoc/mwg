import { readFile, writeFile } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

/**
 * Turns an `emit-page.mjs` output folder (`index.html` + sibling asset/bundle `.js` files)
 * into one genuinely standalone HTML file with no sibling script at all - roadmap item 349,
 * the "single-file" leg of the build-options matrix `emit-page.mjs --single-file` exposes.
 *
 * The existing multi-file output already opens by double-clicking (that's the whole point of
 * `tools/compile-resources.mjs` and `tools/classic-html.mjs`), but it is still an `index.html`
 * plus N `.js` files that have to travel together. This inlines every `<script src>` the page
 * loads directly into the page, in the same order, so the folder can be reduced to one file
 * before it is shared or archived.
 *
 * Compression (`compress: true`) gzips each script's source before it is base64-embedded, and
 * unpacks it at load with the browser's own `DecompressionStream('gzip')` - a real Web
 * Streams API, not a shipped decoder. That beats a pure-JS decompressor such as `js-lzma` (the
 * roadmap item's other candidate) on every axis that matters here: it adds zero bytes to the
 * page, needs no license or maintenance, and gzip is exactly what `tools/compress-dist.mjs`
 * already uses for the server-negotiated path, so the project only carries one compression
 * story. The one real cost is browser support: `DecompressionStream` is unavailable on Safari
 * before 16.4 and a handful of older engines, where the bootstrap throws a clear error rather
 * than silently failing - `compress: false` (the default) has no such requirement, since it is
 * just base64, which every browser this project targets can decode.
 *
 * Decoding is async even when uncompressed (kept uniform, and `atob` on a very large payload
 * still benefits from not blocking the parser), so a splash screen (`splash: true`, the
 * default) covers the page until every script has run. It is deliberately minimal - inline
 * styles and a CSS spinner, no asset of its own - since this is a framework-level fallback a
 * game is free to replace, not a themed loading screen.
 *
 * @param {object} options
 * @param {string} options.dist path to the folder `emit-page.mjs` already wrote
 * @param {boolean} [options.compress] gzip each inlined script (default false)
 * @param {number} [options.level] gzip level 1-9 when `compress` is set (default 9)
 * @param {boolean} [options.splash] show a splash screen while scripts decode (default true)
 * @param {string} [options.output] output file name, written inside `dist` (default
 *   `standalone.html`) - additive, so the existing multi-file `index.html` is untouched
 * @returns {Promise<{path: string, scripts: number, rawBytes: number, embeddedBytes: number}>}
 */
export async function buildSingleFile({ dist, compress = false, level = 9, splash = true, output = 'standalone.html' } = {}) {
	if (!dist) throw new Error('buildSingleFile needs a `dist` folder');

	const htmlPath = join(dist, 'index.html');
	const html = await readFile(htmlPath, 'utf8');

	const scriptTag = /[ \t]*<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>\n?/g;
	const sources = [];
	let firstMatchIndex = -1;
	let match;
	while ((match = scriptTag.exec(html))) {
		if (firstMatchIndex === -1) firstMatchIndex = match.index;
		sources.push(match[1]);
	}
	if (sources.length === 0) {
		throw new Error(`${htmlPath}: no <script src="..."> tags found - is this an emit-page.mjs output folder?`);
	}

	let rawBytes = 0;
	let embeddedBytes = 0;
	const payloads = [];
	for (const src of sources) {
		const filePath = join(dist, src.replace(/^\.\//, ''));
		const code = await readFile(filePath, 'utf8');
		rawBytes += Buffer.byteLength(code, 'utf8');
		const bytes = compress ? gzipSync(Buffer.from(code, 'utf8'), { level }) : Buffer.from(code, 'utf8');
		const b64 = bytes.toString('base64');
		embeddedBytes += b64.length;
		payloads.push({ name: basename(src), b64 });
	}

	const withoutScripts = html.replace(scriptTag, '').replace(/\n{3,}/g, '\n\n');
	const bootstrap = renderBootstrap(payloads, compress);
	const splashCss = splash ? renderSplashStyle() : '';
	const splashHtml = splash ? renderSplashMarkup() : '';

	let page = withoutScripts;
	page = page.includes('</head>') ? page.replace('</head>', `${splashCss}</head>`) : splashCss + page;
	page = page.replace(/(<body[^>]*>)/, `$1\n${splashHtml}`);
	page = page.replace(/<\/body>/, `\t${bootstrap}\n</body>`);

	const outPath = join(dist, output);
	await writeFile(outPath, page, 'utf8');

	return { path: outPath, scripts: payloads.length, rawBytes, embeddedBytes };
}

function renderSplashStyle() {
	return (
		'\t<style id="mwg-splash-style">\n' +
		'\t\t#mwg-splash{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
		'flex-direction:column;gap:12px;background:#14161c;color:#eee;font:14px sans-serif;z-index:9999}\n' +
		'\t\t#mwg-splash .mwg-spinner{width:28px;height:28px;border-radius:50%;' +
		'border:3px solid rgba(255,255,255,0.25);border-top-color:#fff;animation:mwg-spin 0.8s linear infinite}\n' +
		'\t\t@keyframes mwg-spin{to{transform:rotate(360deg)}}\n' +
		'\t</style>\n'
	);
}

function renderSplashMarkup() {
	return '\t<div id="mwg-splash"><div class="mwg-spinner"></div><div>Loading...</div></div>\n';
}

function renderBootstrap(payloads, compress) {
	const json = JSON.stringify(payloads);
	return (
		'<script>\n' +
		'(function(){\n' +
		// Seeded synchronously, before any decoding starts: several examples' own dev/build
		// detection scripts (see examples/*/index.html) check `window.__MWG_ASSETS__` at
		// DOMContentLoaded to tell a built page from the unbuilt dev template, a check that only
		// works because the multi-file build's asset script is a *deferred* <script src>, which
		// finishes before that event. This bootstrap decodes asynchronously instead, so without
		// this line those checks would fire too early and show a false "not built" notice. The
		// compiled asset script itself creates this object with the same `||` guard once it
		// actually runs (see tools/compile-resources.mjs) - this only moves that existence
		// earlier, not the entries themselves, which are still filled in strictly before the
		// game bundle that reads them executes.
		'\twindow.__MWG_ASSETS__=window.__MWG_ASSETS__||{};\n' +
		`\tvar PAYLOADS=${json};\n` +
		`\tvar COMPRESSED=${compress ? 'true' : 'false'};\n` +
		'\tfunction b64ToBytes(b64){var bin=atob(b64);var bytes=new Uint8Array(bin.length);' +
		'for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}\n' +
		'\tfunction decodeText(bytes){\n' +
		'\t\tif(!COMPRESSED)return Promise.resolve(new TextDecoder().decode(bytes));\n' +
		'\t\tif(typeof DecompressionStream==="undefined")return Promise.reject(new Error(' +
		'"mwg standalone build: this browser has no DecompressionStream, needed to unpack the compressed bundle. ' +
		'Use the multi-file build instead."));\n' +
		'\t\tvar stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));\n' +
		'\t\treturn new Response(stream).arrayBuffer().then(function(buf){return new TextDecoder().decode(buf);});\n' +
		'\t}\n' +
		'\tfunction removeSplash(){var el=document.getElementById("mwg-splash");if(el&&el.parentNode)el.parentNode.removeChild(el);}\n' +
		'\tfunction runNext(i){\n' +
		'\t\tif(i>=PAYLOADS.length){removeSplash();return;}\n' +
		'\t\tvar p=PAYLOADS[i];\n' +
		'\t\tdecodeText(b64ToBytes(p.b64)).then(function(code){\n' +
		'\t\t\tvar s=document.createElement("script");s.text=code;document.body.appendChild(s);\n' +
		'\t\t\trunNext(i+1);\n' +
		'\t\t}).catch(function(err){\n' +
		'\t\t\tremoveSplash();\n' +
		'\t\t\tconsole.error("mwg standalone build failed to load "+p.name, err);\n' +
		'\t\t});\n' +
		'\t}\n' +
		'\trunNext(0);\n' +
		'})();\n' +
		'</script>'
	);
}

// ---------------------------------------------------------------- CLI

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	const args = process.argv.slice(2);
	const dist = args[0];
	if (!dist || dist.startsWith('--')) {
		console.error(
			'usage: node tools/single-file.mjs <dist folder> [--compress[=level]] [--no-splash] [--output name.html]',
		);
		process.exit(1);
	}
	const compressFlag = args.find((a) => a === '--compress' || a.startsWith('--compress='));
	const compress = Boolean(compressFlag);
	const level = compressFlag && compressFlag.includes('=') ? Number(compressFlag.split('=')[1]) : 9;
	const splash = !args.includes('--no-splash');
	const outputIndex = args.indexOf('--output');
	const output = outputIndex !== -1 ? args[outputIndex + 1] : 'standalone.html';

	const result = await buildSingleFile({ dist: resolve(dist), compress, level, splash, output });
	const kb = (n) => (n / 1024).toFixed(1) + ' KB';
	console.log(`\n  ${result.path}`);
	console.log(
		`  ${result.scripts} script(s) inlined, ${kb(result.rawBytes)} raw -> ${kb(result.embeddedBytes)} embedded` +
			(compress ? ` (gzip level ${level})` : ' (uncompressed)'),
	);
	console.log('  one file, no server, no sibling script - open it directly');
}
