import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';

import { buildSingleFile } from '../tools/single-file.mjs';

async function withEmittedPage(fn: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'mwg-single-file-'));
	try {
		await writeFile(
			join(dir, 'index.html'),
			'<!doctype html>\n<html><head><title>t</title></head><body>\n' +
				'\t<canvas id="c"></canvas>\n' +
				'\t<script defer src="./assets/assets.js"></script>\n' +
				'\t<script defer src="./entry-abc123.js"></script>\n' +
				'</body></html>\n',
		);
		await writeFile(join(dir, 'assets.js'), 'window.__MWG_ASSETS__={};\n');
		// emit-page.mjs writes asset scripts under dist/assets/, referenced as ./assets/assets.js
		const { mkdir } = await import('node:fs/promises');
		await mkdir(join(dir, 'assets'), { recursive: true });
		await writeFile(join(dir, 'assets', 'assets.js'), 'window.__MWG_ASSETS__={};\n');
		await writeFile(join(dir, 'entry-abc123.js'), 'console.log("game started");\n'.repeat(200));
		await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('buildSingleFile inlines every <script src> in order and drops the tags', async () => {
	await withEmittedPage(async (dir) => {
		const result = await buildSingleFile({ dist: dir });
		assert.equal(result.scripts, 2);

		const page = await readFile(result.path, 'utf8');
		assert.ok(!page.includes('<script defer src='), 'no sibling <script src> tag should remain');

		// document order matters: __MWG_ASSETS__ must decode/run before the bundle needs it, so the
		// embedded payload order must match the original <script> tag order, not just be present.
		const match = page.match(/var PAYLOADS=(\[.*?\]);\n/);
		assert.ok(match, 'expected an embedded PAYLOADS array');
		const payloads = JSON.parse(match![1]);
		assert.deepEqual(
			payloads.map((p: { name: string }) => p.name),
			['assets.js', 'entry-abc123.js'],
		);
		assert.equal(Buffer.from(payloads[0].b64, 'base64').toString('utf8'), 'window.__MWG_ASSETS__={};\n');
	});
});

test('buildSingleFile is additive: the original index.html and its scripts are untouched', async () => {
	await withEmittedPage(async (dir) => {
		await buildSingleFile({ dist: dir });
		const original = await readFile(join(dir, 'index.html'), 'utf8');
		assert.ok(original.includes('<script defer src="./assets/assets.js"></script>'));
		await readFile(join(dir, 'entry-abc123.js'), 'utf8'); // still present, does not throw
	});
});

test('buildSingleFile with compress: true gzips each script, and the browser-side decode path round-trips', async () => {
	await withEmittedPage(async (dir) => {
		const result = await buildSingleFile({ dist: dir, compress: true, level: 9 });
		const page = await readFile(result.path, 'utf8');

		assert.ok(page.includes('FORMAT="gzip"'));
		assert.ok(
			page.includes('DecompressionStream'),
			'the bootstrap must use the native decode API, not a shipped one',
		);

		// Pull the embedded payload back out and decode it the same way gunzipSync would, to prove
		// the bytes buildSingleFile wrote are a real gzip stream, not just base64 of the raw source.
		const match = page.match(/var PAYLOADS=(\[.*?\]);\n/);
		assert.ok(match, 'expected an embedded PAYLOADS array');
		const payloads = JSON.parse(match![1]);
		assert.equal(payloads.length, 2);
		const bundle = payloads.find((p: { name: string }) => p.name === 'entry-abc123.js');
		assert.ok(bundle);
		const decompressed = gunzipSync(Buffer.from(bundle.b64, 'base64')).toString('utf8');
		assert.equal(decompressed, 'console.log("game started");\n'.repeat(200));
	});
});

test('buildSingleFile decode path also round-trips through the real DecompressionStream API', async () => {
	// Same API name the generated browser bootstrap calls (`new DecompressionStream('gzip')`),
	// available in Node without a DOM - this is the closest this test suite can get to actually
	// running the generated script without a browser.
	await withEmittedPage(async (dir) => {
		const result = await buildSingleFile({ dist: dir, compress: true });
		const page = await readFile(result.path, 'utf8');
		const match = page.match(/var PAYLOADS=(\[.*?\]);\n/);
		const payloads = JSON.parse(match![1]);
		const assets = payloads.find((p: { name: string }) => p.name === 'assets.js');

		const bytes = Buffer.from(assets.b64, 'base64');
		const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
		const buf = await new Response(stream).arrayBuffer();
		assert.equal(new TextDecoder().decode(buf), 'window.__MWG_ASSETS__={};\n');
	});
});

test('buildSingleFile without compress embeds plain base64, decodable without DecompressionStream', async () => {
	await withEmittedPage(async (dir) => {
		const result = await buildSingleFile({ dist: dir, compress: false });
		const page = await readFile(result.path, 'utf8');
		assert.ok(page.includes('FORMAT=""'));

		const match = page.match(/var PAYLOADS=(\[.*?\]);\n/);
		const payloads = JSON.parse(match![1]);
		const bundle = payloads.find((p: { name: string }) => p.name === 'entry-abc123.js');
		assert.equal(Buffer.from(bundle.b64, 'base64').toString('utf8'), 'console.log("game started");\n'.repeat(200));
	});
});

test('buildSingleFile with algorithm: brotli compresses with brotli, and round-trips', async () => {
	await withEmittedPage(async (dir) => {
		const result = await buildSingleFile({ dist: dir, compress: true, algorithm: 'brotli' });
		const page = await readFile(result.path, 'utf8');

		assert.ok(page.includes('FORMAT="br"'));

		const match = page.match(/var PAYLOADS=(\[.*?\]);\n/);
		assert.ok(match, 'expected an embedded PAYLOADS array');
		const payloads = JSON.parse(match![1]);
		const bundle = payloads.find((p: { name: string }) => p.name === 'entry-abc123.js');
		assert.ok(bundle);
		const decompressed = brotliDecompressSync(Buffer.from(bundle.b64, 'base64')).toString('utf8');
		assert.equal(decompressed, 'console.log("game started");\n'.repeat(200));
	});
});

test('buildSingleFile bootstrap: an unsupported DecompressionStream format rejects rather than throwing synchronously', async () => {
	// `new DecompressionStream(fmt)` throws synchronously (a TypeError, not a rejected promise)
	// when the browser does not support `fmt` - a real Chrome build hit exactly this for 'br'
	// during this feature's own verification pass. decodeText must convert that synchronous
	// throw into a rejection, or the runNext().catch(...) chain never runs and a splash screen
	// is stuck forever instead of failing visibly. This extracts the actual generated
	// `decodeText` function text out of the bootstrap and exercises it directly, with a fake
	// DecompressionStream standing in for the unsupported-format browser behaviour.
	await withEmittedPage(async (dir) => {
		const result = await buildSingleFile({ dist: dir, compress: true, algorithm: 'brotli' });
		const page = await readFile(result.path, 'utf8');
		const match = page.match(/function decodeText\(bytes\)\{[\s\S]*?\n\t\}/);
		assert.ok(match, 'expected to find the generated decodeText function');

		class FakeDecompressionStream {
			constructor(format: string) {
				throw new TypeError(
					`Failed to construct 'DecompressionStream': Unsupported compression format: '${format}'`,
				);
			}
		}
		const decodeText = new Function(
			'DecompressionStream',
			'Blob',
			'Response',
			'TextDecoder',
			'FORMAT',
			`${match![0]}\nreturn decodeText;`,
		)(FakeDecompressionStream, Blob, Response, TextDecoder, 'br');

		// the call itself must not throw synchronously...
		const promise = decodeText(new Uint8Array([1, 2, 3]));
		// ...and the promise it returns must reject, not hang or resolve
		await assert.rejects(promise, /Unsupported compression format/);
	});
});

test('buildSingleFile rejects an unknown algorithm rather than silently falling back', async () => {
	await withEmittedPage(async (dir) => {
		await assert.rejects(
			// @ts-expect-error - deliberately invalid to test the runtime guard
			buildSingleFile({ dist: dir, compress: true, algorithm: 'deflate' }),
			/algorithm must be 'gzip' or 'brotli'/,
		);
	});
});

test('buildSingleFile includes a splash screen by default, removable via splash: false', async () => {
	await withEmittedPage(async (dir) => {
		const withSplash = await buildSingleFile({ dist: dir });
		const pageWith = await readFile(withSplash.path, 'utf8');
		assert.ok(pageWith.includes('id="mwg-splash"'));
		assert.ok(pageWith.includes('removeSplash'));

		const withoutSplash = await buildSingleFile({ dist: dir, splash: false, output: 'standalone-no-splash.html' });
		const pageWithout = await readFile(withoutSplash.path, 'utf8');
		assert.ok(!pageWithout.includes('id="mwg-splash"'));
	});
});

test('buildSingleFile writes to a custom output name inside dist, without clobbering index.html', async () => {
	await withEmittedPage(async (dir) => {
		const result = await buildSingleFile({ dist: dir, output: 'game.html' });
		assert.equal(result.path, join(dir, 'game.html'));
		await readFile(join(dir, 'index.html'), 'utf8'); // still present
	});
});

test('buildSingleFile throws a clear error when the page has no <script src> to inline', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mwg-single-file-empty-'));
	try {
		await writeFile(join(dir, 'index.html'), '<!doctype html><html><body>no scripts here</body></html>');
		await assert.rejects(buildSingleFile({ dist: dir }), /no <script src/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('buildSingleFile refuses a path-shaped output rather than joining it onto dist', async () => {
	await withEmittedPage(async (dir) => {
		// `output` is a name written inside `dist`, so an absolute path (or any path) used to
		// become `<dist>/<that path>` and fail later inside writeFile with ENOENT on a
		// doubled-up path; the argument itself is what is wrong, so it is what should throw.
		await assert.rejects(buildSingleFile({ dist: dir, output: join(dir, 'elsewhere', 'game.html') }), /not a path/);
		await assert.rejects(buildSingleFile({ dist: dir, output: 'nested/game.html' }), /not a path/);
	});
});
