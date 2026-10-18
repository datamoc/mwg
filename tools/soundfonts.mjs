#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `mwg-soundfonts`: the developer-side half of choosing a SoundFont. The package ships one
 * small bank (`data/microgm-opt.sf2`); a game that wants another picks it from the catalogue
 * (`data/soundfont-catalog.json`, a licence-classified snapshot of the marmooo free-soundfonts
 * collection), and this tool fetches only the instruments the game's MIDI files use and merges
 * them into one font for the asset folder, where the build subsets it again like any other.
 *
 * The merged font stays a SoundFont 3 (compressed samples, a fraction of the size) by default:
 * nothing is decoded here, and the game decodes it where it runs with `loadSoundFont`.
 * `--sf2` decodes it into a plain SoundFont 2 instead, and `convert` writes either kind in the
 * codec of your choice (Vorbis, Opus or FLAC). FLAC is read and written by the library itself;
 * Vorbis and Opus go through `ffmpeg`, needed on a developer machine only, never by the player,
 * and named when missing. Nothing here runs in a browser.
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
		const [soundFont, midi, flac] = await Promise.all([
			import('../src/audio/SoundFont.ts'),
			import('../src/audio/Midi.ts'),
			import('../src/audio/Flac.ts'),
		]);
		return { ...soundFont, ...midi, ...flac };
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

/** the codec of a compressed sample from its magic bytes, without the library (the check that keeps ffmpeg's probing out of it) */
function sniffCodec(bytes) {
	const head = Buffer.from(bytes.subarray(0, 4)).toString('latin1');
	if (head === 'fLaC') return 'flac';
	if (head === 'OggS') return Buffer.from(bytes.subarray(0, 64)).includes('OpusHead') ? 'opus' : 'vorbis';
	throw new Error('a compressed sample is not Vorbis, Opus or FLAC data: the font is damaged or not a SoundFont 3');
}

function missingFfmpeg(run, what) {
	if (run.error?.code === 'ENOENT') {
		throw Object.assign(
			new Error(`ffmpeg was not found on PATH: install it to ${what} (developer machines only)`),
			{ code: 'FFMPEG_MISSING' },
		);
	}
}

/**
 * mono 16-bit PCM from one compressed sample (Ogg Vorbis, Ogg Opus or FLAC), through `ffmpeg`, at
 * `rate`, the rate the font states for the sample (Opus decodes at 48 kHz unless told otherwise, so
 * the rate is always requested). The bytes come from a font file that may have been downloaded, so
 * they are not trusted: anything that does not start with a known magic is refused before a process
 * is spawned, the demuxer is forced to the codec's container rather than probed (a probed "sample"
 * could be read as a playlist naming local files), and only the `pipe` protocol is allowed.
 */
export function ffmpegDecode(bytes, rate, codec = sniffCodec(bytes)) {
	const container = codec === 'flac' ? 'flac' : 'ogg';
	if (sniffCodec(bytes) !== codec) throw new Error('a compressed sample is not the codec its caller named');
	const run = spawnSync(
		'ffmpeg',
		[
			'-v',
			'error',
			'-protocol_whitelist',
			'pipe',
			'-f',
			container,
			'-i',
			'pipe:0',
			...(rate ? ['-ar', String(rate)] : []),
			'-f',
			's16le',
			'-ac',
			'1',
			'pipe:1',
		],
		{ input: bytes, maxBuffer: 256 * 1024 * 1024 },
	);
	missingFfmpeg(run, 'decode SoundFont 3');
	if (run.status !== 0) throw new Error(`ffmpeg could not decode a sample: ${run.stderr}`);
	const out = run.stdout;
	return new Int16Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length - (out.length & 1)));
}

/** the ffmpeg encoder arguments of each codec the tool writes through ffmpeg (FLAC is written in-process) */
const FFMPEG_ENCODERS = {
	vorbis: ['-c:a', 'libvorbis', '-f', 'ogg'],
	opus: ['-c:a', 'libopus', '-f', 'ogg'],
};

/** the Opus bitrate (kbit/s) and Vorbis quality level a caller may ask for; each is ignored by the other codec */
export function checkedEncodeOptions({ bitrate, quality } = {}) {
	if (bitrate !== undefined && !(Number.isFinite(bitrate) && bitrate >= 6 && bitrate <= 510)) {
		throw new Error(`invalid Opus bitrate ${bitrate}: expected 6 to 510 kbit/s`);
	}
	if (quality !== undefined && !(Number.isFinite(quality) && quality >= -1 && quality <= 10)) {
		throw new Error(`invalid Vorbis quality ${quality}: expected -1 (smallest) to 10 (best)`);
	}
	return { bitrate, quality };
}

/** the ffmpeg arguments that apply the options to `codec` */
function encodeSettings(codec, options) {
	if (codec === 'opus' && options.bitrate !== undefined) return ['-b:a', `${options.bitrate}k`, '-vbr', 'on'];
	if (codec === 'vorbis' && options.quality !== undefined) return ['-q:a', String(options.quality)];
	return [];
}

/**
 * The folder encoded samples are cached in, private to the user: `MWG_CACHE_DIR`, else the platform's per-user
 * cache folder. Null (no caching) when it is not a real directory this user alone can write, since a
 * file another user planted there would be embedded in the game.
 */
function cacheDirectory() {
	const base =
		process.env.MWG_CACHE_DIR ??
		join(
			process.env.XDG_CACHE_HOME ||
				(process.platform === 'win32' ? process.env.LOCALAPPDATA : '') ||
				join(homedir(), '.cache'),
			'mwg',
			'samples',
		);
	try {
		mkdirSync(base, { recursive: true, mode: 0o700 });
		const info = lstatSync(base);
		const mine =
			typeof process.getuid !== 'function' || (info.uid === process.getuid() && (info.mode & 0o022) === 0);
		return info.isDirectory() && mine ? base : null;
	} catch {
		return null;
	}
}

