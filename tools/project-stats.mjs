import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageData = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const check = args.has('--check');

const stats = collectStats();
const outputs = {
	json: JSON.stringify(stats, null, '\t') + '\n',
	markdown: renderMarkdown(stats),
	page: renderPage(stats),
};

const files = [
	[join(root, 'PROJECT_STATS.json'), outputs.json],
	[join(root, 'PROJECT_STATS.md'), outputs.markdown],
	[join(root, 'webpage', 'statistics', 'index.html'), outputs.page],
];

if (check) {
	const stale = files.filter(([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content);
	if (stale.length > 0) {
		console.error(`project statistics are out of date: ${stale.map(([path]) => relative(root, path)).join(', ')}`);
		console.error('Run `npm run stats:write` and include the generated files in the release commit.');
		process.exit(1);
	}
	console.log('project statistics match the current release sources.');
} else {
	for (const [path, content] of files) {
		mkdirSync(resolve(path, '..'), { recursive: true });
		writeFileSync(path, content);
	}
	console.log('wrote PROJECT_STATS.json, PROJECT_STATS.md, and webpage/statistics/index.html');
}

function collectStats() {
	const source = measureTree(join(root, 'src'), ['.ts']);
	const breakdown = readdirSync(join(root, 'src'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({ name: entry.name, ...measureTree(join(root, 'src', entry.name), ['.ts']) }))
		.filter((module) => module.files > 0)
		.sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
	const tests = measureTree(join(root, 'tests'), ['.ts']);
	const tools = measureTree(join(root, 'tools'), ['.mjs', '.js', '.cjs']);
	const examples = readdirSync(join(root, 'examples'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(root, 'examples', entry.name, 'main.ts')))
		.map((entry) => entry.name)
		.sort();
	const roadmap = measureRoadmap(readFileSync(join(root, 'ROADMAP.md'), 'utf8'));
	const bundle = measureBundle();
	const declarationFiles = existsSync(join(root, 'dist')) ? countFiles(join(root, 'dist'), '.d.ts') : null;

	return {
		project: 'mwg',
		package: packageData.name,
		version: packageData.version,
		releaseDate: readReleaseDate(packageData.version),
		source: { ...source, modules: breakdown.length, breakdown },
		tests: { ...tests, cases: countTestCases(join(root, 'tests')) },
		tools,
		examples: { count: examples.length, names: examples },
		roadmap: { ...roadmap, percent: roadmap.items ? Math.round((roadmap.completed / roadmap.items) * 100) : 0 },
		api: { declarationFiles },
		bundle,
		quality: { testToSourceRatio: source.lines ? Math.round((tests.lines / source.lines) * 10) / 10 : 0 },
	};
}

function readReleaseDate(version) {
	const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
	return (
		changelog.match(new RegExp(`^## \\[${escapeRegExp(version)}\\] - (\\d{4}-\\d{2}-\\d{2})$`, 'm'))?.[1] ?? null
	);
}

function measureTree(directory, extensions) {
	let files = 0;
	let lines = 0;
	for (const path of trackedFiles(directory, extensions)) {
		files++;
		lines += countLines(readTracked(path));
	}
	return { files, lines };
}

function countLines(source) {
	if (!source.length) return 0;
	return source.split(/\r?\n/).length - (source.endsWith('\n') || source.endsWith('\r') ? 1 : 0);
}

function countFiles(directory, extension) {
	return trackedFiles(directory, [extension]).length;
}

function countTestCases(directory) {
	let cases = 0;
	for (const path of trackedFiles(directory, ['.test.ts'])) {
		if (!path.endsWith('.test.ts')) continue;
		cases += (readTracked(path).match(/\btest\s*\(/g) ?? []).length;
	}
	return cases;
}

function trackedFiles(directory, extensions) {
	const relativeDirectory = relative(root, directory).replaceAll('\\', '/');
	const output = execFileSync('git', ['ls-files', '--cached', '--', `${relativeDirectory}/`], {
		cwd: root,
		encoding: 'utf8',
	});
	return output
		.split(/\r?\n/)
		.filter((path) => path && extensions.some((extension) => path.endsWith(extension)))
		.map((path) => join(root, path));
}

function readTracked(path) {
	if (existsSync(path)) return readFileSync(path, 'utf8');
	const relativePath = relative(root, path).replaceAll('\\', '/');
	return execFileSync('git', ['show', `:${relativePath}`], { cwd: root, encoding: 'utf8' });
}

function measureRoadmap(source) {
	const items = [...source.matchAll(/^(?:\s*~~)?\s*(\d+)\.\s+/gm)];
	const completed = source.split(/\r?\n/).filter((line) => /^\s*(?:\d+\.\s+~~|~~\s*\d+\.)/.test(line)).length;
	return { items: items.length, completed, open: items.length - completed };
}

function measureBundle() {
	const globalPath = join(root, 'dist', 'mw_games.global.js');
	if (!existsSync(globalPath)) return { globalRaw: null, globalGzip: null, distRaw: null };
	const global = readFileSync(globalPath);
	let distRaw = 0;
	for (const path of walk(join(root, 'dist'))) {
		if (!path.endsWith('.map')) distRaw += statSync(path).size;
	}
	return { globalRaw: global.length, globalGzip: gzipSync(global, { level: 9 }).length, distRaw };
}

function* walk(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') yield* walk(path);
		else yield path;
	}
}

function renderMarkdown(stats) {
	const { source, tests, tools, examples, roadmap, api, bundle, quality } = stats;
	const moduleRows = source.breakdown
		.map((module) => `| ${module.name} | ${module.files} | ${module.lines.toLocaleString('en-US')} |`)
		.join('\n');
	return `# Project statistics\n\nGenerated for **${stats.project} ${stats.version}** on ${stats.releaseDate ?? 'the current checkout'}.\n\n| Area | Statistics |\n| --- | ---: |\n| Source | ${source.files} TypeScript files, ${source.lines.toLocaleString('en-US')} lines, ${source.modules} modules |\n| Tests | ${tests.files} files, ${tests.cases.toLocaleString('en-US')} test cases, ${tests.lines.toLocaleString('en-US')} lines |\n| Tools | ${tools.files} files, ${tools.lines.toLocaleString('en-US')} lines |\n| Examples | ${examples.count} runnable examples |\n| Roadmap | ${roadmap.completed}/${roadmap.items} items complete, ${roadmap.open} open |\n| API | ${api.declarationFiles ?? 'not built'} declaration files |\n| Bundle | ${formatBytes(bundle.globalRaw)} raw, ${formatBytes(bundle.globalGzip)} gzip |\n| Published dist | ${formatBytes(bundle.distRaw)} excluding source maps |\n| Test-to-source ratio | ${quality.testToSourceRatio}x by line count |\n\n## Source modules\n\n| Module | Files | Lines |\n| --- | ---: | ---: |\n${moduleRows}\n\nThe report is generated by \`npm run stats:write\` and checked by \`npm run stats:check\`.\n`;
}

function renderPage(stats) {
	const maxModuleLines = Math.max(...stats.source.breakdown.map((module) => module.lines), 1);
	const moduleRows = stats.source.breakdown
		.map(
			(module) =>
				`<div class="bar-row"><div class="bar-label"><strong>${escapeHtml(module.name)}</strong><span>${module.lines.toLocaleString('en-US')} lines · ${module.files} files</span></div><div class="bar-track"><span class="bar-fill" style="width:${Math.max((module.lines / maxModuleLines) * 100, 2)}%"></span></div></div>`,
		)
		.join('');
	const rows = [
		['Version', stats.version],
		['Release date', stats.releaseDate ?? 'Current checkout'],
		['Source', `${stats.source.files} TypeScript files · ${stats.source.lines.toLocaleString('en-US')} lines`],
		['Tests', `${stats.tests.cases.toLocaleString('en-US')} cases · ${stats.tests.files} files`],
		['Examples', `${stats.examples.count} runnable examples`],
		['Roadmap', `${stats.roadmap.completed}/${stats.roadmap.items} items complete`],
		['Test-to-source ratio', `${stats.quality.testToSourceRatio}x by line count`],
		['API', `${stats.api.declarationFiles ?? 'Not built'} declaration files`],
		['Global bundle', `${formatBytes(stats.bundle.globalRaw)} raw · ${formatBytes(stats.bundle.globalGzip)} gzip`],
		['Published dist', formatBytes(stats.bundle.distRaw)],
	];
	const table = rows
		.map(([label, value]) => `<div class="stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
		.join('\n');
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Project statistics - mwg</title><meta name="description" content="Release statistics for the mwg game framework.">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg"><link rel="stylesheet" href="../assets/site.css">
<style>.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1rem}.stat{padding:1.2rem;border:1px solid var(--line-strong);border-radius:.6rem;background:var(--panel-raised)}.stat dt{color:var(--muted);font-size:.9rem}.stat dd{margin:.35rem 0 0;color:var(--paper);font-size:1.25rem;font-weight:650}.bar-chart{display:grid;gap:1.05rem;margin-top:1.5rem;max-width:58rem}.bar-label{display:flex;justify-content:space-between;gap:1rem;align-items:baseline;color:var(--paper);font-family:var(--font-display);font-size:.78rem}.bar-label span{color:var(--muted);font-family:var(--font-body);font-size:.8rem;text-align:right}.bar-track{height:.7rem;margin-top:.45rem;background:var(--panel-raised);border:1px solid var(--line-strong);overflow:hidden}.bar-fill{display:block;height:100%;background:linear-gradient(90deg,var(--add),var(--moss));transform-origin:left;animation:bar-in .55s ease-out both}@keyframes bar-in{from{transform:scaleX(0)}}@media(prefers-reduced-motion:reduce){.bar-fill{animation:none}}@media(max-width:600px){.bar-label{display:block}.bar-label span{display:block;margin-top:.2rem;text-align:left}}</style></head>
<body><header class="site-header"><div class="wrap"><a class="brand" href="../index.html"><img src="../assets/logo.svg" alt="mwg"></a><nav class="site-nav"><a href="../examples/index.html">Examples</a><a href="../getting-started/index.html">Getting started</a><a href="../documentation/index.html">Documentation</a><a href="../features/index.html">Features</a><a href="../statistics/index.html" aria-current="page">Statistics</a><a href="https://github.com/datamoc/mwg">GitHub</a></nav></div></header>
<main><section class="hero"><div class="wrap"><p class="eyebrow">release evidence</p><h1>Project statistics</h1><p class="lede">A reproducible snapshot of the framework, its tests, examples, roadmap, API and shipped bundle.</p></div></section><section class="wrap"><dl class="stats-grid">${table}</dl><h2 style="margin-top:3rem">Source modules</h2><div class="bar-chart" role="img" aria-label="Source module size comparison">${moduleRows}</div><p class="help" style="margin-top:2rem">Generated from the release checkout by <code>tools/project-stats.mjs</code>.</p></section></main></body></html>
`;
}

function formatBytes(value) {
	if (value === null) return 'Not built';
	if (value < 1024) return `${value} B`;
	return `${(value / 1024).toFixed(1)} kB`;
}

function escapeHtml(value) {
	return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
