import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodeSoundFont, parseSoundFont } from '../src/audio/SoundFont.ts';
import { buildSf3, fakeDecode, FRAMES } from './helpers/soundfont3.ts';
import {
	creditsFor,
	ffmpegDecode,
	fetchSoundFont,
	findFont,
	parseProgramList,
	readCatalog,
	readCollectionFile,
	sf3ToSf2,
} from '../tools/soundfonts.mjs';

/**
 * `mwg-soundfonts` without ffmpeg or the network: a hand-built SoundFont 3 whose compressed
 * sample is a few marker bytes, decoded by a fake that returns known frames, and a stubbed
 * file reader standing in for the collection.
 */

test('a SoundFont 3 becomes a SoundFont 2 the reader plays: samples decoded and loops placed', async () => {
	const sf2 = await sf3ToSf2(buildSf3(0, 5, Buffer.from([3, 9, 9, 9, 9])), fakeDecode);
	const font = parseSoundFont(sf2);
	assert.equal(font.hasPreset(0, 5), true);
	const [voice] = font.voices(0, 5, 69, 100);
	assert.equal(voice.sample.data.length, FRAMES);
	assert.ok(Math.abs(voice.sample.data[10] - (10 * 3) / 32768) < 1e-9, 'the decoded frames reach the sample');
	assert.equal(voice.sample.loopStart, 10);
	assert.equal(voice.sample.loopEnd, 90);
	assert.equal(voice.sample.rate, 8000);
	await assert.rejects(() => sf3ToSf2(Buffer.from('not a font'), fakeDecode), /not a SoundFont 2 file/);
});

test('a SoundFont 2 passes through the converter with its samples intact', async () => {
	const once = await sf3ToSf2(buildSf3(0, 5, Buffer.from([2, 0])), fakeDecode);
	const twice = await sf3ToSf2(once, () => assert.fail('nothing is compressed any more'));
	assert.deepEqual(parseSoundFont(twice).voices(0, 5, 69, 100), parseSoundFont(once).voices(0, 5, 69, 100));
});

test('parseProgramList reads programs and bank:program, and names a bad entry', () => {
	assert.deepEqual(parseProgramList('0, 24,128:0'), [
		{ bank: 0, program: 0 },
		{ bank: 0, program: 24 },
		{ bank: 128, program: 0 },
	]);
	assert.throws(() => parseProgramList('0,200'), /invalid program "200"/);
	assert.throws(() => parseProgramList('x'), /invalid program "x"/);
});

test('the catalogue classifies every font and keeps the bundled default out of the fetchable list', () => {
	const catalog = readCatalog();
	assert.equal(catalog.default, 'microgm-opt');
	assert.equal(findFont(catalog, 'microgm-opt')?.file, 'data/microgm-opt.sf2');
	assert.equal(
		catalog.fonts.some((font) => font.name === 'microgm-opt'),
		false,
	);
	for (const font of catalog.fonts) {
		assert.match(
			font.licenceClass,
			/^(public-domain|permissive|attribution|share-alike|copyleft|check)$/,
			font.name,
		);
	}
	//the collection calls TimGM6mb public domain; Debian and Alpine list GPL-2.0, so it is not offered as free
	assert.equal(findFont(catalog, 'TimGM6mb')?.licenceClass, 'copyleft');
	assert.equal(findFont(catalog, 'LiteGM_v1.03')?.licenceClass, 'share-alike');
});

/** a collection stub: `font/bank/program.sf3` paths present in `files` */
function collection(files: Record<string, Buffer>) {
	return async (path: string): Promise<Uint8Array | null> => files[path] ?? null;
}

test('fetching merges the requested instruments, reports the missing ones, and writes credits', async () => {
	const catalog = readCatalog();
	const name = catalog.fonts.find((font) => font.licenceClass === 'public-domain')!.name;
	const result = await fetchSoundFont({
		name,
		programs: [
			{ bank: 0, program: 5 },
			{ bank: 128, program: 0 },
			{ bank: 0, program: 5 }, //asked twice, fetched once
			{ bank: 0, program: 9 }, //not in the collection
		],
		catalog,
		decode: fakeDecode,
		read: collection({
			[`${name}/000/005.sf3`]: buildSf3(0, 5, Buffer.from([1, 0])),
			[`${name}/128/000.sf3`]: buildSf3(128, 0, Buffer.from([2, 0])),
		}),
	});
	assert.deepEqual(result.found, [
		{ bank: 0, program: 5 },
		{ bank: 128, program: 0 },
	]);
	assert.deepEqual(result.missing, [{ bank: 0, program: 9 }]);
	//a SoundFont 3 by default, its Ogg bytes untouched: the game decodes it where it runs
	assert.equal(result.format, 'sf3');
	assert.throws(() => parseSoundFont(result.bytes), /needs decoding first/);
	const font = parseSoundFont(await decodeSoundFont(result.bytes, fakeDecode));
	assert.equal(font.presetCount, 2);
	assert.equal(font.hasPreset(128, 0), true);
	const credits = creditsFor(result.font, result.found);
	assert.match(credits, new RegExp(name));
	assert.match(credits, /Licence: Public Domain/);
	assert.match(credits, /0:5, 128:0/);
});

