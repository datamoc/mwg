import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import { toWebp, WEBP_CONVERTIBLE_EXTENSIONS } from '../tools/webp-convert.mjs';

async function makePng(width: number, height: number, pixels: Buffer): Promise<Buffer> {
	return sharp(pixels, { raw: { width, height, channels: 4 } })
		.png()
		.toBuffer();
}

test('toWebp with lossless (the default) round-trips pixel-for-pixel', async () => {
	const width = 8;
	const height = 8;
	const pixels = Buffer.alloc(width * height * 4);
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i] = 255; // r
		pixels[i + 1] = 20; // g
		pixels[i + 2] = 60; // b
		pixels[i + 3] = 200; // a - not fully opaque, so alpha-channel fidelity is exercised too
	}
	const png = await makePng(width, height, pixels);

	const webp = await toWebp(png);
	assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
	assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');

	const decodedPng = await sharp(png).ensureAlpha().raw().toBuffer();
	const decodedWebp = await sharp(webp).ensureAlpha().raw().toBuffer();
	assert.deepEqual(decodedWebp, decodedPng, 'lossless WebP must decode to the exact same pixels as the source PNG');
});

test('toWebp with lossless: false and a low quality produces a smaller, lossy result', async () => {
	// Random noise is the case lossless compression can least exploit (no smooth gradient or
	// flat region to predict), so it reliably makes lossy's size advantage show up.
	const width = 128;
	const height = 128;
	const pixels = Buffer.alloc(width * height * 4);
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i] = Math.floor(Math.random() * 256);
		pixels[i + 1] = Math.floor(Math.random() * 256);
		pixels[i + 2] = Math.floor(Math.random() * 256);
		pixels[i + 3] = 255;
	}
	const png = await makePng(width, height, pixels);

	const lossless = await toWebp(png, { lossless: true });
	const lossy = await toWebp(png, { lossless: false, quality: 40 });
	assert.ok(lossy.length < lossless.length, 'a low-quality lossy encode should be smaller than lossless');

	// lossy is genuinely lossy: decoded pixels must differ somewhere from the source
	const decodedPng = await sharp(png).ensureAlpha().raw().toBuffer();
	const decodedLossy = await sharp(lossy).ensureAlpha().raw().toBuffer();
	assert.notDeepEqual(decodedLossy, decodedPng);
});

test('toWebp accepts JPEG source bytes too', async () => {
	const width = 8;
	const height = 8;
	const pixels = Buffer.alloc(width * height * 3);
	pixels.fill(128);
	const jpeg = await sharp(pixels, { raw: { width, height, channels: 3 } })
		.jpeg()
		.toBuffer();

	const webp = await toWebp(jpeg);
	assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
});

test('WEBP_CONVERTIBLE_EXTENSIONS names raster formats only, not GIF/SVG/WebP itself', () => {
	assert.ok(WEBP_CONVERTIBLE_EXTENSIONS.has('.png'));
	assert.ok(WEBP_CONVERTIBLE_EXTENSIONS.has('.jpg'));
	assert.ok(WEBP_CONVERTIBLE_EXTENSIONS.has('.jpeg'));
	assert.ok(!WEBP_CONVERTIBLE_EXTENSIONS.has('.gif'), 'GIF is animated - re-authoring is out of scope here');
	assert.ok(!WEBP_CONVERTIBLE_EXTENSIONS.has('.svg'), 'SVG is already vector, nothing raster to convert');
	assert.ok(!WEBP_CONVERTIBLE_EXTENSIONS.has('.webp'), 'already WebP - converting it again is pointless');
});
