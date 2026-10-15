import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildExampleIndex, renderExampleIndex } from '../tools/build-example-index.mjs';

/**
 * The examples index (`tools/build-example-index.mjs`) is read from source text, so these
 * tests need no typedoc install and no renderer: one pass over the real checkout for the
 * coverage claims, and a throwaway repository for the cases the real one cannot be made to
 * hold (an example full of HTML metacharacters, a symbol with no example).
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const real = buildExampleIndex({ root: ROOT });

/** `3d` imports Babylon, which `api-examples.test.ts` leaves out for the same reason: few examples there yet */
const OPTIONAL = new Set(['3d']);

test('every public module has at least one example entry', () => {
	assert.ok(real.modules.length > 10, 'the module list should come from package.json exports');
	const empty = real.modules.filter((m) => !OPTIONAL.has(m.name) && m.symbols.length === 0 && !m.overview);
	assert.deepEqual(
		empty.map((m) => m.name),
		[],
		'these modules list nothing: give an exported symbol an @example',
	);
});

test('every examples/ directory with an index.html is listed', () => {
	const expected = readdirSync(join(ROOT, 'examples')).filter((n) =>
		existsSync(join(ROOT, 'examples', n, 'index.html')),
	);
	assert.deepEqual(real.runnable.map((e) => e.name).sort(), expected.sort());
	for (const example of real.runnable) {
		for (const name of example.modules)
			assert.ok(
				real.modules.some((m) => m.name === name),
				name,
			);
	}
});

test('no symbol is listed twice in a module, and each carries its example', () => {
	for (const module of real.modules) {
		const names = module.symbols.map((s) => s.name);
		assert.equal(new Set(names).size, names.length, `${module.name} lists a symbol twice`);
		for (const symbol of module.symbols) assert.ok(symbol.example.trim(), `${module.name}.${symbol.name}`);
	}
});

/** a repository with one module, one documented and one undocumented export, and one runnable example */
function fixture(example: string): string {
	const root = mkdtempSync(join(tmpdir(), 'example-index-'));
	const write = (path: string, text: string) => {
		mkdirSync(join(root, path, '..'), { recursive: true });
		writeFileSync(join(root, path), text);
	};
	write(
		'package.json',
		JSON.stringify({
			name: '@fix/lib',
			exports: {
				'.': { import: './dist/index.js' },
				'./thing': { import: './dist/thing/index.js' },
				'./tools/x': './tools/x.mjs',
			},
		}),
	);
	write('src/index.ts', "export * from './thing/index.ts';\n");
	write('src/thing/index.ts', "export { Documented, Bare } from './a.ts';\nexport type { Shape } from './a.ts';\n");
	write(
		'src/thing/a.ts',
		[
			'/**',
			' * Does a thing with <b> & "quotes".',
			' *',
			' * @example',
			' * ```ts',
			...example.split('\n').map((line) => ` * ${line}`),
			' * ```',
			' */',
			'export class Documented {}',
			'',
			'/** no example here */',
			'export class Bare {}',
			'',
			'export type Shape = number;',
			'',
		].join('\n'),
	);
	write('REFERENCE.md', '# ref\n\n## `thing`\n\ntext\n');
	write('examples/README.md', '| `demo` | 1 | shows <the> thing & more |\n');
	write('examples/demo/index.html', '<html></html>');
	write('examples/demo/main.ts', "import { Documented } from '@fix/lib/thing';\nvoid Documented;\n");
	return root;
}

test('a symbol without an @example is never listed; tools subpaths are skipped', () => {
	const root = fixture('const x = 1;');
	try {
		const model = buildExampleIndex({ root });
		assert.deepEqual(
			model.modules.map((m) => m.name),
			['thing'],
		);
		assert.deepEqual(
			model.modules[0].symbols.map((s) => s.name),
			['Documented'],
		);
		assert.deepEqual(model.modules[0].runnable, ['demo']);
		assert.equal(model.runnable[0].description, 'shows <the> thing & more');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('HTML metacharacters in an example, a summary and a description are escaped', () => {
	const root = fixture('const s = "<script>alert(\'x\')</script> & done";');
	try {
		const html = renderExampleIndex(buildExampleIndex({ root }));
		assert.ok(!html.includes('<script'), 'a raw <script> tag leaked into the page');
		assert.ok(html.includes('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; done'));
		assert.ok(html.includes('Does a thing with &lt;b&gt; &amp; &quot;quotes&quot;.'));
		assert.ok(html.includes('shows &lt;the&gt; thing &amp; more'));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('the output is deterministic and self-contained', () => {
	const first = renderExampleIndex(buildExampleIndex({ root: ROOT }));
	const second = renderExampleIndex(buildExampleIndex({ root: ROOT }));
	assert.equal(first, second);
	assert.ok(!/<script|<link|https?:\/\/[^"' ]+\.(?:js|css)/.test(first), 'no scripts or external assets');
	assert.ok(first.includes('prefers-color-scheme'));
});

test('a symbol links to the typedoc page that exists for it, and to the reference when there is none', () => {
	//typedoc names a page <entry>.<Namespace>.<Name>.html: a root name has no namespace, a module's own names do
	const api = mkdtempSync(join(tmpdir(), 'mwg-api-'));
	try {
		for (const [dir, file] of [
			['classes', 'index.SaveSystem.html'],
			['functions', 'index.Audio.subsetSoundFont.html'],
			['functions', 'index.parseTwee.html'],
			['types', 'index.Audio.MissingProgram.html'],
			['functions', 'mwl_presentation.compilePresentation.html'],
		]) {
			mkdirSync(join(api, dir), { recursive: true });
			writeFileSync(join(api, dir, file), '<html></html>');
		}
		const index = buildExampleIndex({ root: ROOT, apiDir: api });
		const link = (module: string, name: string) =>
			index.modules.find((m) => m.name === module)?.symbols.find((s) => s.name === name)?.link;

		assert.deepEqual(link('core', 'SaveSystem'), {
			label: 'API page',
			href: './api/classes/index.SaveSystem.html',
		});
		assert.deepEqual(link('audio', 'subsetSoundFont'), {
			label: 'API page',
			href: './api/functions/index.Audio.subsetSoundFont.html',
		});
		assert.deepEqual(link('mwl/presentation', 'compilePresentation'), {
			label: 'API page',
			href: './api/functions/mwl_presentation.compilePresentation.html',
		});
		//no page for it in this fake output: the module's reference section instead
		assert.equal(link('audio', 'parseSoundFont')?.label, 'Reference');
		assert.equal(link('core', 'SaveSystem')?.href.includes('type-aliases'), false);
	} finally {
		rmSync(api, { recursive: true, force: true });
	}
});
