import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the Documentation page into `webpage/documentation/`:
 *   - `index.html` from `REFERENCE.md` (module guide, site chrome)
 *   - `api/` from TypeDoc (exhaustive generated API)
 *
 * TypeDoc's checker-based analysis needs the classic TypeScript compiler API
 * (`ts.createProgram`, `ts.SyntaxKind`, ...), which `typescript@7`'s package no longer
 * exposes through its main entry point; it ships a new native compiler with a different
 * API surface instead. `tools/docs/` is an isolated nested npm project that pins an older,
 * compatible `typescript` purely for TypeDoc to read the source with; it never touches the
 * root project's own build or type-check, which keep using the real typescript@7.
 *
 * Run this before viewing the Documentation page or deploying the site.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'tools', 'docs');
const outDir = join(root, 'webpage', 'documentation');
const requireFromDocs = createRequire(join(docsDir, 'package.json'));

console.log('installing tools/docs dependencies (isolated typescript for TypeDoc)...');
// `npm run` forwards the caller's own npm config as npm_config_* env vars, including a
// global `allow-scripts` value from the developer's own ~/.npmrc (set for unrelated tools);
// npm refuses that value for this nested project's own install ("not allowed in
// project-scoped installs"), so it has to be cleared here rather than assumed absent.
const { npm_config_allow_scripts: _unused, ...envWithoutAllowScripts } = process.env;
execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
	cwd: docsDir,
	stdio: 'inherit',
	shell: true,
	env: envWithoutAllowScripts,
});

console.log('generating API reference into webpage/documentation/api/...');
mkdirSync(outDir, { recursive: true });
execFileSync('node', ['node_modules/typedoc/bin/typedoc', '--options', 'typedoc.json'], {
	cwd: docsDir,
	stdio: 'inherit',
	shell: true,
});

console.log('rendering REFERENCE.md into webpage/documentation/index.html...');
writeReferencePage();

console.log('\nwebpage/documentation/ now holds the module guide and generated API.');

/**
 * Heading ids that match REFERENCE.md's own Contents anchors (`#render` for
 * `### \`two-d/render\``, `#three-d-optional` for `## \`three-d\` (optional)`, etc.).
 */
function headingId(rawText) {
	const plain = rawText.replace(/`/g, '').trim();
	const sub = plain.match(/^two-d\/(.+)$/);
	if (sub) return sub[1];
	return plain
		.toLowerCase()
		.replace(/[^\w\s-]+/g, ' ')
		.trim()
		.replace(/\s+/g, '-');
}

function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function prepareMarkdown(source) {
	// Drop the repo-facing title; the HTML page supplies its own. Normalise newlines
	// first so the rest of the transforms don't care about CRLF checkouts.
	let md = source.replace(/\r\n/g, '\n').replace(/^#\s+mwg reference\s*\n+/, '');

	// Opening paragraph is written for readers of the .md file; on the site the lede
	// already covers the API split, so replace that sentence with a shorter pointer.
	md = md.replace(
		/The published Documentation page is this file rendered as HTML; the\nfull generated API \(every parameter, every doc comment\) lives beside it at\n`webpage\/documentation\/api\/` \(both from `npm run webpage:docs`\)\./,
		'Every parameter and doc comment is in the [API reference](./api/index.html).',
	);

	md = md.replace(/`README\.md`/g, '[README](https://github.com/datamoc/mwg/blob/main/README.md)');
	md = md.replace(/`DEVELOPMENT\.md`/g, '[DEVELOPMENT.md](https://github.com/datamoc/mwg/blob/main/DEVELOPMENT.md)');
	md = md.replace(/`ROADMAP\.md`/g, '[ROADMAP.md](https://github.com/datamoc/mwg/blob/main/ROADMAP.md)');
	md = md.replace(
		/`tests\/renderer-isolation\.test\.ts`/g,
		'[`tests/renderer-isolation.test.ts`](https://github.com/datamoc/mwg/blob/main/tests/renderer-isolation.test.ts)',
	);

	// The Contents block is redundant once a sidebar TOC exists.
	md = md.replace(/^## Contents\n\n[\s\S]*?(?=\n## )/m, '');

	return md;
}

function collectToc(md) {
	const items = [];
	for (const line of md.split('\n')) {
		const match = line.match(/^(#{2,3})\s+(.+)$/);
		if (!match) continue;
		const depth = match[1].length;
		const text = match[2].trim();
		items.push({ depth, id: headingId(text), label: text.replace(/`/g, '') });
	}
	return items;
}

