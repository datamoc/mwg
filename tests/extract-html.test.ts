import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { extractHtml } from '../tools/extract-html.mjs';

test('extract-html writes inline resources and rewrites a copy', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'mwg-extract-'));
	try {
		const input = join(directory, 'page.html');
		const output = join(directory, 'extracted');
		await writeFile(input, '<!doctype html><style>.hero{color:red}</style><img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"><script>window.EXTRACTED=1</script>');
		const result = await extractHtml(input, output);
		assert.equal(result.resources.length, 3);
		assert.deepEqual(result.resources.map((resource) => resource.kind), ['style', 'data-uri', 'script']);
		const html = await readFile(join(output, 'index.html'), 'utf8');
		assert.match(html, /href="\.\/assets\/inline-0001\.css"/);
		assert.match(html, /src="\.\/assets\/inline-0002\.svg"/);
		assert.match(html, /src="\.\/assets\/inline-0003\.js"/);
		assert.equal((await readFile(join(output, 'assets', 'inline-0003.js'), 'utf8')).trim(), 'window.EXTRACTED=1');
		assert.equal((await readFile(input, 'utf8')).includes('<style>'), true);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('extract-html deduplicates identical data resources and reports module relocation', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'mwg-extract-'));
	try {
		const input = join(directory, 'page.html');
		const output = join(directory, 'extracted');
		await writeFile(input, '<script type="module">import "./dep.js"</script><img src="data:text/plain,hello"><img src="data:text/plain,hello">');
		const result = await extractHtml(input, output);
		assert.equal(result.resources.length, 2);
		assert.equal(result.warnings.length, 1);
		assert.match(result.warnings[0], /relative imports/);
		assert.equal((await readFile(join(output, 'manifest.json'), 'utf8')).includes('fingerprint'), true);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('extract-html rewrites data URLs inside inline CSS', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'mwg-extract-'));
	try {
		const input = join(directory, 'page.html');
		const output = join(directory, 'extracted');
		await writeFile(input, '<style>.hero{background:url("data:image/png;base64,aGVsbG8=")}</style>');
		const result = await extractHtml(input, output);
		assert.equal(result.resources.length, 2);
		assert.equal(result.resources[1].kind, 'css-data-uri');
		assert.match(await readFile(join(output, 'assets', 'inline-0001.css'), 'utf8'), /url\("\.\/inline-0002\.png"\)/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('extract-html rewrites every data candidate in srcset', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'mwg-extract-'));
	try {
		const input = join(directory, 'page.html');
		const output = join(directory, 'extracted');
		await writeFile(input, '<img srcset="data:image/png;base64,YQ== 1x, data:image/png;base64,Yg== 2x">');
		const result = await extractHtml(input, output);
		assert.equal(result.resources.length, 2);
		assert.match(await readFile(join(output, 'index.html'), 'utf8'), /inline-0001\.png 1x, \.\/assets\/inline-0002\.png 2x/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