/** a cached sample when it is still the codec it was stored as, else undefined */
function readCached(file, codec) {
	try {
		const bytes = new Uint8Array(readFileSync(file));
		return sniffCodec(bytes) === codec ? bytes : undefined;
	} catch {
		return undefined;
	}
}

/** stores a sample beside its final name first, so no reader ever sees half of it and no planted link is followed */
function writeCached(file, bytes) {
	const temporary = `${file}.${process.pid}.tmp`;
	try {
		writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
		renameSync(temporary, file);
	} catch {
		//an unwritable cache only costs the next build its speed
		rmSync(temporary, { force: true });
	}
}

/**
 * One sample compressed in `codec`: FLAC by the library's own lossless encoder, Vorbis and Opus
 * through `ffmpeg` (`libvorbis`, `libopus`). A developer machine needs ffmpeg for the two lossy
 * codecs only; a game never does.
 */
export async function ffmpegEncode(frames, rate, codec, options = {}) {
	if (codec === 'flac') return (await loadLibrary()).encodeFlac(frames, rate);
	const base = FFMPEG_ENCODERS[codec];
	if (!base) throw new Error(`unknown codec "${codec}": expected vorbis, opus or flac`);
	const settings = encodeSettings(codec, checkedEncodeOptions(options));
	const args = [...base.slice(0, 2), ...settings, ...base.slice(2)];
	const input = Buffer.from(frames.buffer, frames.byteOffset, frames.byteLength);
	//a game build re-encodes the same samples every time, and a lossy encode is the slow step: keep the result
	const dir = cacheDirectory();
	const cached =
		dir &&
		join(
			dir,
			`${createHash('sha256').update(codec).update(settings.join(' ')).update(String(rate)).update(input).digest('hex')}.bin`,
		);
	const hit = cached && readCached(cached, codec);
	if (hit) return hit;
	const run = spawnSync(
		'ffmpeg',
		['-v', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0', ...args, 'pipe:1'],
		{ input, maxBuffer: 256 * 1024 * 1024 },
	);
	missingFfmpeg(run, `encode ${codec}`);
	if (run.status !== 0) throw new Error(`ffmpeg could not encode a sample as ${codec}: ${run.stderr}`);
	if (cached) writeCached(cached, run.stdout);
	return new Uint8Array(run.stdout);
}

/** a SoundFont 3 decoded into SoundFont 2 bytes (`decode` is the library's FLAC reader or `ffmpeg` unless given) */
export async function sf3ToSf2(bytes, decode = defaultDecode) {
	const { decodeSoundFont } = await loadLibrary();
	return new Uint8Array(await decodeSoundFont(bytes, decode));
}

/** FLAC samples decode in-process, the others through ffmpeg */
async function defaultDecode(bytes, rate, codec) {
	if (codec === 'flac') return (await loadLibrary()).flacSampleDecoder(bytes, rate, codec);
	return ffmpegDecode(bytes, rate, codec);
}

/**
 * A SoundFont 2 or 3 written as the other kind, or as a SoundFont 3 in another codec: to `sf2`
 * decodes, to `sf3` decodes first when the font is compressed and then compresses every sample in
 * `codec` (`vorbis` by default, the codec every SoundFont 3 reader knows; `opus` and `flac` are
 * for readers that take them, this library's among them).
 */
export async function convertSoundFont(
	bytes,
	{ to, codec = 'vorbis', bitrate, quality, decode = defaultDecode, encode = ffmpegEncode },
) {
	if (to !== 'sf2' && to !== 'sf3') throw new Error(`unknown format "${to}": expected sf2 or sf3`);
	const { decodeSoundFont, encodeSoundFont } = await loadLibrary();
	const plain = await decodeSoundFont(bytes, decode);
	return new Uint8Array(
		to === 'sf2' ? plain : await encodeSoundFont(plain, encode, codec, checkedEncodeOptions({ bitrate, quality })),
	);
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
 * SoundFont 2 decoded through `decode` (FLAC in-process and `ffmpeg` for the rest by default). Returns
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
	const bytes = new Uint8Array(format === 'sf2' ? await decodeSoundFont(merged, decode ?? defaultDecode) : merged);
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
  convert <in> <out> [--codec vorbis|opus|flac] [--bitrate <kbps>] [--quality <-1..10>]
                                                a SoundFont 2 or 3 written as the kind <out> ends in (.sf2 or .sf3);
                                                an .sf3 is compressed in --codec (default vorbis);
                                                --bitrate sets Opus's kbit/s, --quality Vorbis's level. Vorbis and Opus
                                                need ffmpeg on PATH, FLAC does not`;

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
		const usage =
			'usage: mwg-soundfonts convert <in.sf2|in.sf3> <out.sf2|out.sf3> [--codec vorbis|opus|flac] [--bitrate kbps] [--quality -1..10]';
		if (!input || !output) throw new Error(usage);
		const to = /.sf([23])$/i.exec(output);
		if (!to) throw new Error(usage);
		writeFileSync(
			output,
			await convertSoundFont(readFileSync(input), {
				to: `sf${to[1]}`,
				codec: flag('--codec'),
				bitrate: flag('--bitrate') === undefined ? undefined : Number(flag('--bitrate')),
				quality: flag('--quality') === undefined ? undefined : Number(flag('--quality')),
			}),
		);
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
