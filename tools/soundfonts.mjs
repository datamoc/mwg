#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `mwg-soundfonts`: the developer-side half of choosing a SoundFont. The package ships one
 * small bank (`data/microgm-opt.sf2`); a game that wants another picks it from the catalogue
 * (`data/soundfont-catalog.json`, a licence-classified snapshot of the marmooo free-soundfonts
 * collection), and this tool fetches only the instruments the game's MIDI files use and merges
 * them into one font for the asset folder, where the build subsets it again like any other.
 *
 * The merged font stays a SoundFont 3 (Ogg Vorbis samples, a fraction of the size) by default:
 * nothing is decoded here, and the game decodes it where it runs with `loadSoundFont`.
 * `--sf2` decodes it into a plain SoundFont 2 instead, which is `ffmpeg`'s job: needed on a
 * developer machine only, never by the player, and named when missing. Nothing here runs in a
 * browser.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = join(HERE, '..', 'data', 'soundfont-catalog.json');

/** licence classes a font may be fetched under without saying so */
const FREE_TO_SHIP = new Set(['public-domain', 'permissive', 'attribution']);

/**
 * The SoundFont implementation lives in the library, not in this tool: in this repository it is
 * the TypeScript source, in an installed package the built `dist/` it compiles to (the same
 * lookup `compile-resources` makes).
 */
async function loadLibrary() {
	try {
		const [soundFont, midi] = await Promise.all([
			import('../src/audio/SoundFont.ts'),
			import('../src/audio/Midi.ts'),
		]);
		return { ...soundFont, ...midi };
	} catch {
		return import('../dist/audio/index.js');
	}
}

/** the catalogue as parsed JSON: `{ source, default, bundled, fonts }` */
export function readCatalog(path = CATALOG_PATH) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

/** a catalogue entry (bundled bank included) by name, or undefined */
export function findFont(catalog, name) {
	return [...catalog.bundled, ...catalog.fonts].find((font) => font.name === name);
}

/** `"0,24,128:0"` as `[{ bank, program }]`: a bare number is a program of bank 0, `bank:program` names both */
export function parseProgramList(text) {
	return text
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => {
			const [first, second] = item.split(':');
			const bank = second === undefined ? 0 : Number(first);
			const program = Number(second === undefined ? first : second);
			if (
				!Number.isInteger(bank) ||
				!Number.isInteger(program) ||
				bank < 0 ||
				bank > 128 ||
				program < 0 ||
				program > 127
			) {
				throw new Error(`invalid program "${item}": expected a program 0-127 or bank:program`);
			}
			return { bank, program };
		});
}

/**
 * mono 16-bit PCM from Ogg Vorbis bytes, through `ffmpeg`, at the rate the stream carries (the
 * `rate` a font states for the sample is the same one). The bytes come from a font file that may
 * have been downloaded, so they are not trusted: anything that does not start with the Ogg magic
 * is refused before a process is spawned, the demuxer is forced to Ogg rather than probed (a
 * probed "sample" could be read as a playlist naming local files), and only the `pipe` protocol
 * is allowed.
 */
export function ffmpegDecode(ogg) {
	if (Buffer.from(ogg.subarray(0, 4)).toString('latin1') !== 'OggS') {
		throw new Error('a compressed sample is not Ogg Vorbis data: the font is damaged or not a SoundFont 3');
	}
	const run = spawnSync(
		'ffmpeg',
		[
			'-v',
			'error',
			'-protocol_whitelist',
			'pipe',
			'-f',
			'ogg',
			'-i',
			'pipe:0',
			'-f',
			's16le',
			'-ac',
			'1',
			'pipe:1',
		],
		{ input: ogg, maxBuffer: 256 * 1024 * 1024 },
	);
	if (run.error?.code === 'ENOENT') {
		throw new Error('ffmpeg was not found on PATH: install it to decode SoundFont 3 (developer machines only)');
	}
	if (run.status !== 0) throw new Error(`ffmpeg could not decode a sample: ${run.stderr}`);
	const out = run.stdout;
	return new Int16Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length - (out.length & 1)));
}