function renderToc(items) {
	const lines = ['<nav class="ref-toc" aria-label="Modules">', '<p class="ref-toc-title">On this page</p>', '<ul>'];
	for (const item of items) {
		const cls = item.depth === 3 ? ' class="ref-toc-sub"' : '';
		lines.push(`\t\t\t\t\t<li${cls}><a href="#${item.id}">${escapeHtml(item.label)}</a></li>`);
	}
	lines.push('\t\t\t\t</ul>', '\t\t\t\t<p class="ref-toc-api"><a href="./api/index.html">Generated API →</a></p>', '\t\t\t</nav>');
	return lines.join('\n');
}

function writeReferencePage() {
	const { marked } = requireFromDocs('marked');
	const source = readFileSync(join(root, 'REFERENCE.md'), 'utf8');
	const md = prepareMarkdown(source);
	const toc = collectToc(md);

	marked.use({
		gfm: true,
		renderer: {
			heading({ tokens, depth, text }) {
				const id = headingId(text);
				const inner = this.parser.parseInline(tokens);
				return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
			},
		},
	});

	const body = marked.parse(md);
	const html = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Documentation - mwg</title>
	<meta
		name="description"
		content="mwg library reference: every public module and export, with a link into the generated API for signatures and parameters."
	/>
	<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg" />
	<link rel="stylesheet" href="../assets/site.css" />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="mwg" />
	<meta property="og:url" content="https://datamoc.github.io/mwg/documentation/index.html" />
	<meta property="og:title" content="Documentation - mwg" />
	<meta
		property="og:description"
		content="mwg library reference: every public module and export, with a link into the generated API for signatures and parameters."
	/>
	<meta property="og:image" content="https://datamoc.github.io/mwg/assets/og-image.png" />
	<meta property="og:image:width" content="1080" />
	<meta property="og:image:height" content="567" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Documentation - mwg" />
	<meta
		name="twitter:description"
		content="mwg library reference: every public module and export, with a link into the generated API for signatures and parameters."
	/>
	<meta name="twitter:image" content="https://datamoc.github.io/mwg/assets/og-image.png" />
</head>
<body>
	<header class="site-header">
		<div class="wrap">
			<a class="brand" href="../index.html"><img src="../assets/logo.svg" alt="mwg" /></a>
			<nav class="site-nav">
				<a href="../examples/index.html">Examples</a>
				<a href="../getting-started/index.html">Getting started</a>
				<a href="./index.html" aria-current="page">Documentation</a>
				<a href="../design/index.html">Design</a>
				<a href="../features/index.html">Features</a>
				<a href="../faq/index.html">FAQ</a>
				<a href="https://github.com/datamoc/mwg">GitHub</a>
			</nav>
		</div>
	</header>

	<main>
		<section style="padding-bottom: 1rem">
			<div class="wrap">
				<p class="eyebrow">library reference</p>
				<h1>Documentation</h1>
				<p class="lede">
					What exists in each module, and where. For exact signatures and every doc
					comment, open the <a href="./api/index.html">generated API</a>. For a first
					working scene, see <a href="../getting-started/index.html">Getting started</a>.
				</p>
				<div class="cta-row">
					<a class="btn primary" href="./api/index.html">Generated API</a>
					<a class="btn" href="../getting-started/index.html">Getting started</a>
				</div>
			</div>
		</section>

		<section style="border-bottom: none; padding-top: 1.5rem">
			<div class="wrap ref-layout">
				${renderToc(toc)}
				<article class="ref-body">
${body.trim()}
				</article>
			</div>
		</section>
	</main>

	<footer class="site-footer">
		<div class="wrap">
			<p>
				Source of this page: <code>REFERENCE.md</code> in the repository. Regenerated by
				<code>npm run webpage:docs</code> beside the TypeDoc output under
				<code>documentation/api/</code>.
			</p>
			<div class="footer-links">
				<div>
					<a href="./api/index.html">Generated API</a>
					<a href="../examples/index.html">Examples</a>
					<a href="../getting-started/index.html">Getting started</a>
					<a href="../faq/index.html">FAQ</a>
				</div>
			</div>
		</div>
	</footer>

	<script src="../assets/site.js"></script>
</body>
</html>
`;

	writeFileSync(join(outDir, 'index.html'), html);
}
