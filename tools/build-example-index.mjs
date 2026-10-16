#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The per-module index of the framework's code examples, generated.
 *
 * Every exported symbol carries an `@example` in its doc comment (`tests/api-examples.test.ts`
 * holds that line), and the runnable programs live under `examples/`. This tool joins the two:
 * for each public module in `package.json`'s `exports`, the symbols that have an example, and
 * the runnable examples that import the module. It is a repository tool, not part of the
 * published package.
 *
 * Nothing is imported from `src/`: the exports of each barrel are read as text (declarations,
 * `export { } from`, `export * from`, `export * as`), so the build needs neither Pixi nor
 * Babylon nor a TypeScript install. `buildExampleIndex` is pure over the checkout, which is what
 * lets `tests/example-index.test.ts` call it; `writeExampleIndex` is the one that touches disk.
 *
 *   node tools/build-example-index.mjs [outFile]   (default: webpage/documentation/examples.html)
 */

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const GITHUB = 'https://github.com/datamoc/mwg';
const DEFAULT_REFERENCE = `${GITHUB}/blob/main/REFERENCE.md`;
const EXAMPLE_LINES = 10;

/** typedoc's page directory for each declaration keyword, as it names pages under `api/` (type aliases live in `types/`) */
const TYPEDOC_DIR = {
	class: 'classes',
	interface: 'interfaces',
	function: 'functions',
	const: 'variables',
	let: 'variables',
	var: 'variables',
	type: 'types',
	enum: 'enums',
	namespace: 'modules',
};

/**
 * The typedoc pages of one output folder, keyed by declared name. Typedoc names a page
 * `<entry>.<Namespace>.<Name>.html` (`index.Audio.subsetSoundFont.html`, or `index.SaveSystem.html`
 * for a name on the root barrel, `mwl_presentation.compilePresentation.html` for a separate entry
 * point), so a symbol is found by its last segment and told apart by the entry and namespace.
 */
function typedocPages(apiDir) {
	const pages = new Map();
	if (!apiDir) return pages;
	for (const dir of new Set(Object.values(TYPEDOC_DIR))) {
		if (!existsSync(join(apiDir, dir))) continue;
		for (const file of readdirSync(join(apiDir, dir))) {
			if (!file.endsWith('.html')) continue;
			const parts = file.slice(0, -'.html'.length).split('.');
			const name = parts[parts.length - 1];
			if (!pages.has(name)) pages.set(name, []);
			pages.get(name).push({ dir, file, entry: parts[0], namespace: parts.length > 2 ? parts[1] : null });
		}
	}
	return pages;
}

/** the page of `name` (declared as `kind` in `module`) relative to `api/`, or null when typedoc has none */
function typedocPage(pages, kind, name, module) {
	const dir = TYPEDOC_DIR[kind];
	const candidates = (pages.get(name) ?? []).filter((page) => page.dir === dir);
	if (candidates.length === 0) return null;
	//a separate entry point (`mwl/presentation`) names its pages after itself
	const entry = module.src
		.replace(/^src\//, '')
		.replace(/(\/index)?\.ts$/, '')
		.replaceAll('/', '_');
	const own = candidates.filter((page) => page.entry === entry);
	if (own.length > 0) return `${dir}/${own[0].file}`;
	const root = candidates.filter((page) => page.entry === 'index');
	if (root.length === 1) return `${dir}/${root[0].file}`;
	//the same name on the root barrel in two namespaces: the module's own namespace wins
	const plain = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
	const space = root.find((page) => page.namespace && plain(page.namespace) === plain(module.name.split('/')[0]));
	if (space) return `${dir}/${space.file}`;
	//a module the root barrel flattens (two-d/stage) has the one page that sits in no namespace
	const flat = root.filter((page) => !page.namespace);
	if (flat.length === 1) return `${dir}/${flat[0].file}`;
	//a module re-exporting another entry's symbol (`assets` and `assets/binary`) points at the only page
	return candidates.length === 1 ? `${dir}/${candidates[0].file}` : null;
}

const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const slash = (path) => path.split('\\').join('/');
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function escapeHtml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** `text` with every comment blanked to spaces (newlines kept), so offsets still line up */
function maskComments(text) {
	const blank = (m) => m.replace(/[^\n]/g, ' ');
	return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|\s)\/\/.*$/gm, blank);
}

