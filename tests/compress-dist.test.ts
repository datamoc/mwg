import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';

import { compressDist, hasXz } from '../tools/compress-dist.mjs';

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'mwg-compress-'));
	try {
		await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('compressDist writes .gz and .br siblings that round-trip, and skips the rest', async () => {
	await withTmpDir(async (dir) => {
		const text = 'var game = 1;\n'.repeat(500);
		await writeFile(join(dir, 'game.js'), text);
		await writeFile(join(dir, 'tiny.js'), 'var a = 1;\n');
		await writeFile(join(dir, 'sprite.png'), Buffer.alloc(2048, 7));

		const rows = await compressDist(dir);

		assert.equal(rows.length, 1);
		assert.equal(rows[0].file, 'game.js');
		assert.ok(rows[0].gzip > 0);
		assert.ok(rows[0].brotli > 0);
		assert.ok(rows[0].brotli <= rows[0].gzip);

		const gz = await readFile(join(dir, 'game.js.gz'));
		const br = await readFile(join(dir, 'game.js.br'));
		assert.equal(gunzipSync(gz).toString('utf8'), text);
		assert.equal(brotliDecompressSync(br).toString('utf8'), text);

		await assert.rejects(readFile(join(dir, 'tiny.js.gz')));
		await assert.rejects(readFile(join(dir, 'sprite.png.gz')));
	});
});

test('hasXz reports whether the opt-in LZMA2 pass can run', () => {
	assert.equal(typeof hasXz(), 'boolean');
});
