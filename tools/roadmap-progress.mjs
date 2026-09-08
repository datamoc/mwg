#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import './roadmapProgress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const roadmapPath = join(root, 'ROADMAP.md');
const htmlPath = join(__dirname, 'roadmap-progress.html');

const args = process.argv.slice(2);
const shouldEmbed = args.includes('--embed') || args.includes('--browser');
const shouldOpenBrowser = args.includes('--browser');

if (args.includes('--help') || args.includes('-h')) {
	console.log(`Usage: node tools/roadmap-progress.mjs [options]

Options:
  --embed     Inlines ROADMAP.md into tools/roadmap-progress.html for file:// opening
  --browser   Embeds data and opens tools/roadmap-progress.html in the default browser
  --help, -h  Show this help message
`);
	process.exit(0);
}

const markdown = readFileSync(roadmapPath, 'utf8');
const data = globalThis.parseRoadmap(markdown);

function renderProgressBar(done, total, width = 30) {
	if (total <= 0) return '[' + ' '.repeat(width) + ']';
	const filled = Math.round((done / total) * width);
	const bar = '='.repeat(filled) + ' '.repeat(Math.max(0, width - filled));
	return `[${bar}]`;
}

const overallPct = data.overallTotal > 0 ? Math.round((100 * data.overallDone) / data.overallTotal) : 0;
console.log('\n  mwg - ROADMAP.md progress');
console.log(`  Overall: ${data.overallDone}/${data.overallTotal} (${overallPct}%) ${renderProgressBar(data.overallDone, data.overallTotal, 32)}\n`);

for (const section of data.sections) {
	const pct = section.total > 0 ? Math.round((100 * section.done) / section.total) : 0;
	const label = `${section.name}:`.padEnd(20);
	const counts = `${section.done}/${section.total}`.padStart(7);
	const pctStr = `(${String(pct).padStart(3)}%)`;
	console.log(`  ${label} ${counts} ${pctStr} ${renderProgressBar(section.done, section.total, 24)}`);
}

if (data.openItems && data.openItems.length > 0) {
	console.log(`\n  Open items (${data.openItems.length}):`);
	for (const item of data.openItems) {
		const prefix = item.num ? `    #${item.num}: ` : '    - ';
		const text = item.text.length > 90 ? item.text.slice(0, 87) + '...' : item.text;
		console.log(`${prefix}${text}`);
	}
}
console.log('');

if (shouldEmbed) {
	const html = readFileSync(htmlPath, 'utf8');
	const scriptTag = /<script id="roadmap-data" type="text\/plain">[\s\S]*?<\/script>/;
	// Escape any closing script tags in markdown content
	const safeMarkdown = markdown.replace(/<\/script>/gi, '<\\/script>');
	const updatedHtml = html.replace(
		scriptTag,
		`<script id="roadmap-data" type="text/plain">\n${safeMarkdown}\n</script>`
	);
	writeFileSync(htmlPath, updatedHtml, 'utf8');
	console.log(`  Embedded ROADMAP.md into: ${htmlPath}`);
	console.log('  File is ready to open via file:// with no server needed.\n');
}

if (shouldOpenBrowser) {
	const platform = process.platform;
	let command;
	if (platform === 'win32') {
		command = `start "" "${htmlPath}"`;
	} else if (platform === 'darwin') {
		command = `open "${htmlPath}"`;
	} else {
		command = `xdg-open "${htmlPath}"`;
	}
	console.log(`  Opening browser: ${htmlPath}`);
	try {
		execSync(command);
	} catch (e) {
		console.error(`  Could not open browser automatically: ${e.message}`);
	}
}