/** the `/** ... *\/` block ending right before `index` (only whitespace between), or null */
function docBefore(text, index) {
	const before = text.slice(0, index).trimEnd();
	if (!before.endsWith('*/')) return null;
	const start = before.lastIndexOf('/**');
	if (start === -1 || before.slice(start, -2).includes('*/')) return null;
	return before.slice(start);
}

/** the first ```ts fence after `@example` in a doc block, without the comment's ` * ` margin */
function exampleOf(doc) {
	if (!doc || !doc.includes('@example')) return null;
	const match = doc.match(/@example[\s\S]*?```(?:ts|typescript)\n([\s\S]*?)```/);
	if (!match) return null;
	const code = match[1]
		.split('\n')
		.map((line) => line.replace(/^\s*\*\s?/, ''))
		.join('\n')
		.trim();
	return code || null;
}

/** the doc comment's opening paragraph, flattened to one line (the symbol's summary) */
function summaryOf(doc) {
	if (!doc) return '';
	const body = doc
		.split('\n')
		.map((line) => line.replace(/^\s*\/\*\*+\s?|^\s*\*+\/?\s?|\s*\*\/\s*$/g, ''))
		.join('\n')
		.split(/\n\s*\n|\n@/)[0];
	const flat = body.replace(/\s+/g, ' ').trim();
	return clip(flat);
}

/** `text` cut at a word boundary after about 240 characters */
function clip(text) {
	return text.length > 240 ? `${text.slice(0, 240).replace(/\s+\S*$/, '')} ...` : text;
}

function resolveSpecifier(fromFile, specifier) {
	return resolve(dirname(fromFile), specifier);
}

/**
 * Reads exports straight from source. `exportsOf(file)` maps each exported name to
 * `{ file, kind, doc }`: where it is declared, with which keyword, and the doc comment that
 * carries its `@example` (preferring a declaration that has one, since overloads document
 * only the first signature). Barrels are followed recursively.
 */
