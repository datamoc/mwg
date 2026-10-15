import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { compileResources } from '../tools/compile-resources.mjs';
import { parseSoundFont } from '../src/audio/SoundFont.ts';

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

test('compileResources with toWebp: true embeds whichever encoding is smaller, byte-exact', async () => {
	await withDirs(async (from, to) => {
		// tiny random noise sits within tens of bytes of the break-even point, and which
		// side of it a lossless WebP lands on differs per encoder build (it converted on one
		// platform's sharp and skipped on another's), so the test asserts the actual guarantee
		// instead of the local encoder's answer: never embed the bigger file, and whichever
		// encoding wins must round-trip to the original pixels.
		const png = await noisyPng(4, 4);
		await writeFile(join(from, 'noise.png'), png);

		const result = await compileResources({ from, to, groupBy: () => 'assets', toWebp: true });

		const js = await readFile(join(to, 'assets.js'), 'utf8');
		const map = extractAssetMap(js);
		const embeddedBytes = Buffer.from(map['noise.png'].split(',')[1], 'base64');
		assert.ok(embeddedBytes.length <= png.length, 'the embedded encoding must never be the bigger one');
		if (result.webpConverted === 0) {
			assert.ok(map['noise.png'].startsWith('data:image/png;base64,'));
			assert.equal(embeddedBytes.toString('base64'), png.toString('base64'));
		} else {
			assert.equal(result.webpConverted, 1);
			assert.ok(map['noise.png'].startsWith('data:image/webp;base64,'));
			const decodedOriginal = await sharp(png).ensureAlpha().raw().toBuffer();
			const decodedEmbedded = await sharp(embeddedBytes).ensureAlpha().raw().toBuffer();
			assert.deepEqual(decodedEmbedded, decodedOriginal);
		}
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
		const result = await compileResources({ from, to, groupBy: () => 'assets' });
		assert.equal(result.webpConverted, 0);
	});
});

/** a format-0 MIDI: piano (program 0) on channel 0, violin (40) on channel 1, a drum hit on channel 9 */
function usedProgramsMidi(): Buffer {
	const track: number[] = [
		0x00,
		0xc0,
		0x00,
		0x00,
		0x90,
		0x3c,
		0x64,
		0x60,
		0x80,
		0x3c,
		0x00, // piano note
		0x00,
		0xc1,
		0x28,
		0x00,
		0x91,
		0x40,
		0x64,
		0x60,
		0x81,
		0x40,
		0x00, // violin note
		0x00,
		0x99,
		0x24,
		0x6e,
		0x60,
		0x89,
		0x24,
		0x00, // drum hit
		0x00,
		0xff,
		0x2f,
		0x00,
	];
	const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96];
	const trackHeader = [
		0x4d,
		0x54,
		0x72,
		0x6b,
		(track.length >>> 24) & 0xff,
		(track.length >>> 16) & 0xff,
		(track.length >>> 8) & 0xff,
		track.length & 0xff,
	];
	return Buffer.from([...header, ...trackHeader, ...track]);
}

async function microGm(): Promise<Buffer> {
	return readFile(new URL('../data/microgm-opt.sf2', import.meta.url));
}

function embeddedBytes(js: string, key: string): Buffer {
	const map = extractAssetMap(js);
	assert.ok(map[key], `the compiled script embeds ${key}`);
	return Buffer.from(map[key].split(',')[1], 'base64');
}

test('the reference microgm bank and its provenance ship in the published package', async () => {
	const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
		files: string[];
	};
	assert.ok(pkg.files.includes('data/microgm-opt.sf2'), 'a game copies the WTFPL bank from the installed package');
	assert.ok(pkg.files.includes('data/microgm-opt.PROVENANCE.md'));
});

test('compileResources subsets an embedded SoundFont to the programs the embedded MIDI files use', async () => {
	await withDirs(async (from, to) => {
		const bank = await microGm();
		await writeFile(join(from, 'bank.sf2'), bank);
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());

		const result = await compileResources({ from, to, groupBy: () => 'assets' });
		assert.equal(result.skipped, 0);
		assert.deepEqual(result.soundFonts, [
			{ key: 'bank.sf2', programs: 3, rawBytes: bank.length, embeddedBytes: result.soundFonts[0].embeddedBytes },
		]);
		assert.ok(result.soundFonts[0].embeddedBytes < bank.length / 5, 'only three programs of 137 survive');

		const js = await readFile(join(to, 'assets.js'), 'utf8');
		assert.deepEqual(embeddedBytes(js, 'song.mid'), usedProgramsMidi(), 'the MIDI itself embeds byte-identical');
		const font = parseSoundFont(embeddedBytes(js, 'bank.sf2'));
		assert.equal(font.presetCount, 3);
		assert.ok(font.voices(0, 0, 60, 100).length > 0, 'the piano program still voices');
		assert.ok(font.voices(0, 40, 60, 100).length > 0, 'the violin program still voices');
		assert.ok(font.voices(128, 0, 36, 100).length > 0, 'the drum kit still voices');
		assert.equal(font.hasPreset(0, 73), false, 'an unused program is gone');
	});
});

test('compileResources embeds a SoundFont whole with soundFont: false, and without shipped MIDI to subset against', async () => {
	await withDirs(async (from, to) => {
		const bank = await microGm();
		await writeFile(join(from, 'bank.sf2'), bank);
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());

		const whole = await compileResources({ from, to, groupBy: () => 'assets', soundFont: false });
		assert.deepEqual(whole.soundFonts, [
			{ key: 'bank.sf2', programs: null, rawBytes: bank.length, embeddedBytes: bank.length },
		]);
		assert.deepEqual(embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf2'), bank);
	});
	await withDirs(async (from, to) => {
		const bank = await microGm();
		await writeFile(join(from, 'bank.sf2'), bank);

		const result = await compileResources({ from, to, groupBy: () => 'assets' });
		assert.equal(result.soundFonts[0].programs, null, 'no MIDI and no explicit usage: the usage is unknowable');
		assert.deepEqual(embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf2'), bank);
	});
});

test('compileResources subsets a SoundFont to an explicit soundFontUsage when no MIDI ships', async () => {
	await withDirs(async (from, to) => {
		const bank = await microGm();
		await writeFile(join(from, 'bank.sf2'), bank);

		const result = await compileResources({
			from,
			to,
			groupBy: () => 'assets',
			soundFontUsage: [{ bank: 0, program: 0 }],
		});
		assert.equal(result.soundFonts[0].programs, 1);
		const font = parseSoundFont(embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf2'));
		assert.equal(font.presetCount, 1);
		assert.ok(font.voices(0, 0, 60, 100).length > 0);
	});
});

test('compileResources fails the build on an unreadable MIDI or SoundFont instead of embedding it silently', async () => {
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bank.sf2'), await microGm());
		await writeFile(join(from, 'song.mid'), 'not a midi file');
		await assert.rejects(() => compileResources({ from, to }), /cannot read MIDI asset song\.mid/);
	});
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bank.sf2'), 'not a soundfont');
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());
		await assert.rejects(() => compileResources({ from, to }), /cannot subset SoundFont asset bank\.sf2/);
	});
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bank.sf2'), await microGm());
		await assert.rejects(
			() => compileResources({ from, to, soundFontUsage: [{ bank: 0, program: 200 }] }),
			/soundFontUsage\[0\]/,
		);
	});
});
