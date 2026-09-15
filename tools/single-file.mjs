import { readFile, writeFile } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
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
 * Compression (`compress: true`) compresses each script's source before it is
 * base64-embedded, and unpacks it at load with the browser's own `DecompressionStream` - a
 * real Web Streams API, not a shipped decoder. That beats a pure-JS decompressor such as
 * `js-lzma` (the roadmap item's other candidate) on every axis that matters here: it adds
 * zero bytes to the page, needs no license or maintenance, and both algorithms below are
 * exactly what `tools/compress-dist.mjs` already writes for the server-negotiated path, so the
 * project only carries one compression story either way.
 *
 * `algorithm: 'gzip'` (the default) is the safer choice for browser reach: `compress: false`
 * has no requirement beyond base64, which every browser this project targets can decode, and
 * gzip's `DecompressionStream('gzip')` has been available since May 2023. `algorithm:
 * 'brotli'` compresses further for the same reason `compress-dist.mjs` prefers it over gzip
 * when a server can negotiate it, and needs `DecompressionStream('br')` - an option this
 * repo's roadmap (item 350) took up expecting broad support, but a real Chrome (153, tested
 * directly in this repo's own verification pass) still throws
 * `Unsupported compression format: 'br'` for both `'br'` and `'brotli'`, so treat brotli here
 * as an advanced, narrower-reach option rather than a safe default until that is re-verified
 * against current browsers - `algorithm: 'gzip'` stays the one every browser this project
 * targets can actually decode today. Either way, the bootstrap throws a clear, actionable
 * error rather than silently failing when the browser's `DecompressionStream` does not support
 * the chosen format.
 *
 * Decoding is async even when uncompressed (kept uniform, and `atob` on a very large payload
 * still benefits from not blocking the parser), so a splash screen (`splash: true`, the
 * default) covers the page until every script has run. It is deliberately minimal - inline
 * styles and a CSS spinner, no asset of its own - since this is a framework-level fallback a
 * game is free to replace, not a themed loading screen.
 *
 * @param {object} options
 * @param {string} options.dist path to the folder `emit-page.mjs` already wrote
 * @param {boolean} [options.compress] compress each inlined script (default false)
 * @param {'gzip'|'brotli'} [options.algorithm] compression algorithm when `compress` is set
 *   (default 'gzip')
 * @param {number} [options.level] gzip level 1-9, or brotli quality 0-11, when `compress` is
 *   set (default 9 for gzip, 11 for brotli)
 * @param {boolean} [options.splash] show a splash screen while scripts decode (default true)
 * @param {string} [options.output] output file name, written inside `dist` (default
 *   `standalone.html`) - a name, not a path: one containing a separator is refused rather than
 *   joined onto `dist`. Additive, so the existing multi-file `index.html` is untouched
 * @returns {Promise<{path: string, scripts: number, rawBytes: number, embeddedBytes: number}>}
 */
export async function buildSingleFile({
	dist,
	compress = false,
	algorithm = 'gzip',
	level,
	splash = true,
	output = 'standalone.html',
} = {}) {
	if (!dist) throw new Error('buildSingleFile needs a `dist` folder');
	if (algorithm !== 'gzip' && algorithm !== 'brotli') {
		throw new Error(`buildSingleFile: algorithm must be 'gzip' or 'brotli', got ${JSON.stringify(algorithm)}`);
	}
	if (/[\\/]/.test(output)) {
		throw new Error(
			'buildSingleFile: `output` is a file name written inside `dist`, not a path, so it cannot ' +
				`contain a separator - got ${JSON.stringify(output)}`,
		);
	}

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

	const compressBytes = (buf) =>
		algorithm === 'brotli'
			? brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: level ?? 11 } })
			: gzipSync(buf, { level: level ?? 9 });

	let rawBytes = 0;
	let embeddedBytes = 0;
	const payloads = [];
	for (const src of sources) {
		const filePath = join(dist, src.replace(/^\.\//, ''));
		const code = await readFile(filePath, 'utf8');
		rawBytes += Buffer.byteLength(code, 'utf8');
		const bytes = compress ? compressBytes(Buffer.from(code, 'utf8')) : Buffer.from(code, 'utf8');
		const b64 = bytes.toString('base64');
		embeddedBytes += b64.length;
		payloads.push({ name: basename(src), b64 });
	}

	const withoutScripts = html.replace(scriptTag, '').replace(/\n{3,}/g, '\n\n');
	const bootstrap = renderBootstrap(payloads, compress ? algorithm : 'none');
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

function renderBootstrap(payloads, algorithm) {
	const json = JSON.stringify(payloads);
	// 'none' | 'gzip' | 'brotli' -> the DecompressionStream format string, or '' for uncompressed
	const streamFormat = algorithm === 'brotli' ? 'br' : algorithm === 'gzip' ? 'gzip' : '';
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
		`\tvar FORMAT=${JSON.stringify(streamFormat)};\n` +
		'\tfunction b64ToBytes(b64){var bin=atob(b64);var bytes=new Uint8Array(bin.length);' +
		'for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}\n' +
		'\tfunction decodeText(bytes){\n' +
		'\t\tif(!FORMAT)return Promise.resolve(new TextDecoder().decode(bytes));\n' +
		// `new DecompressionStream(FORMAT)` throws *synchronously* (a TypeError) when the browser
		// does not support the requested format - it does not reject a promise. A brotli build on
		// a browser without DecompressionStream("br") support hits exactly this: without the
		// try/catch here that throw would escape decodeText's caller entirely, skip the
		// .catch(...) below, and leave the splash screen stuck forever instead of failing visibly.
		'\t\ttry{\n' +
		'\t\t\tif(typeof DecompressionStream==="undefined")throw new Error(' +
		'"mwg standalone build: this browser has no DecompressionStream, needed to unpack the compressed bundle. ' +
		'Use the multi-file build instead.");\n' +
		'\t\t\tvar stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream(FORMAT));\n' +
		'\t\t\treturn new Response(stream).arrayBuffer().then(function(buf){return new TextDecoder().decode(buf);});\n' +
		'\t\t}catch(err){\n' +
		'\t\t\treturn Promise.reject(err);\n' +
		'\t\t}\n' +
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
			'usage: node tools/single-file.mjs <dist folder> [--compress[=level]] [--brotli[=quality]] ' +
				'[--no-splash] [--output name.html]',
		);
		process.exit(1);
	}
	const brotliFlag = args.find((a) => a === '--brotli' || a.startsWith('--brotli='));
	const compressFlag = args.find((a) => a === '--compress' || a.startsWith('--compress='));
	const compress = Boolean(brotliFlag || compressFlag);
	const algorithm = brotliFlag ? 'brotli' : 'gzip';
	const levelFlag = brotliFlag ?? compressFlag;
	const level = levelFlag && levelFlag.includes('=') ? Number(levelFlag.split('=')[1]) : undefined;
	const splash = !args.includes('--no-splash');
	const outputIndex = args.indexOf('--output');
	const output = outputIndex !== -1 ? args[outputIndex + 1] : 'standalone.html';

	const result = await buildSingleFile({ dist: resolve(dist), compress, algorithm, level, splash, output });
	const kb = (n) => (n / 1024).toFixed(1) + ' KB';
	console.log(`\n  ${result.path}`);
	console.log(
		`  ${result.scripts} script(s) inlined, ${kb(result.rawBytes)} raw -> ${kb(result.embeddedBytes)} embedded` +
			(compress ? ` (${algorithm} level ${level ?? (algorithm === 'brotli' ? 11 : 9)})` : ' (uncompressed)'),
	);
	console.log('  one file, no server, no sibling script - open it directly');
}
