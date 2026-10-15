import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assetReport } from '../tools/asset-report.mjs';

function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'mwg-assets-'));
	const dist = join(root, 'dist');
	const assets = join(root, 'assets');
	mkdirSync(join(dist, 'assets'), { recursive: true });
	mkdirSync(join(assets, 'props'), { recursive: true });
	writeFileSync(
		join(dist, 'index.html'),
		'<!doctype html><html><head></head><body><script src="game.js"></script></body></html>',
	);
	writeFileSync(join(dist, 'game.js'), 'var x = " pontifex ";'.repeat(200));
	writeFileSync(join(dist, 'assets', 'group.js'), '//generated\n' + 'var g={};'.repeat(100));
	const tiles = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 251));
	writeFileSync(join(assets, 'tiles.png'), tiles);
	writeFileSync(join(assets, 'props', 'tiles.png'), tiles);
	writeFileSync(join(assets, 'song.ogg'), Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 37) % 251)));
	writeFileSync(join(assets, 'credits.json'), JSON.stringify([{ name: 'pack', license: 'CC0' }]));
	writeFileSync(join(assets, 'notes.foo'), 'not an asset type');
	return { dist, assets };
}

function squeezed(data: Uint8Array) {
	return {
		gzip: gzipSync(data, { level: 9 }).length,
		brotli: brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
	};
}

test('lists every emitted file with deterministic compressed weights', async () => {
	const { dist, assets } = fixture();
	const first = await assetReport({ dist, assets });
	const second = await assetReport({ dist, assets });
	assert.deepEqual(second, first);

	assert.deepEqual(
		first.files.map((file) => file.path),
		['assets/group.js', 'game.js', 'index.html'],
	);
	const game = first.files.find((file) => file.path === 'game.js')!;
	const body = 'var x = " pontifex ";'.repeat(200);
	assert.equal(game.raw, body.length);
	const expected = squeezed(Buffer.from(body, 'utf8'));
	assert.equal(game.gzip, expected.gzip);
	assert.equal(game.brotli, expected.brotli);
	const total = first.files.reduce((sum, file) => sum + file.gzip, 0);
	for (const file of first.files) assert.equal(file.share, file.gzip / total);
	const shares = first.files.reduce((sum, file) => sum + file.share, 0);
	assert.ok(Math.abs(shares - 1) < 1e-12);
});

test('inventories embedded sources, skips credits and unknown types, and surfaces duplicates', async () => {
	const { dist, assets } = fixture();
	const report = await assetReport({ dist, assets });
	assert.deepEqual(
		report.assets.map((source) => source.path),
		['props/tiles.png', 'song.ogg', 'tiles.png'],
	);
	assert.deepEqual(report.duplicates, [['props/tiles.png', 'tiles.png']]);
	assert.equal(report.totals.assetFiles, 3);
	assert.equal(report.totals.assetRaw, 1024 + 1024 + 512);
});

test('missing folders fail by name', async () => {
	const { dist } = fixture();
	await assert.rejects(assetReport({ dist: join(dist, 'absent') }), /dist folder.*absent/);
	await assert.rejects(assetReport({ dist, assets: join(dist, 'absent') }), /assets folder.*absent/);
	await assert.rejects(assetReport({} as never), /dist folder/);
});