/** a SoundFont 3 decoded into SoundFont 2 bytes (`decode` is `ffmpeg` unless given) */
export async function sf3ToSf2(bytes, decode = ffmpegDecode) {
	const { decodeSoundFont } = await loadLibrary();
	return new Uint8Array(await decodeSoundFont(bytes, decode));
}

const pad = (value, width) => String(value).padStart(width, '0');

/** reads one file of a collection laid out as `<source>/<font>/<bank>/<program>.sf3`, from a folder or a URL; null when absent */
export async function readCollectionFile(source, path) {
	if (/^https?:\/\//.test(source)) {
		const response = await fetch(
			`${source.replace(/\/$/, '')}/${path.split('/').map(encodeURIComponent).join('/')}`,
		);
		if (response.status === 404) return null;
		if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	}
	const file = resolve(source, path);
	return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
}

/**
 * Fetches `programs` (`[{ bank, program }]`) of the catalogue font `name` and merges them into
 * one font: a SoundFont 3 with the compressed samples untouched, or with `format: 'sf2'` a
 * SoundFont 2 decoded through `decode` (`ffmpeg` by default). Returns
 * `{ bytes, format, found, missing, font }`: `missing` lists the programs the collection does
 * not carry (the renderer falls back for them as it does for any font). A font whose licence
 * class is not free to ship is refused unless `acceptLicence` is set, and a font that is not in
 * the catalogue is refused outright.
 */
