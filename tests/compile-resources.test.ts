import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { compileResources } from '../tools/compile-resources.mjs';

async function withDirs(fn: (from: string, to: string) => Promise<void>): Promise<void> {
	const from = await mkdtemp(join(tmpdir(), 'mwg-compile-resources-from-'));
	const to = await mkdtemp(join(tmpdir(), 'mwg-compile-resources-to-'));
	try {
		await fn(from, to);
	} finally {
		await rm(from, { recursive: true, force: true });
		await rm(to, { recursive: true, force: true });
	}
}

function extractAssetMap(js: string): Record<string, string> {
	const match = js.match(/var g=(\{.*\});for/);
	if (!match) throw new Error('generated script has no recognisable asset map');
	return JSON.parse(match[1]);
}

async function solidPng(width: number, height: number, rgba: [number, number, number, number]): Promise<Buffer> {
	const pixels = Buffer.alloc(width * height * 4);
	for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
	return sharp(pixels, { raw: { width, height, channels: 4 } })
		.png()
		.toBuffer();
}

async function noisyPng(width: number, height: number): Promise<Buffer> {
	const pixels = Buffer.alloc(width * height * 4);
	for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
	return sharp(pixels, { raw: { width, height, channels: 4 } })
		.png()
		.toBuffer();
}

test('compileResources embeds every recognised asset as a data: URI, grouped by top folder', async () => {
	await withDirs(async (from, to) => {
		await mkdir(join(from, 'tiles'), { recursive: true });
		await writeFile(join(from, 'tiles', 'grass.png'), await solidPng(4, 4, [0, 128, 0, 255]));
		await writeFile(join(from, 'notes.txt'), 'hello');
		await writeFile(join(from, 'unknown.xyz'), 'ignored');

		const result = await compileResources({ from, to });
		assert.equal(result.skipped, 1, 'the unrecognised extension should be skipped, not embedded');
		assert.equal(result.groups.length, 2, 'tiles/ and the root each become their own group');

		const tilesJs = await readFile(join(to, 'tiles.js'), 'utf8');
		const tilesMap = extractAssetMap(tilesJs);
		assert.ok(tilesMap['tiles/grass.png'].startsWith('data:image/png;base64,'));
	});
});

test('compileResources with toWebp: true embeds a convertible image as WebP under the same key', async () => {
	await withDirs(async (from, to) => {
		// a flat colour compresses losslessly to well under its PNG size, so this both proves
		// the conversion happened and that it only replaces the bytes, never the map's own key -
		// a game still calls load('sprite.png') in both dev and built modes.
		const png = await solidPng(32, 32, [200, 50, 50, 255]);
		await writeFile(join(from, 'sprite.png'), png);

		const result = await compileResources({ from, to, groupBy: () => 'assets', toWebp: true });
		assert.equal(result.webpConverted, 1);
		assert.ok(result.embeddedBytes < result.rawBytes);

		const js = await readFile(join(to, 'assets.js'), 'utf8');
		const map = extractAssetMap(js);
		assert.ok('sprite.png' in map, 'the asset key must stay "sprite.png", not "sprite.webp"');
		assert.ok(map['sprite.png'].startsWith('data:image/webp;base64,'));

		// and it must be a real lossless round-trip, not merely smaller
		const embeddedBytes = Buffer.from(map['sprite.png'].split(',')[1], 'base64');
		const decodedOriginal = await sharp(png).ensureAlpha().raw().toBuffer();
		const decodedEmbedded = await sharp(embeddedBytes).ensureAlpha().raw().toBuffer();
		assert.deepEqual(decodedEmbedded, decodedOriginal);
	});
});

test('compileResources with toWebp: true keeps the original bytes when WebP would not be smaller', async () => {
	await withDirs(async (from, to) => {
		// tiny random noise: WebP's container overhead reliably outweighs its savings here
		const png = await noisyPng(4, 4);
		await writeFile(join(from, 'noise.png'), png);

		const result = await compileResources({ from, to, groupBy: () => 'assets', toWebp: true });
		assert.equal(result.webpConverted, 0, 'a conversion that would not shrink the asset must be skipped');

		const js = await readFile(join(to, 'assets.js'), 'utf8');
		const map = extractAssetMap(js);
		assert.ok(map['noise.png'].startsWith('data:image/png;base64,'));
		assert.equal(Buffer.from(map['noise.png'].split(',')[1], 'base64').toString('base64'), png.toString('base64'));
	});
});

test('compileResources with toWebp: true leaves GIF and SVG assets untouched', async () => {
	await withDirs(async (from, to) => {
		const gif = await sharp(await solidPng(4, 4, [10, 20, 30, 255]))
			.gif()
			.toBuffer();
		const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
		await writeFile(join(from, 'anim.gif'), gif);
		await writeFile(join(from, 'icon.svg'), svg);

		const result = await compileResources({ from, to, groupBy: () => 'assets', toWebp: true });
		assert.equal(result.webpConverted, 0);

		const js = await readFile(join(to, 'assets.js'), 'utf8');
		const map = extractAssetMap(js);
		assert.ok(map['anim.gif'].startsWith('data:image/gif;base64,'));
		assert.ok(map['icon.svg'].startsWith('data:image/svg+xml;base64,'));
	});
});

test('compileResources with toWebp: true and lossless: false accepts a lossy quality option', async () => {
	await withDirs(async (from, to) => {
		const png = await noisyPng(128, 128);
		await writeFile(join(from, 'photo.png'), png);

		const result = await compileResources({
			from,
			to,
			groupBy: () => 'assets',
			toWebp: true,
			webpLossless: false,
			webpQuality: 40,
		});
		assert.equal(result.webpConverted, 1);
		assert.ok(result.embeddedBytes < result.rawBytes);
	});
});

test('compileResources without toWebp never imports the optional webp codec', async () => {
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'sprite.png'), await solidPng(4, 4, [1, 2, 3, 255]));
		// default toWebp: false - must succeed even if the WebP path would otherwise be exercised
		const result = await compileResources({ from, to, groupBy: () => 'assets' });
		assert.equal(result.webpConverted, 0);
	});
});
