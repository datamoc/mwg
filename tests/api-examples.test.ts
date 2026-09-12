import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { execFileSync } from 'node:child_process';

import { publicPathMap } from './helpers/publicPaths.ts';

import * as core from '../src/core/index.ts';
import * as assets from '../src/assets/index.ts';
import * as audio from '../src/audio/index.ts';
import * as battle from '../src/battle/index.ts';
import * as board from '../src/board/index.ts';
import * as actors from '../src/actors/index.ts';
import * as roguelike from '../src/roguelike/index.ts';
import * as rpg from '../src/rpg/index.ts';
import * as simulation from '../src/simulation/index.ts';
import * as twoD from '../src/two-d/index.ts';
import * as render from '../src/two-d/render/index.ts';
import * as ui from '../src/two-d/ui/index.ts';
import * as stage from '../src/two-d/stage/index.ts';
import * as world from '../src/world/index.ts';
import * as i18n from '../src/i18n/index.ts';
import * as mwl from '../src/mwl/index.ts';
import * as mwlFengari from '../src/mwl/fengari.ts';
import * as ai from '../src/ai/index.ts';
import * as aiLua from '../src/ai/lua.ts';

/**
 * Every exported class, function and namespace should carry a working `@example` - not
 * because a doc comment can't be trusted otherwise, but because it demonstrably can't be
 * trusted otherwise: `REFERENCE.md`, the webpage's own description of the framework, and its
 * architecture diagrams were all hand-maintained and all went stale in exactly the same way,
 * caught only once each got a test that checks it against the real code instead of good
 * intentions.
 *
 * Two things are checked here, both against the real, current source:
 *
 * 1. **Coverage** - every runtime export named in `MODULES` (below, the same enumeration
 *    `reference-doc.test.ts` uses) has at least one `@example` code fence somewhere under
 *    `src/` that mentions it by name. A sample is matched by content, not by which file it
 *    lives in, since tracing "which file declares this re-exported name" is exactly the kind
 *    of fragile bookkeeping this project avoids elsewhere.
 * 2. **Compilation** - every `@example` fence is written to its own file and type-checked
 *    with `tsc`, importing through the *public* `@datamoc/mw_games/...` paths a real user
 *    would write, path-mapped onto `src/` rather than a build. The mapping is derived from
 *    `package.json`'s own `exports` field (`./dist/X/index.js` -> `../src/X/index.ts`), so a
 *    module rename updates the check automatically instead of leaving it to point at a path
 *    that no longer exists.
 *
 * `three-d` is excluded, matching `reference-doc.test.ts`: it imports Babylon, an optional
 * peer dependency a plain `npm test` run has no reason to have installed.
 */
const MODULES: Record<string, Record<string, unknown>> = {
	core,
	assets,
	audio,
	battle,
	board,
	actors,
	roguelike,
	rpg,
	simulation,
	'two-d': twoD,
	render,
	ui,
	stage,
	world,
	i18n,
	mwl,
	'mwl/fengari': mwlFengari,
	ai,
	'ai/lua': aiLua,
};

const ROOT = resolvePath(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = join(ROOT, 'src');

interface ExampleFence {
	file: string;
	code: string;
}

/** every `.ts` file under `dir`, recursively */
function walkTs(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const info = statSync(full);
		if (info.isDirectory()) out.push(...walkTs(full));
		else if (entry.endsWith('.ts')) out.push(full);
	}
	return out;
}

/** every `@example` fenced ```ts block in every doc comment under `src/` */
function collectExamples(): ExampleFence[] {
	const fences: ExampleFence[] = [];
	const blockPattern = /\/\*\*[\s\S]*?\*\//g;
	//deliberately loose about what sits between `@example` and the fence (a line-leading " * ",
	// CRLF vs LF, extra blank lines) - only the fence markers themselves are load-bearing
	const fencePattern = /@example[\s\S]*?```(?:ts|typescript)\r?\n([\s\S]*?)```/;

	for (const file of walkTs(SRC)) {
		const source = readFileSync(file, 'utf8');
		for (const block of source.match(blockPattern) ?? []) {
			if (!block.includes('@example')) continue;
			const match = block.match(fencePattern);
			if (!match) continue;

			//strip the doc comment's leading " * " from every line of the fenced code, and any
			//trailing \r a CRLF checkout left behind
			const code = match[1]
				.split('\n')
				.map((line) => line.replace(/\r$/, '').replace(/^\s*\*\s?/, ''))
				.join('\n')
				.trim();
			if (code) fences.push({ file, code });
		}
	}
	return fences;
}

const examples = collectExamples();

test('every runtime export has a working @example somewhere under src/', () => {
	const covered = examples.map((e) => e.code).join('\n\n');
	const missing: string[] = [];

	for (const [moduleName, namespace] of Object.entries(MODULES)) {
		for (const exported of Object.keys(namespace)) {
			const mentioned = new RegExp(`\\b${exported.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(covered);
			if (!mentioned) missing.push(`${moduleName}.${exported}`);
		}
	}

	assert.deepEqual(
		missing,
		[],
		`these exports have no @example anywhere under src/ - add one to the doc comment on their declaration:\n${missing.join('\n')}`,
	);
});

test('every @example fence actually compiles against the real public import paths', () => {
	assert.ok(examples.length > 0, 'collectExamples() found nothing - the extraction regex itself is broken');

	//inside the project root, not the OS temp dir: `pixi.js`/`@babylonjs` imports in an
	//example need ordinary node_modules resolution to walk up and find the real install,
	//which it cannot do from outside the project tree entirely
	const scratchRoot = join(ROOT, '.example-check');
	mkdirSync(scratchRoot, { recursive: true });
	const dir = mkdtempSync(join(scratchRoot, 'run-'));
	try {
		const pathMap = publicPathMap();
		const files = examples.map((example, i) => {
			const file = join(dir, `example-${i}.ts`);
			writeFileSync(file, example.code, 'utf8');
			return file;
		});

		const tsconfig = {
			compilerOptions: {
				module: 'esnext',
				moduleResolution: 'bundler',
				target: 'es2022',
				strict: true,
				skipLibCheck: true,
				noEmit: true,
				types: [],
				//the real tsconfig sets this too: every relative import under src/ carries an
				//explicit .ts extension, rewritten to .js only on emit
				allowImportingTsExtensions: true,
				paths: Object.fromEntries(Object.entries(pathMap).map(([specifier, path]) => [specifier, [path]])),
			},
			include: files,
		};
		const tsconfigPath = join(dir, 'tsconfig.json');
		writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf8');

		try {
			execFileSync('npx', ['tsc', '--noEmit', '-p', tsconfigPath], { cwd: ROOT, stdio: 'pipe', shell: true });
		} catch (error) {
			const output = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
			//map the temp file back to the source doc comment it came from, so a failure points
			//at the file to fix rather than an anonymous scratch path
			const annotated = files.reduce(
				(text, file, i) => text.split(file).join(`${examples[i].file} (example ${i})`),
				output,
			);
			assert.fail(`one or more @example fences fail to compile:\n\n${annotated}`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
