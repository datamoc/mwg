import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { mwgPage } from '../tools/vite.mjs';
import { compileResources } from '../tools/compile-resources.mjs';

function fixture(): string {
	const dir = mkdtempSync(join(tmpdir(), 'mwg-filter-'));
	mkdirSync(join(dir, 'assets', 'portraits'), { recursive: true });
	writeFileSync(join(dir, 'assets', 'keep.txt'), 'included');
	writeFileSync(join(dir, 'assets', 'omit.txt'), 'excluded');
	writeFileSync(join(dir, 'assets', 'portraits', 'one.svg'), '<svg/>');
	writeFileSync(join(dir, 'assets', 'unknown.bin'), 'unsupported');
	return dir;
}

async function emittedAssets(dir: string, assetFiles?: readonly string[]): Promise<Record<string, string>> {
	const result = await compileResources({ from: join(dir, 'assets'), to: join(dir, 'out'), assetFiles });
	const window: { __MWG_ASSETS__?: Record<string, string> } = {};
	for (const group of result.groups)
		runInNewContext(readFileSync(join(dir, 'out', `${group.name}.js`), 'utf8'), { window });
	return window.__MWG_ASSETS__ ?? {};
}

test('asset filtering embeds exactly the explicit list, while omission preserves all supported assets', async () => {
	const dir = fixture();
	try {
		assert.deepEqual(Object.keys(await emittedAssets(dir, ['keep.txt', 'portraits/one.svg'])).sort(), [
			'keep.txt',
			'portraits/one.svg',
		]);
		assert.deepEqual(Object.keys(await emittedAssets(dir)).sort(), ['keep.txt', 'omit.txt', 'portraits/one.svg']);
		assert.deepEqual(await emittedAssets(dir, []), {});
		assert.deepEqual(
			Object.keys(await emittedAssets(dir, ['./keep.txt', 'keep.txt', 'portraits\\one.svg'])).sort(),
			['keep.txt', 'portraits/one.svg'],
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('unknown and unsupported requested assets fail by name before replacing existing output', async () => {
	const dir = fixture();
	try {
		await emittedAssets(dir, ['keep.txt']);
		for (const name of ['ghost.svg', '../keep.txt', 'unknown.bin']) {
			await assert.rejects(
				() => emittedAssets(dir, [name]),
				(error) => error instanceof Error && error.message.includes(name),
			);
			assert.equal(existsSync(join(dir, 'out', 'assets.js')), true);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('mwgPage forwards assetFiles into the real emitted local-file page', async () => {
	const dir = fixture();
	try {
		writeFileSync(join(dir, 'main.js'), 'window.started = true;');
		writeFileSync(
			join(dir, 'index.html'),
			'<html><head></head><body><script type="module" src="./main.js"></script></body></html>',
		);
		await build({
			configFile: false,
			root: dir,
			logLevel: 'silent',
			plugins: [mwgPage({ assetFiles: ['keep.txt'], sbom: false, compress: false, singleFile: true })],
		});
		const html = readFileSync(join(dir, 'dist', 'standalone.html'), 'utf8');
		const payloads = JSON.parse(/var PAYLOADS=(.*);/.exec(html)![1]) as { b64: string }[];
		const decoded = payloads.map((p) => Buffer.from(p.b64, 'base64').toString('utf8')).join('\n');
		assert.ok(decoded.includes('keep.txt'));
		assert.ok(!decoded.includes('omit.txt'));
		assert.ok(!decoded.includes('portraits/one.svg'));
		const entry = readFileSync(join(dir, 'dist', 'index.html'), 'utf8');
		assert.doesNotMatch(entry, /type="module"/);
		await assert.rejects(
			() =>
				build({
					configFile: false,
					root: dir,
					logLevel: 'silent',
					plugins: [mwgPage({ assetFiles: ['missing.svg'], sbom: false, compress: false })],
				}),
			/unknown asset file missing.svg/,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