export async function fetchSoundFont({
	name,
	programs,
	catalog = readCatalog(),
	source,
	acceptLicence = false,
	format = 'sf3',
	decode,
	read,
}) {
	const font = catalog.fonts.find((entry) => entry.name === name);
	if (!font) {
		const bundled = catalog.bundled.find((entry) => entry.name === name);
		throw new Error(
			bundled
				? `${name} ships in the package as ${bundled.file}: copy that file instead of fetching it`
				: `${name} is not in the catalogue: run "mwg-soundfonts list"`,
		);
	}
	if (!FREE_TO_SHIP.has(font.licenceClass) && !acceptLicence) {
		throw new Error(
			`${name} is ${font.licence} (${font.licenceClass})${font.note ? `: ${font.note}` : ''}. ` +
				'Pass --accept-licence once you have read its terms and are sure the game may ship it.',
		);
	}
	if (format !== 'sf3' && format !== 'sf2') throw new Error(`unknown format "${format}": expected sf3 or sf2`);
	if (programs.length === 0) throw new Error('no programs requested: pass --midi <files> or --programs <list>');
	const origin = source ?? catalog.source;
	const reader = read ?? ((path) => readCollectionFile(origin, path));
	const { mergeSoundFonts, decodeSoundFont } = await loadLibrary();

	const found = [];
	const missing = [];
	const files = [];
	const seen = new Set();
	for (const { bank, program } of programs) {
		const key = `${bank}:${program}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const bytes = await reader(`${name}/${pad(bank, 3)}/${pad(program, 3)}.sf3`);
		if (!bytes) {
			missing.push({ bank, program });
			continue;
		}
		files.push(bytes);
		found.push({ bank, program });
	}
	if (files.length === 0) throw new Error(`${name} carries none of the requested programs`);
	const merged = mergeSoundFonts(files);
	const bytes = new Uint8Array(format === 'sf2' ? await decodeSoundFont(merged, decode ?? ffmpegDecode) : merged);
	return { bytes, format, found, missing, font };
}

/** the credits note that travels beside a fetched font, so the licence is not lost */
export function creditsFor(font, programs) {
	return [
		`${font.name}`,
		`Licence: ${font.licence} (${font.licenceClass})`,
		...(font.web ? [`Source: ${font.web}`] : []),
		`Programs: ${programs.map(({ bank, program }) => `${bank}:${program}`).join(', ')}`,
		...(font.licenceClass === 'attribution' ? ['Credit the author of this font in your game.'] : []),
		...(font.licenceClass === 'share-alike' || font.licenceClass === 'copyleft'
			? ['This licence carries sharing obligations: read it before shipping a game that embeds this font.']
			: []),
		'',
	].join('\n');
}

const USAGE = `usage: mwg-soundfonts <command>
  list                                          the bundled bank and every catalogue font, with licence and size
  fetch <font> (--midi <file>... | --programs <list>) [--out <file>] [--source <url|folder>] [--accept-licence] [--sf2]
                                                one font holding just those instruments (programs: 0,24,128:0),
                                                a SoundFont 3 the game decodes with loadSoundFont, or with --sf2
                                                a decoded SoundFont 2 (needs ffmpeg on PATH)
  convert <in.sf3> <out.sf2>                    SoundFont 3 to SoundFont 2 (needs ffmpeg on PATH)`;

function formatList(catalog) {
	const rows = [
		...catalog.bundled.map((font) => ({ ...font, shipped: 'bundled in the package: ' + font.file })),
		...catalog.fonts.map((font) => ({
			...font,
			shipped: `${font.gmMB} MB for a full GM bank, ${font.fullMB} MB in all (sf3)`,
		})),
	];
	return rows
		.map((font) => {
			const free = FREE_TO_SHIP.has(font.licenceClass) ? '' : '  [read the licence first]';
			return `${font.name}${font.name === catalog.default ? '  (default)' : ''}\n  ${font.licence} (${font.licenceClass})${free}\n  ${font.shipped}`;
		})
		.join('\n');
}

async function main(argv) {
	const [command, ...rest] = argv;
	if (!command || command === '--help' || command === '-h') {
		console.log(USAGE);
		return;
	}
	const flag = (name) => {
		const at = rest.indexOf(name);
		return at === -1 ? undefined : rest[at + 1];
	};
	const valuesAfter = (name) => {
		const at = rest.indexOf(name);
		if (at === -1) return [];
		const out = [];
		for (let index = at + 1; index < rest.length && !rest[index].startsWith('--'); index++) out.push(rest[index]);
		return out;
	};
	if (command === 'list') {
		console.log(formatList(readCatalog()));
	} else if (command === 'convert') {
		const [input, output] = rest;
		if (!input || !output) throw new Error('usage: mwg-soundfonts convert <in.sf3> <out.sf2>');
		writeFileSync(output, await sf3ToSf2(readFileSync(input)));
		console.log(`wrote ${output}`);
	} else if (command === 'fetch') {
		const name = rest.find((arg) => !arg.startsWith('--'));
		if (!name) throw new Error('usage: mwg-soundfonts fetch <font> (--midi <file>... | --programs <list>)');
		const programs = flag('--programs') ? parseProgramList(flag('--programs')) : [];
		const midiFiles = valuesAfter('--midi');
		if (midiFiles.length > 0) {
			const { collectSoundFontUsage, parseMidi } = await loadLibrary();
			programs.push(...collectSoundFontUsage(midiFiles.map((file) => parseMidi(readFileSync(file)))));
		}
		const result = await fetchSoundFont({
			name,
			programs,
			source: flag('--source'),
			acceptLicence: rest.includes('--accept-licence'),
			format: rest.includes('--sf2') ? 'sf2' : 'sf3',
		});
		const out = resolve(flag('--out') ?? `${name}.${result.format}`);
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, result.bytes);
		writeFileSync(out.replace(/\.sf[23]$/, '') + '.credits.txt', creditsFor(result.font, result.found));
		console.log(`wrote ${out}: ${result.found.length} programs, ${(result.bytes.length / 1024).toFixed(0)} KB`);
		if (result.missing.length > 0) {
			console.log(
				`not in ${name}: ${result.missing.map(({ bank, program }) => `${bank}:${program}`).join(', ')}`,
			);
		}
	} else {
		throw new Error(`unknown command "${command}"\n${USAGE}`);
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
