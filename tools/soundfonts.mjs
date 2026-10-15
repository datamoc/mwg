#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `mwg-soundfonts`: the developer-side half of choosing a SoundFont. The package ships one
 * small bank (`data/microgm-opt.sf2`); a game that wants another picks it from the catalogue
 * (`data/soundfont-catalog.json`, a licence-classified snapshot of the marmooo free-soundfonts
 * collection), and this tool fetches only the instruments the game's MIDI files use, converts
 * them from SoundFont 3 and writes one SoundFont 2 file for the asset folder, where the build
 * subsets it again like any other font.
 *
 * Converting SoundFont 3 decodes Ogg Vorbis, which is `ffmpeg`'s job: it is needed on a
 * developer machine only, never by the player, and the tool names it when it is missing.
 * Nothing here runs in a browser.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = join(HERE, '..', 'data', 'soundfont-catalog.json');

/** licence classes a font may be fetched under without saying so */
const FREE_TO_SHIP = new Set(['public-domain', 'permissive', 'attribution']);

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
 * mono 16-bit PCM from Ogg Vorbis bytes, through `ffmpeg`. The bytes come from a font file that
 * may have been downloaded, so they are not trusted: anything that does not start with the Ogg
 * magic is refused before a process is spawned, the demuxer is forced to Ogg rather than probed
 * (a probed "sample" could be read as a playlist naming local files), and only the `pipe` protocol
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
		throw new Error('ffmpeg was not found on PATH: install it to convert SoundFont 3 (developer machines only)');
	}
	if (run.status !== 0) throw new Error(`ffmpeg could not decode a sample: ${run.stderr}`);
	const out = run.stdout;
	return new Int16Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.length - (out.length & 1)));
}

function riffChunks(bytes, start, end) {
	const chunks = [];
	for (let at = start; at + 8 <= end;) {
		const size = bytes.readUInt32LE(at + 4);
		const id = bytes.toString('latin1', at, at + 4);
		chunks.push({ id, kind: id === 'LIST' ? bytes.toString('latin1', at + 8, at + 12) : null, at, size });
		at += 8 + size + (size & 1);
	}
	return chunks;
}

function chunk(id, data) {
	const head = Buffer.alloc(8);
	head.write(id, 0, 'latin1');
	head.writeUInt32LE(data.length, 4);
	return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
}

/**
 * SoundFont 3 bytes to SoundFont 2 bytes: every Ogg Vorbis sample is decoded (`decode` takes
 * the Ogg bytes and returns mono `Int16Array` frames, `ffmpeg` by default) into the `smpl`
 * chunk, and the sample headers are rewritten for it. SoundFont 3 states a compressed
 * sample's loop points relative to the sample, SoundFont 2 states them in the whole chunk,
 * and every sample is followed by the 46 zero frames the format requires. A SoundFont 2
 * input passes through with its samples copied the same way.
 */
