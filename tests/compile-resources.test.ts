import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { compileResources } from '../tools/compile-resources.mjs';
import { decodeSoundFont, mergeSoundFonts, parseSoundFont } from '../src/audio/SoundFont.ts';
import { encodeFlac, flacSampleDecoder } from '../src/audio/Flac.ts';
import { buildSf3, fakeDecode, MAGIC } from './helpers/soundfont3.ts';

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

		const result = await compileResources({ from, to, groupBy: () => 'assets', soundFontCodec: false });
		assert.equal(result.skipped, 0);
		assert.deepEqual(result.soundFonts, [
			{
				key: 'bank.sf2',
				programs: 3,
				rawBytes: bank.length,
				embeddedBytes: result.soundFonts[0].embeddedBytes,
				codec: null,
				missing: [],
			},
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

test('compileResources subsets an embedded SoundFont 3 without decoding it, the Ogg bytes riding along', async () => {
	await withDirs(async (from, to) => {
		const bank = Buffer.from(
			mergeSoundFonts([
				buildSf3(0, 0, Buffer.from([1, 1, 1])),
				buildSf3(0, 40, Buffer.from([2, 2, 2])),
				buildSf3(0, 73, Buffer.from([3, 3, 3])),
				buildSf3(128, 0, Buffer.from([4, 4, 4])),
			]),
		);
		await writeFile(join(from, 'bank.sf3'), bank);
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());

		const result = await compileResources({ from, to, groupBy: () => 'assets' });
		assert.equal(result.soundFonts[0].key, 'bank.sf3');
		assert.equal(result.soundFonts[0].programs, 3);
		assert.ok(result.soundFonts[0].embeddedBytes < bank.length, 'the unused program is gone');

		const embedded = embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf3');
		const decoded: number[] = [];
		const font = parseSoundFont(
			await decodeSoundFont(embedded, (ogg) => {
				decoded.push(ogg[MAGIC.length]);
				return fakeDecode(ogg);
			}),
		);
		assert.deepEqual(decoded.sort(), [1, 2, 4], 'program 73 was not shipped, so it is not decoded');
		assert.equal(font.presetCount, 3);
		assert.equal(font.hasPreset(0, 73), false);
	});
});

test('compileResources embeds a SoundFont whole with soundFont: false, and without shipped MIDI to subset against', async () => {
	await withDirs(async (from, to) => {
		const bank = await microGm();
		await writeFile(join(from, 'bank.sf2'), bank);
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());

		const whole = await compileResources({
			from,
			to,
			groupBy: () => 'assets',
			soundFont: false,
			soundFontCodec: false,
		});
		assert.deepEqual(whole.soundFonts, [
			{ key: 'bank.sf2', programs: null, rawBytes: bank.length, embeddedBytes: bank.length, codec: null },
		]);
		assert.deepEqual(embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf2'), bank);
	});
	await withDirs(async (from, to) => {
		const bank = await microGm();
		await writeFile(join(from, 'bank.sf2'), bank);

		const result = await compileResources({ from, to, groupBy: () => 'assets', soundFontCodec: false });
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
			soundFontCodec: false,
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

// ------------------------------------------------------------------------- svgo

const SLOPPY_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Created with an editor -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 20 20" width="20" height="20">
  <metadata>editor junk</metadata>
  <defs><path id="shape" d="M 0.000 0.000 L 10.0000 0 L 10 10 Z" fill="#000000"/></defs>
  <use xlink:href="#shape" x="2" y="2"/>
</svg>
`;

test('compileResources with svgo: true embeds a smaller SVG under the same key, keeping the viewBox and every id', async () => {
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'shape.svg'), SLOPPY_SVG);
		const result = await compileResources({ from, to, groupBy: () => 'assets', svgo: true });
		assert.equal(result.svgOptimised, 1);
		assert.ok(result.embeddedBytes < result.rawBytes);

		const js = await readFile(join(to, 'assets.js'), 'utf8');
		const uri = extractAssetMap(js)['shape.svg'];
		assert.match(uri, /^data:image\/svg\+xml;base64,/, 'the key and the MIME type are unchanged');
		const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
		assert.match(svg, /viewBox="0 0 20 20"/, 'a game scales a texture by its viewBox');
		assert.match(svg, /id="shape"/, 'an id a <use> or the game names is never minified away');
		assert.doesNotMatch(svg, /<metadata|<!--/);
	});
});

test('compileResources leaves SVG alone by default, and never embeds an optimised file that is larger', async () => {
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'shape.svg'), SLOPPY_SVG);
		const result = await compileResources({ from, to, groupBy: () => 'assets' });
		assert.equal(result.svgOptimised, 0);
		assert.equal(result.embeddedBytes, result.rawBytes);
		assert.deepEqual(
			embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'shape.svg'),
			Buffer.from(SLOPPY_SVG),
		);
	});
	await withDirs(async (from, to) => {
		const tiny = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
		await writeFile(join(from, 'tiny.svg'), tiny);
		const result = await compileResources({ from, to, groupBy: () => 'assets', svgo: true });
		assert.ok(result.embeddedBytes <= result.rawBytes, 'never larger than the original');
	});
});

test('compileResources with svgo: true fails the build by name on a file that is not SVG', async () => {
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bad.svg'), '<svg><g></svg>');
		await assert.rejects(
			() => compileResources({ from, to, groupBy: () => 'assets', svgo: true }),
			/cannot optimise SVG asset bad.svg/,
		);
	});
});

test('a subset SoundFont reports the programs the game asks for that the font does not carry', async () => {
	await withDirs(async (from, to) => {
		const bank = Buffer.from(
			mergeSoundFonts([buildSf3(0, 0, Buffer.from([1, 1])), buildSf3(128, 0, Buffer.from([2, 2]))]),
		);
		await writeFile(join(from, 'bank.sf3'), bank);
		const result = await compileResources({
			from,
			to,
			groupBy: () => 'assets',
			soundFontUsage: [
				{ bank: 0, program: 0 },
				{ bank: 0, program: 99 },
				{ bank: 128, program: 0 },
			],
		});
		assert.deepEqual(result.soundFonts[0].missing, [{ bank: 0, program: 99 }]);
	});
});

/** a stand-in for ffmpeg: the FLAC encoder under another codec's name, so the bytes decode with the library's own reader */
const flacAs = (frames: Int16Array, rate: number) => encodeFlac(frames, rate);

test('compileResources embeds a plain SoundFont as a SoundFont 3 in Opus unless told otherwise', async () => {
	await withDirs(async (from, to) => {
		const bank = await microGm();
		await writeFile(join(from, 'bank.sf2'), bank);
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());

		const asked: string[] = [];
		const result = await compileResources({
			from,
			to,
			groupBy: () => 'assets',
			soundFontEncode: (frames, rate, codec) => {
				asked.push(codec);
				return flacAs(frames, rate);
			},
		});
		assert.equal(result.soundFonts[0].codec, 'opus');
		assert.ok(asked.length > 0 && asked.every((codec) => codec === 'opus'));
		const embedded = embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf2');
		assert.throws(() => parseSoundFont(embedded), /needs decoding/);
		const font = parseSoundFont(await decodeSoundFont(embedded, flacSampleDecoder));
		assert.equal(font.presetCount, 3);
		assert.ok(font.voices(0, 0, 60, 100).length > 0, 'the piano still voices after the round trip');
	});
});

test('compileResources compresses in the codec named, FLAC with no ffmpeg at all, and leaves a SoundFont 3 as it is', async () => {
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bank.sf2'), await microGm());
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());
		const result = await compileResources({ from, to, groupBy: () => 'assets', soundFontCodec: 'flac' });
		assert.equal(result.soundFonts[0].codec, 'flac');
		const embedded = embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf2');
		assert.ok(embedded.length < result.soundFonts[0].rawBytes);
		assert.equal(parseSoundFont(await decodeSoundFont(embedded, flacSampleDecoder)).presetCount, 3);
	});
	await withDirs(async (from, to) => {
		const sf3 = buildSf3(0, 5, Buffer.from([1, 0]));
		await writeFile(join(from, 'bank.sf3'), sf3);
		const result = await compileResources({
			from,
			to,
			groupBy: () => 'assets',
			soundFontEncode: () => assert.fail('a SoundFont 3 is not compressed again'),
		});
		assert.equal(result.soundFonts[0].codec, null);
		assert.deepEqual(embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf3'), sf3);
	});
	await withDirs(async (from, to) => {
		await assert.rejects(
			() => compileResources({ from, to, soundFontCodec: 'mp3' as 'opus' }),
			/unknown soundFontCodec/,
		);
	});
});

test('without ffmpeg the default keeps the SoundFont 2 and says so, while a codec named explicitly fails the build', async () => {
	const noFfmpeg = () => {
		throw Object.assign(new Error('ffmpeg was not found on PATH'), { code: 'FFMPEG_MISSING' });
	};
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bank.sf2'), await microGm());
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());
		const result = await compileResources({ from, to, groupBy: () => 'assets', soundFontEncode: noFfmpeg });
		assert.equal(result.soundFonts[0].codec, null);
		assert.match(result.soundFonts[0].warning ?? '', /ffmpeg is not installed/);
		const embedded = embeddedBytes(await readFile(join(to, 'assets.js'), 'utf8'), 'bank.sf2');
		assert.equal(parseSoundFont(embedded).presetCount, 3, 'still a SoundFont 2 the reader plays');
	});
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bank.sf2'), await microGm());
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());
		await assert.rejects(
			() => compileResources({ from, to, soundFontCodec: 'opus', soundFontEncode: noFfmpeg }),
			/cannot compress the SoundFont as opus: ffmpeg was not found/,
		);
	});
});

test('compileResources hands the Opus bitrate and Vorbis quality to the encoder, and refuses values outside their range', async () => {
	await withDirs(async (from, to) => {
		await writeFile(join(from, 'bank.sf2'), await microGm());
		await writeFile(join(from, 'song.mid'), usedProgramsMidi());
		const seen: unknown[] = [];
		await compileResources({
			from,
			to,
			groupBy: () => 'assets',
			soundFontBitrate: 48,
			soundFontQuality: 2,
			soundFontEncode: (frames, rate, _codec, options) => {
				seen.push(options);
				return flacAs(frames, rate);
			},
		});
		assert.ok(seen.length > 0);
		assert.ok(seen.every((options) => JSON.stringify(options) === JSON.stringify({ bitrate: 48, quality: 2 })));
	});
	await withDirs(async (from, to) => {
		await assert.rejects(() => compileResources({ from, to, soundFontBitrate: 1 }), /invalid Opus bitrate/);
		await assert.rejects(() => compileResources({ from, to, soundFontQuality: 99 }), /invalid Vorbis quality/);
	});
});