function createExportReader() {
	const cache = new Map();

	function exportsOf(file) {
		if (cache.has(file)) return cache.get(file);
		const table = new Map();
		cache.set(file, table); //set early: a cycle then sees a partial table instead of looping
		if (!existsSync(file)) return table;

		const text = read(file);
		const masked = maskComments(text);
		const declared = new Map(); //local name -> { kind, doc }

		const declaration =
			/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|const|let|var|interface|type|enum|namespace)\s*\*?\s+([A-Za-z_$][\w$]*)/gm;
		for (const m of masked.matchAll(declaration)) {
			const doc = docBefore(text, m.index);
			const previous = table.get(m[2]);
			if (previous && exampleOf(previous.doc)) continue;
			table.set(m[2], { file, kind: m[1], doc });
		}
		for (const [name, entry] of table) declared.set(name, entry);

		const imports = new Map(); //local name -> { file, name }
		for (const m of masked.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/gm)) {
			for (const part of m[1].split(',')) {
				const [orig, alias = orig] = part
					.replace(/^\s*type\s+/, '')
					.trim()
					.split(/\s+as\s+/);
				if (orig) imports.set(alias.trim(), { file: resolveSpecifier(file, m[2]), name: orig.trim() });
			}
		}

		for (const m of masked.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s+'([^']+)')?\s*;?/gm)) {
			const from = m[2] ? resolveSpecifier(file, m[2]) : null;
			for (const part of m[1].split(',')) {
				const [orig, alias = orig] = part
					.replace(/^\s*type\s+/, '')
					.trim()
					.split(/\s+as\s+/);
				if (!orig) continue;
				const name = alias.trim();
				if (table.has(name)) continue;
				const source = from ? { file: from, name: orig.trim() } : imports.get(orig.trim());
				if (from || source) {
					const target = source ? exportsOf(source.file).get(source.name) : null;
					//an alias (`Hook as BattleHook`) has no typedoc page of its own: remember what it points at
					if (target)
						table.set(
							name,
							name === orig.trim()
								? target
								: { ...target, declaredName: target.declaredName ?? orig.trim() },
						);
				} else if (declared.has(orig.trim())) table.set(name, declared.get(orig.trim()));
			}
		}

		for (const m of masked.matchAll(/^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']+)'/gm)) {
			const target = resolveSpecifier(file, m[2]);
			//`export * as core from '../core/index.ts'` re-exports a whole module (headless does),
			//which that module's own section already lists; only a plain file is a symbol here
			if (/(^|[\\/])index\.ts$/.test(target)) continue;
			const doc = docBefore(text, m.index) ?? firstDoc(target);
			table.set(m[1], { file: target, kind: 'namespace', doc });
		}

		for (const m of masked.matchAll(/^export\s+\*\s+from\s+'([^']+)'/gm)) {
			for (const [name, entry] of exportsOf(resolveSpecifier(file, m[1]))) {
				if (name !== 'default' && !table.has(name)) table.set(name, entry);
			}
		}
		return table;
	}

	/** the file's first doc comment carrying an example (stands in for `export * as` namespaces) */
	function firstDoc(file) {
		if (!existsSync(file)) return null;
		return (read(file).match(/\/\*\*[\s\S]*?\*\//g) ?? []).find((block) => exampleOf(block)) ?? null;
	}

	exportsOf.header = firstDoc;
	return exportsOf;
}

/** every public module of `package.json`: `{ name, specifier, file }`, in a fixed order */
function publicModules(root) {
	const pkg = JSON.parse(read(join(root, 'package.json')));
	const modules = [];
	for (const [subpath, target] of Object.entries(pkg.exports)) {
		if (subpath === '.' || subpath === './package.json' || subpath === './api-manifest') continue;
		if (subpath.startsWith('./tools')) continue;
		const dist = typeof target === 'string' ? target : target.import;
		if (!dist || !dist.startsWith('./dist/')) continue;
		const src = dist.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts');
		modules.push({
			name: subpath.slice(2),
			specifier: `${pkg.name}${subpath.slice(1)}`,
			file: join(root, src),
			src,
		});
	}
	return modules.sort(byName);
}

/** the heading texts of REFERENCE.md that name a module, as `` `core` `` or `` `three-d` (optional) `` */
function referenceHeadings(root) {
	const path = join(root, 'REFERENCE.md');
	if (!existsSync(path)) return [];
	return read(path)
		.split('\n')
		.map((line) => line.match(/^#{2,3}\s+(.+)$/)?.[1].trim())
		.filter(Boolean);
}

/** the heading id the GitHub renderer gives a heading, or the id the site's own page gives it */
function anchorFor(heading, github) {
	const plain = heading.replace(/`/g, '').trim();
	if (!github) {
		const sub = plain.match(/^two-d\/(.+)$/);
		if (sub) return sub[1];
	}
	return plain
		.toLowerCase()
		.replace(/[^\w\s-]+/g, github ? '' : ' ')
		.trim()
		.replace(/\s+/g, '-');
}

/** the REFERENCE.md heading for a module, falling back to its parent module, then its directory */
function referenceHeading(headings, module) {
	const candidates = [module.name, module.name.split('/').slice(0, -1).join('/'), module.src.split('/')[1]];
	for (const candidate of candidates) {
		if (!candidate) continue;
		const found = headings.find((h) => h.replace(/\s*\(.*\)\s*$/, '') === `\`${candidate}\``);
		if (found) return found;
	}
	return null;
}

function walk(dir, accept, out = []) {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir).sort()) {
		if (entry === 'node_modules' || entry === 'dist') continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, accept, out);
		else if (accept(entry)) out.push(full);
	}
	return out;
}

/** the `| \`name\` | level | what it shows |` rows of examples/README.md */
function readmeRows(root) {
	const path = join(root, 'examples', 'README.md');
	const rows = new Map();
	if (!existsSync(path)) return rows;
	for (const line of read(path).split('\n')) {
		const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|\s*(.*?)\s*\|\s*$/);
		if (m) rows.set(m[1], { level: m[2], description: m[3] });
	}
	return rows;
}

/** which module a source file belongs to: an exact-file module first, else the deepest module directory */
function moduleOfFile(modules, srcFile) {
	let best = null;
	let bestLength = -1;
	for (const module of modules) {
		const isBarrel = /(^|\/)index\.ts$/.test(module.src);
		const key = isBarrel ? `${dirname(module.src)}/` : module.src;
		const hit = isBarrel ? srcFile.startsWith(key) : srcFile === key;
		if (hit && key.length > bestLength) {
			best = module;
			bestLength = key.length;
		}
	}
	return best;
}