export function sf3ToSf2(bytes, decode = ffmpegDecode) {
	const data = Buffer.from(bytes);
	if (data.toString('latin1', 0, 4) !== 'RIFF' || data.toString('latin1', 8, 12) !== 'sfbk') {
		throw new Error('not a SoundFont file');
	}
	const top = riffChunks(data, 12, data.length);
	const info = top.find((entry) => entry.kind === 'INFO');
	const sdta = top.find((entry) => entry.kind === 'sdta');
	const pdta = top.find((entry) => entry.kind === 'pdta');
	if (!sdta || !pdta) throw new Error('SoundFont is missing its sample or preset data');

	const smplEntry = riffChunks(data, sdta.at + 12, sdta.at + 8 + sdta.size).find((entry) => entry.id === 'smpl');
	if (!smplEntry) throw new Error('SoundFont is missing "smpl"');
	const smpl = data.subarray(smplEntry.at + 8, smplEntry.at + 8 + smplEntry.size);
	const tables = new Map(
		riffChunks(data, pdta.at + 12, pdta.at + 8 + pdta.size).map((entry) => [
			entry.id,
			Buffer.from(data.subarray(entry.at + 8, entry.at + 8 + entry.size)),
		]),
	);
	const shdr = tables.get('shdr');
	if (!shdr) throw new Error('SoundFont is missing "shdr"');

	const frames = [];
	const decoded = new Map();
	let position = 0;
	const count = Math.floor(shdr.length / 46);
	for (let index = 0; index < count; index++) {
		const at = index * 46;
		const type = shdr.readUInt16LE(at + 44);
		const start = shdr.readUInt32LE(at + 20);
		const end = shdr.readUInt32LE(at + 24);
		const loopStart = shdr.readUInt32LE(at + 28);
		const loopEnd = shdr.readUInt32LE(at + 32);
		if (end === 0 && start === 0) {
			//the terminal record, or an empty sample: nothing to copy
			shdr.writeUInt32LE(position, at + 20);
			shdr.writeUInt32LE(position, at + 24);
			shdr.writeUInt32LE(position, at + 28);
			shdr.writeUInt32LE(position, at + 32);
			continue;
		}
		const compressed = Boolean(type & 0x10);
		//offsets come from the file: a compressed sample is a byte range of the chunk, a plain one a frame range
		const limit = compressed ? smpl.length : smpl.length >> 1;
		if (start > end || end > limit) {
			throw new Error(`sample ${index} points outside the sample data: the SoundFont is damaged`);
		}
		let pcm;
		if (compressed) {
			const key = `${start}:${end}`;
			if (!decoded.has(key)) decoded.set(key, decode(smpl.subarray(start, end)));
			pcm = decoded.get(key);
		} else {
			//a copy of just this sample's bytes, never a slice of the whole underlying buffer
			pcm = new Int16Array(Uint8Array.prototype.slice.call(smpl, start * 2, end * 2).buffer);
		}
		const relativeStart = compressed ? loopStart : loopStart - start;
		const relativeEnd = compressed ? loopEnd : loopEnd - start;
		shdr.writeUInt32LE(position, at + 20);
		shdr.writeUInt32LE(position + pcm.length, at + 24);
		shdr.writeUInt32LE(position + Math.min(relativeStart, pcm.length), at + 28);
		shdr.writeUInt32LE(position + Math.min(relativeEnd, pcm.length), at + 32);
		shdr.writeUInt16LE(type & ~0x10, at + 44);
		frames.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength), Buffer.alloc(46 * 2));
		position += pcm.length + 46;
	}

	const infoBody = info ? Buffer.from(data.subarray(info.at + 12, info.at + 8 + info.size)) : Buffer.alloc(0);
	//an SF3 reports major version 3 in its `ifil` chunk, and what is written here is a 2
	if (infoBody.toString('latin1', 0, 4) === 'ifil') infoBody.writeUInt16LE(2, 8);
	const list = (kind, parts) => chunk('LIST', Buffer.concat([Buffer.from(kind, 'latin1'), ...parts]));
	const order = ['phdr', 'pbag', 'pmod', 'pgen', 'inst', 'ibag', 'imod', 'igen', 'shdr'];
	const body = Buffer.concat([
		Buffer.from('sfbk', 'latin1'),
		...(info ? [list('INFO', [infoBody])] : []),
		list('sdta', [chunk('smpl', Buffer.concat(frames))]),
		list(
			'pdta',
			order.filter((id) => tables.has(id)).map((id) => chunk(id, tables.get(id))),
		),
	]);
	const head = Buffer.alloc(8);
	head.write('RIFF', 0, 'latin1');
	head.writeUInt32LE(body.length, 4);
	return Buffer.concat([head, body]);
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
 * Fetches `programs` (`[{ bank, program }]`) of the catalogue font `name`, converts each from
 * SoundFont 3 and merges them into one SoundFont 2. Returns `{ bytes, found, missing, font }`:
 * `missing` lists the programs the collection does not carry (the renderer falls back for
 * them as it does for any font). A font whose licence class is not free to ship is refused
 * unless `acceptLicence` is set, and a font that is not in the catalogue is refused outright.
 */
export async function fetchSoundFont({
	name,
	programs,
	catalog = readCatalog(),
	source,
	acceptLicence = false,
	decode,
	read,
	merge,
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
	if (programs.length === 0) throw new Error('no programs requested: pass --midi <files> or --programs <list>');
	const origin = source ?? catalog.source;
	const reader = read ?? ((path) => readCollectionFile(origin, path));
	const mergeSoundFonts = merge ?? (await import('../dist/audio/index.js')).mergeSoundFonts;

	const found = [];
	const missing = [];
	const converted = [];
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
		converted.push(new Uint8Array(sf3ToSf2(bytes, decode)));
		found.push({ bank, program });
	}
	if (converted.length === 0) throw new Error(`${name} carries none of the requested programs`);
	return { bytes: new Uint8Array(mergeSoundFonts(converted)), found, missing, font };
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
  fetch <font> (--midi <file>... | --programs <list>) [--out <file.sf2>] [--source <url|folder>] [--accept-licence]
                                                one SoundFont 2 holding just those instruments (programs: 0,24,128:0)
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
		writeFileSync(output, sf3ToSf2(readFileSync(input)));
		console.log(`wrote ${output}`);
	} else if (command === 'fetch') {
		const name = rest.find((arg) => !arg.startsWith('--'));
		if (!name) throw new Error('usage: mwg-soundfonts fetch <font> (--midi <file>... | --programs <list>)');
		const programs = flag('--programs') ? parseProgramList(flag('--programs')) : [];
		const midiFiles = valuesAfter('--midi');
		if (midiFiles.length > 0) {
			const { parseMidi, collectSoundFontUsage } = await import('../dist/audio/index.js');
			programs.push(...collectSoundFontUsage(midiFiles.map((file) => parseMidi(readFileSync(file)))));
		}
		const result = await fetchSoundFont({
			name,
			programs,
			source: flag('--source'),
			acceptLicence: rest.includes('--accept-licence'),
		});
		const out = resolve(flag('--out') ?? `${name}.sf2`);
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, result.bytes);
		writeFileSync(out.replace(/\.sf2$/, '') + '.credits.txt', creditsFor(result.font, result.found));
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