test('format sf2 decodes the merged font through the decoder, ffmpeg unless one is given', async () => {
	const catalog = readCatalog();
	const name = catalog.fonts.find((font) => font.licenceClass === 'public-domain')!.name;
	const rates: number[] = [];
	const result = await fetchSoundFont({
		name,
		programs: [{ bank: 0, program: 5 }],
		catalog,
		format: 'sf2',
		decode: (ogg, rate) => {
			rates.push(rate);
			return fakeDecode(ogg);
		},
		read: collection({ [`${name}/000/005.sf3`]: buildSf3(0, 5, Buffer.from([1, 0])) }),
	});
	assert.equal(result.format, 'sf2');
	assert.deepEqual(rates, [8000]);
	assert.equal(parseSoundFont(result.bytes).voices(0, 5, 69, 100)[0].sample.data.length, FRAMES);
	await assert.rejects(
		() =>
			fetchSoundFont({
				name,
				programs: [{ bank: 0, program: 5 }],
				catalog,
				format: 'flac' as never,
				read: collection({}),
			}),
		/unknown format/,
	);
});

test('a font whose licence is not free to ship is refused until the licence is accepted', async () => {
	const catalog = readCatalog();
	const read = collection({ 'LiteGM_v1.03/000/000.sf3': buildSf3(0, 0, Buffer.from([1, 0])) });
	const options = {
		name: 'LiteGM_v1.03',
		programs: [{ bank: 0, program: 0 }],
		catalog,
		decode: fakeDecode,
		read,
	};
	await assert.rejects(() => fetchSoundFont(options), /share-alike.*--accept-licence/);
	const accepted = await fetchSoundFont({ ...options, acceptLicence: true });
	assert.match(creditsFor(accepted.font, accepted.found), /sharing obligations/);
});

test('fetching refuses the bundled bank, an unknown font, no programs, and a font with none of them', async () => {
	const catalog = readCatalog();
	const base = { programs: [{ bank: 0, program: 0 }], catalog, read: collection({}) };
	await assert.rejects(() => fetchSoundFont({ ...base, name: 'microgm-opt' }), /ships in the package/);
	await assert.rejects(() => fetchSoundFont({ ...base, name: 'nope' }), /not in the catalogue/);
	await assert.rejects(() => fetchSoundFont({ ...base, name: 'Airfont_340', programs: [] }), /no programs requested/);
	await assert.rejects(
		() => fetchSoundFont({ ...base, name: 'Airfont_340' }),
		/carries none of the requested programs/,
	);
});

test('a folder source reads the collection layout and a missing file is null', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'mwg-soundfonts-'));
	try {
		mkdirSync(join(dir, 'font', '000'), { recursive: true });
		writeFileSync(join(dir, 'font', '000', '005.sf3'), Buffer.from([7, 7]));
		assert.deepEqual([...(await readCollectionFile(dir, 'font/000/005.sf3'))!], [7, 7]);
		assert.equal(await readCollectionFile(dir, 'font/000/006.sf3'), null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('the default bank ships with the package, with its provenance and the catalogue, and plays', () => {
	const root = new URL('..', import.meta.url);
	const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { files: string[] };
	const bundled = readCatalog().bundled.find((font) => font.name === readCatalog().default)!;
	for (const file of [bundled.file!, 'data/microgm-opt.PROVENANCE.md', 'data/soundfont-catalog.json']) {
		assert.ok(pkg.files.includes(file), `package.json "files" must ship ${file}`);
		assert.ok(existsSync(new URL(file, root)), `${file} must exist`);
	}
	const font = parseSoundFont(readFileSync(new URL(bundled.file!, root)));
	assert.equal(font.presetCount, bundled.programs);
	assert.ok(font.hasPreset(0, 0) && font.hasPreset(128, 0), 'piano and the drum kit');
	assert.match(readFileSync(new URL('data/microgm-opt.PROVENANCE.md', root), 'utf8'), /WTFPL/);
});

test('a font whose sample offsets point outside the sample data is refused, not copied from beyond it', async () => {
	const font = buildSf3(0, 5, Buffer.from([1, 0]));
	const header = font.indexOf('shdr') + 8;
	const lie = (end: number, type: number): Buffer => {
		const copy = Buffer.from(font);
		copy.writeUInt32LE(end, header + 24);
		copy.writeUInt16LE(type, header + 44);
		return copy;
	};
	await assert.rejects(() => sf3ToSf2(lie(5000, 0x11), fakeDecode), /outside the sample data/);
	await assert.rejects(() => sf3ToSf2(lie(5000, 1), fakeDecode), /outside the sample data/);
});

test('ffmpeg is never handed bytes that are not Ogg: a probed playlist could name local files', () => {
	const playlist = Buffer.from('#EXTM3U\nfile:///etc/passwd\n');
	assert.throws(() => ffmpegDecode(playlist), /not Ogg Vorbis data/);
	assert.throws(() => ffmpegDecode(new Uint8Array(0)), /not Ogg Vorbis data/);
});
