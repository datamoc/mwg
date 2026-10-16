#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `mwg-init <folder>`: the smallest game that builds into one double-clickable page.
 *
 * It writes a vite project that uses `mwgPage()`: one scene, a moving square, a vite config
 * that loads without `"type": "module"` in the way `.mts` files do, and the scripts to run
 * and build it. The point is that the nearest example to copy is already on disk, in the
 * shape the published package supports, rather than a folder of this repository's own
 * examples that import their sources by relative path.
 */
const PACKAGE_VERSION = JSON.parse(
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
).version;

/** the project's files as `{ path: content }`, named after `name` */
export function initFiles(name) {
	return {
		'package.json':
			JSON.stringify(
				{
					name,
					private: true,
					version: '0.0.0',
					type: 'module',
					scripts: {
						dev: 'vite',
						build: 'vite build',
						check: 'tsc --noEmit',
						test: 'node --test',
						'hooks:install': 'git config core.hooksPath .githooks',
					},
					dependencies: { '@datamoc/mw_games': `^${PACKAGE_VERSION}`, 'pixi.js': '^8.20.1' },
					devDependencies: { typescript: '^7.0.2', vite: '^8.2.2' },
				},
				null,
				2,
			) + '\n',
		'vite.config.mts': [
			"import { defineConfig } from 'vite';",
			"import { mwgPage } from '@datamoc/mw_games/tools/vite';",
			'',
			'//`singleFile: true` also writes dist/standalone.html, the whole game in one file',
			'export default defineConfig({ plugins: [mwgPage({ singleFile: true })] });',
			'',
		].join('\n'),
		'tsconfig.json':
			JSON.stringify(
				{
					compilerOptions: {
						target: 'ES2022',
						module: 'ESNext',
						moduleResolution: 'bundler',
						lib: ['ES2022', 'DOM'],
						strict: true,
						noEmit: true,
						skipLibCheck: true,
					},
					include: ['src'],
				},
				null,
				2,
			) + '\n',
		'index.html': [
			'<!DOCTYPE html>',
			'<html lang="en">',
			'<head>',
			'\t<meta charset="utf-8">',
			'\t<meta name="viewport" content="width=device-width, initial-scale=1">',
			`\t<title>${name}</title>`,
			'\t<style>html, body { margin: 0; height: 100%; background: #101018; overflow: hidden; } #game { display: block; width: 100vw; height: 100vh; }</style>',
			'</head>',
			'<body>',
			'\t<canvas id="game"></canvas>',
			'\t<script type="module" src="./src/main.ts"></script>',
			'</body>',
			'</html>',
			'',
		].join('\n'),
		'src/main.ts': [
			"import { Game, Scene2D } from '@datamoc/mw_games/two-d';",
			"import { Shape2D, Text2D } from '@datamoc/mw_games/two-d/render';",
			'',
			'class MainScene extends Scene2D {',
			'\tprivate square!: Shape2D;',
			'\tprivate elapsed = 0;',
			'',
			'\toverride create(): void {',
			"\t\tconst label = new Text2D({ text: 'Hello, mwg!', style: { fill: 0xd8dae6, fontFamily: 'monospace', fontSize: 16 } });",
			'\t\tlabel.position.set(24, 24);',
			'\t\tthis.stage.addChild(label);',
			'\t\tthis.square = new Shape2D().rect(-20, -20, 40, 40).fill(0x6fb1ff);',
			'\t\tthis.stage.addChild(this.square);',
			'\t}',
			'',
			'\toverride update(dt: number): void {',
			'\t\tthis.elapsed += dt;',
			'\t\tthis.square.position.set(Game.current.width / 2 + Math.sin(this.elapsed) * 120, Game.current.height / 2);',
			'\t}',
			'}',
			'',
			"const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });",
			'game.start(MainScene).catch((error) => console.error(error));',
			'',
		].join('\n'),
		'assets/.gitkeep': '',
		'.gitignore': 'node_modules/\ndist/\n.opencode/\n.coord-session\n',
		'.githooks/pre-commit': '#!/bin/sh\nset -e\nnpm run check\nnpm test\n',
		'README.md': `# ${name}\n\n\`npm install\`, then \`npm run dev\` to play it while you edit, \`npm run build\` to write \`dist/\`.\nOpen \`dist/index.html\` (or \`dist/standalone.html\`) by double-clicking it: no server needed.\n\nPut images and sounds under \`assets/\`; the build compiles them into the page. An \`assets/credits.json\`\n(\`[{ "name": "...", "license": "...", "author": "...", "url": "..." }]\`) becomes \`dist/CREDITS.txt\`.\n\nAfter \`git init\`, run \`npm run hooks:install\` to enable the included pre-commit hook.\nIt runs \`npm run check\` and \`npm test\`; add your tests under \`tests/\`.\n`,
	};
}

/** writes the project into `folder`; refuses a folder that already holds files, so nothing is overwritten */
export function initProject(folder) {
	const target = resolve(folder);
	if (existsSync(target) && readdirSync(target).length > 0) {
		throw new Error(`${target} is not empty; run mwg-init in a new or empty folder`);
	}
	const written = [];
	for (const [path, content] of Object.entries(
		initFiles(
			basename(target)
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, '-'),
		),
	)) {
		const file = join(target, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content, { encoding: 'utf8', mode: path === '.githooks/pre-commit' ? 0o755 : 0o644 });
		written.push(path);
	}
	return { folder: target, files: written };
}

//no top-level await: this module is also imported, and the real path covers an npm bin symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const folder = process.argv[2];
	if (folder === '--help' || folder === '-h') {
		console.log('usage: mwg-init <new folder>');
	} else if (!folder) {
		console.error('usage: mwg-init <new folder>');
		process.exitCode = 2;
	} else {
		try {
			const { folder: target, files } = initProject(folder);
			console.log(`wrote ${files.length} files to ${target}\nnext: cd ${folder} && npm install && npm run dev`);
		} catch (error) {
			console.error(error.message);
			process.exitCode = 1;
		}
	}
}