/** `{ example name -> Set of module names }` from the imports in each example's own sources */
function importsByExample(root, examples, modules, exportsOf) {
	const used = new Map();
	const rootFile = join(root, 'src', 'index.ts');
	const rootNames = exportsOf(rootFile);
	const rootSpecifier = JSON.parse(read(join(root, 'package.json'))).name;
	const namedImport = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
	const publicBySpecifier = new Map(modules.map((m) => [m.specifier, m]));
	const specifierPattern = /(?:from\s+|import\s*\(?\s*|import\s+)['"]([^'"]+)['"]/g;
	for (const name of examples) {
		const found = new Set();
		const dir = join(root, 'examples', name);
		for (const file of walk(dir, (f) => /\.(?:ts|tsx|js|mjs)$/.test(f))) {
			for (const m of read(file).matchAll(specifierPattern)) {
				const specifier = m[1];
				let module = publicBySpecifier.get(specifier);
				if (!module && specifier.startsWith('.')) {
					const target = slash(relative(root, resolve(dirname(file), specifier)));
					if (target.startsWith('src/')) module = moduleOfFile(modules, target);
				}
				if (module) found.add(module.name);
			}
			//the root barrel re-exports every module, so credit each name imported from it to the
			//module its declaration lives in
			for (const m of read(file).matchAll(namedImport)) {
				const isRoot =
					m[2] === rootSpecifier || (m[2].startsWith('.') && resolve(dirname(file), m[2]) === rootFile);
				if (!isRoot) continue;
				for (const part of m[1].split(',')) {
					const orig = part
						.replace(/^\s*type\s+/, '')
						.trim()
						.split(/\s+as\s+/)[0];
					const declaring = rootNames.get(orig)?.file;
					const module = declaring && moduleOfFile(modules, slash(relative(root, declaring)));
					if (module) found.add(module.name);
				}
			}
		}
		used.set(name, found);
	}
	return used;
}

/**
 * Builds the index model. Options:
 *   root            repository root (default: this checkout)
 *   apiDir          the typedoc output directory; a symbol links into it only when its page
 *                   exists there, so the page is right whether or not typedoc ran
 *   referenceHref   where the module guide lives (default: REFERENCE.md on GitHub)
 */
export function buildExampleIndex({ root = defaultRoot, apiDir = null, referenceHref = DEFAULT_REFERENCE } = {}) {
	const modules = publicModules(root);
	const exportsOf = createExportReader();
	const headings = referenceHeadings(root);
	const github = /^https?:/.test(referenceHref);

	const exampleNames = existsSync(join(root, 'examples'))
		? readdirSync(join(root, 'examples'))
				.filter((n) => existsSync(join(root, 'examples', n, 'index.html')))
				.sort()
		: [];
	const rows = readmeRows(root);
	const pages = typedocPages(apiDir);
	const usedBy = importsByExample(root, exampleNames, modules, exportsOf);

	const runnable = exampleNames.map((name) => ({
		name,
		level: rows.get(name)?.level ?? '',
		description: clip((rows.get(name)?.description ?? '').replaceAll('**', '')),
		page: existsSync(join(root, 'webpage', 'examples', name, 'index.html')) ? `../examples/${name}/` : null,
		source: `${GITHUB}/tree/main/examples/${name}`,
		modules: [...usedBy.get(name)].sort(),
	}));

	const entries = modules.map((module) => {
		const heading = referenceHeading(headings, module);
		const reference = `${referenceHref}${heading ? `#${anchorFor(heading, github)}` : ''}`;

		const symbols = [];
		for (const [name, entry] of exportsOf(module.file)) {
			const code = exampleOf(entry.doc);
			if (!code) continue;
			const lines = code.split('\n');
			const apiPage = typedocPage(pages, entry.kind, entry.declaredName ?? name, module);
			symbols.push({
				name,
				kind: entry.kind,
				file: slash(relative(root, entry.file)),
				summary: summaryOf(entry.doc),
				example: lines.slice(0, EXAMPLE_LINES).join('\n'),
				moreLines: Math.max(0, lines.length - EXAMPLE_LINES),
				link: apiPage
					? { label: 'API page', href: `./api/${apiPage}` }
					: { label: 'Reference', href: reference },
			});
		}
		symbols.sort(byName);
		//a module whose example sits on the file's own header comment rather than on a symbol
		const overview = symbols.length ? null : exampleOf(exportsOf.header(module.file));

		return {
			name: module.name,
			specifier: module.specifier,
			entry: module.src,
			reference,
			overview,
			symbols,
			runnable: runnable.filter((e) => e.modules.includes(module.name)).map((e) => e.name),
		};
	});

	return { modules: entries, runnable };
}

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1b1f27;--muted:#5d6676;--line:#d9dee7;--panel:#f5f7fa;--code:#eef1f6;--accent:#3949b8;--chip:#e5e9f8}
@media (prefers-color-scheme:dark){:root{--bg:#0b0e14;--fg:#eef1f6;--muted:#9aa5b8;--line:#232b3a;--panel:#141a24;--code:#10151e;--accent:#9fb0ff;--chip:#22294a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}
.wrap{max-width:62rem;margin:0 auto;padding:0 16px}
header.top{border-bottom:1px solid var(--line);padding:12px 0}
header.top .wrap{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline}
header.top strong{margin-right:auto}
h1{font-size:1.8rem;margin:1.5rem 0 .5rem}
h2{font-size:1.3rem;margin:0 0 .25rem;font-family:ui-monospace,Menlo,Consolas,monospace;overflow-wrap:anywhere}
h3{font-size:1rem;margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;overflow-wrap:anywhere}
.lede,.muted{color:var(--muted)}
nav.jump{display:flex;flex-wrap:wrap;gap:6px;margin:1rem 0 2rem;padding:0;list-style:none}
nav.jump a{display:inline-block;padding:2px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font:.85rem ui-monospace,Menlo,Consolas,monospace}
section.module{border-top:1px solid var(--line);padding:1.5rem 0}
.meta{margin:.25rem 0 .75rem;font-size:.9rem}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:.5rem 0 1rem;padding:0;list-style:none}
.chips a{background:var(--chip);border-radius:6px;padding:1px 8px;text-decoration:none;font-size:.9rem}
details{border:1px solid var(--line);border-radius:8px;background:var(--panel);margin:.5rem 0}
summary{cursor:pointer;padding:8px 12px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline}
summary .kind{color:var(--muted);font-size:.8rem}
.body{padding:0 12px 12px}
.body p{margin:.25rem 0 .5rem}
pre{tab-size:2;margin:.5rem 0;padding:10px 12px;background:var(--code);border-radius:6px;overflow-x:auto;font:.85rem/1.45 ui-monospace,Menlo,Consolas,monospace;max-width:100%}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;overflow-wrap:anywhere}
ul.cards{list-style:none;margin:0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))}
ul.cards li{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:10px 12px;min-width:0}
ul.cards p{margin:.25rem 0}
footer{border-top:1px solid var(--line);margin-top:2rem;padding:1rem 0 2rem;color:var(--muted);font-size:.9rem}
`;

/** escaped text, with the doc comments' `backticked` spans shown as code */
const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');

const anchorId = (prefix, name) => `${prefix}-${name.replace(/[^A-Za-z0-9]+/g, '-')}`;

/** the model as one self-contained HTML page: no scripts, no network, inline styles */
export function renderExampleIndex(model) {
	const out = [];
	const total = model.modules.reduce((sum, m) => sum + m.symbols.length, 0);

	out.push(
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		'<title>Examples index - mwg</title>',
		'<meta name="description" content="Every code example in the mwg API, grouped by module, with the runnable examples that use each module." />',
		`<style>${CSS}</style>`,
		'</head>',
		'<body>',
		'<header class="top"><div class="wrap"><strong>mwg</strong>',
		'<a href="./index.html">Documentation</a>',
		'<a href="./api/index.html">Generated API</a>',
		'<a href="../examples/index.html">Examples</a>',
		'</div></header>',
		'<main class="wrap">',
		'<h1>Examples index</h1>',
		`<p class="lede">${total} documented examples across ${model.modules.length} modules, and the ${model.runnable.length} runnable examples that use them. Each snippet is the start of the <code>@example</code> in the symbol's doc comment, compiled by the test suite against the public import paths.</p>`,
		'<nav class="jump" aria-label="Modules">',
	);
	for (const module of model.modules) {
		out.push(`<a href="#${anchorId('m', module.name)}">${escapeHtml(module.name)}</a>`);
	}
	out.push(`<a href="#runnable-examples">runnable examples</a>`, '</nav>');

	for (const module of model.modules) {
		out.push(
			`<section class="module" id="${anchorId('m', module.name)}">`,
			`<h2>${escapeHtml(module.name)}</h2>`,
			`<p class="meta muted"><code>import { ... } from '${escapeHtml(module.specifier)}'</code> - ${module.symbols.length === 1 ? '1 example' : `${module.symbols.length} examples`} - <a href="${escapeHtml(module.reference)}">module guide</a></p>`,
		);
		if (module.overview) {
			out.push(
				'<p class="meta muted">The module documents its example on the file itself:</p>',
				`<pre><code>${escapeHtml(module.overview)}</code></pre>`,
			);
		}
		if (module.runnable.length) {
			out.push(
				'<p class="meta muted">Used by runnable examples:</p>',
				'<ul class="chips">',
				...module.runnable.map((n) => `<li><a href="#${anchorId('e', n)}">${escapeHtml(n)}</a></li>`),
				'</ul>',
			);
		} else out.push('<p class="meta muted">No runnable example imports this module yet.</p>');
		if (!module.symbols.length && !module.overview) {
			out.push('<p class="meta muted">No exported symbol carries an <code>@example</code> yet.</p>');
		}

		for (const symbol of module.symbols) {
			out.push(
				'<details>',
				`<summary><h3>${escapeHtml(symbol.name)}</h3><span class="kind">${escapeHtml(symbol.kind)}</span></summary>`,
				'<div class="body">',
			);
			if (symbol.summary) out.push(`<p>${inline(symbol.summary)}</p>`);
			out.push(`<pre><code>${escapeHtml(symbol.example)}${symbol.moreLines ? '\n...' : ''}</code></pre>`);
			out.push(
				`<p class="meta muted">Declared in <code>${escapeHtml(symbol.file)}</code>${symbol.moreLines ? `, ${symbol.moreLines} more lines there` : ''} - <a href="${escapeHtml(symbol.link.href)}">${escapeHtml(symbol.link.label)}</a></p>`,
				'</div>',
				'</details>',
			);
		}
		out.push('</section>');
	}

	out.push(
		'<section class="module" id="runnable-examples">',
		'<h2>Runnable examples</h2>',
		'<p class="muted">Each directory under <code>examples/</code> with an <code>index.html</code>. The built page exists once the example has been built into the site.</p>',
		'<ul class="cards">',
	);
	for (const example of model.runnable) {
		const open = example.page
			? `<a href="${escapeHtml(example.page)}">open</a> - <a href="${escapeHtml(example.source)}">source</a>`
			: `<a href="${escapeHtml(example.source)}">source</a> (not built)`;
		const modules = example.modules.map((n) => `<a href="#${anchorId('m', n)}">${escapeHtml(n)}</a>`).join(', ');
		out.push(
			`<li id="${anchorId('e', example.name)}">`,
			`<h3>${escapeHtml(example.name)}</h3>`,
			`<p class="meta muted">${example.level ? `level ${escapeHtml(example.level)} - ` : ''}${open}</p>`,
			example.description
				? `<p>${inline(example.description)}</p>`
				: '<p class="muted">No description in examples/README.md.</p>',
			`<p class="meta muted">Modules: ${modules || 'none'}</p>`,
			'</li>',
		);
	}
	out.push(
		'</ul>',
		'</section>',
		'</main>',
		'<footer><div class="wrap">Generated by <code>tools/build-example-index.mjs</code> from the sources, by <code>npm run webpage:docs</code>.</div></footer>',
		'</body>',
		'</html>',
		'',
	);
	return out.join('\n');
}

/** builds the model for this checkout and writes the page; returns the output path */
export function writeExampleIndex({ root = defaultRoot, outFile } = {}) {
	const apiDir = join(root, 'webpage', 'documentation', 'api');
	const file = outFile ?? join(root, 'webpage', 'documentation', 'examples.html');
	const model = buildExampleIndex({ root, apiDir, referenceHref: './index.html' });
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, renderExampleIndex(model));
	return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	console.log(`wrote ${writeExampleIndex({ outFile: process.argv[2] ? resolve(process.argv[2]) : undefined })}`);
}
