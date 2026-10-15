import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mergeSoundFonts, parseSoundFont } from '../src/audio/SoundFont.ts';
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

const FRAMES = 100;

/** the stand-in for ffmpeg: a ramp whose slope is the first byte of the "Ogg" data */
function fakeDecode(ogg: Uint8Array): Int16Array {
	return Int16Array.from({ length: FRAMES }, (_, index) => index * ogg[0]);
}

function str20(name: string): Buffer {
	return Buffer.concat([Buffer.from(name, 'latin1'), Buffer.alloc(20 - name.length)]);
}

function chunk(id: string, data: Buffer): Buffer {
	const head = Buffer.alloc(8);
	head.write(id, 0, 'latin1');
	head.writeUInt32LE(data.length, 4);
	return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
}

function list(kind: string, parts: Buffer[]): Buffer {
	return chunk('LIST', Buffer.concat([Buffer.from(kind, 'latin1'), ...parts]));
}

function u16(...values: number[]): Buffer {
	const out = Buffer.alloc(values.length * 2);
	values.forEach((value, index) => out.writeUInt16LE(value, index * 2));
	return out;
}

function gen(oper: number, amount: number): Buffer {
	const out = Buffer.alloc(4);
	out.writeUInt16LE(oper, 0);
	out.writeInt16LE(amount, 2);
	return out;
}

/** a one-preset SoundFont 3: preset `program` of bank `bank`, one Ogg sample of `ogg.length` bytes looping 10 to 90 */
function buildSf3(bank: number, program: number, ogg: Buffer): Buffer {
	const preset = (name: string, p: number, b: number, bag: number): Buffer =>
		Buffer.concat([str20(name), u16(p, b, bag), Buffer.alloc(12)]);
	const header = Buffer.alloc(46);
	str20('ogg').copy(header, 0);
	header.writeUInt32LE(0, 20);
	header.writeUInt32LE(ogg.length, 24);
	header.writeUInt32LE(10, 28); //loop points are relative to the sample in an SF3
	header.writeUInt32LE(90, 32);
	header.writeUInt32LE(8000, 36);
	header[40] = 69;
	header.writeUInt16LE(0x11, 44); //mono, Ogg Vorbis
	const eos = Buffer.alloc(46);
	str20('EOS').copy(eos, 0);
	const pdta = list('pdta', [
		chunk('phdr', Buffer.concat([preset('Test', program, bank, 0), preset('EOS', 0, 0, 1)])),
		chunk('pbag', Buffer.concat([u16(0, 0), u16(1, 0)])),
		chunk('pgen', gen(41, 0)),
		chunk('inst', Buffer.concat([str20('TestInst'), u16(0), str20('EOS'), u16(1)])),
		chunk('ibag', Buffer.concat([u16(0, 0), u16(1, 0)])),
		chunk('igen', gen(53, 0)),
		chunk('shdr', Buffer.concat([header, eos])),
	]);
	const body = Buffer.concat([
		Buffer.from('sfbk', 'latin1'),
		list('INFO', [chunk('ifil', Buffer.from([3, 0, 0, 0]))]),
		list('sdta', [chunk('smpl', ogg)]),
		pdta,
	]);
	const head = Buffer.alloc(8);
	head.write('RIFF', 0, 'latin1');
	head.writeUInt32LE(body.length, 4);
	return Buffer.concat([head, body]);
}

test('a SoundFont 3 becomes a SoundFont 2 the reader plays: samples decoded, loops placed, padding kept', () => {
	const sf2 = sf3ToSf2(buildSf3(0, 5, Buffer.from([3, 9, 9, 9, 9])), fakeDecode);
	const font = parseSoundFont(sf2);
	assert.equal(font.hasPreset(0, 5), true);
	const [voice] = font.voices(0, 5, 69, 100);
	assert.equal(voice.sample.data.length, FRAMES);
	assert.ok(Math.abs(voice.sample.data[10] - (10 * 3) / 32768) < 1e-9, 'the decoded frames reach the sample');
	assert.equal(voice.sample.loopStart, 10);
	assert.equal(voice.sample.loopEnd, 90);
	assert.equal(voice.sample.rate, 8000);
	assert.throws(() => sf3ToSf2(Buffer.from('not a font'), fakeDecode), /not a SoundFont file/);
});

test('a SoundFont 2 passes through the converter with its samples intact', () => {
	const once = sf3ToSf2(buildSf3(0, 5, Buffer.from([2, 0])), fakeDecode);
	const twice = sf3ToSf2(once, () => assert.fail('nothing is compressed any more'));
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
		merge: mergeSoundFonts as never,
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
	const font = parseSoundFont(result.bytes);
	assert.equal(font.presetCount, 2);
	assert.equal(font.hasPreset(128, 0), true);
	const credits = creditsFor(result.font, result.found);
	assert.match(credits, new RegExp(name));
	assert.match(credits, /Licence: Public Domain/);
	assert.match(credits, /0:5, 128:0/);
});

test('a font whose licence is not free to ship is refused until the licence is accepted', async () => {
	const catalog = readCatalog();
	const read = collection({ 'LiteGM_v1.03/000/000.sf3': buildSf3(0, 0, Buffer.from([1, 0])) });
	const options = {
		name: 'LiteGM_v1.03',
		programs: [{ bank: 0, program: 0 }],
		catalog,
		decode: fakeDecode,
		merge: mergeSoundFonts as never,
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

test('a font whose sample offsets point outside the sample data is refused, not copied from beyond it', () => {
	const font = buildSf3(0, 5, Buffer.from([1, 0]));
	const header = font.indexOf('shdr') + 8;
	const lie = (end: number, type: number): Buffer => {
		const copy = Buffer.from(font);
		copy.writeUInt32LE(end, header + 24);
		copy.writeUInt16LE(type, header + 44);
		return copy;
	};
	assert.throws(() => sf3ToSf2(lie(5000, 0x11), fakeDecode), /outside the sample data/);
	assert.throws(() => sf3ToSf2(lie(5000, 1), fakeDecode), /outside the sample data/);
	const backwards = Buffer.from(lie(2, 0x11));
	backwards.writeUInt32LE(2, header + 20);
	backwards.writeUInt32LE(1, header + 24);
	assert.throws(() => sf3ToSf2(backwards, fakeDecode), /outside the sample data/);
});

test('ffmpeg is never handed bytes that are not Ogg: a probed playlist could name local files', () => {
	const playlist = Buffer.from('#EXTM3U\nfile:///etc/passwd\n');
	assert.throws(() => ffmpegDecode(playlist), /not Ogg Vorbis data/);
	assert.throws(() => ffmpegDecode(new Uint8Array(0)), /not Ogg Vorbis data/);
});
