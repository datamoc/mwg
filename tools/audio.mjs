#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * `mwg-audio`: the developer-side tool for a game's audio files. It tells what a file is
 * (`inspect`), renders a MIDI file to a WAV through any registered engine (`render`), converts
 * between the formats the library reads and writes (`convert`), measures what the audio costs a
 * page and the memory a bus holds once tracks are rendered (`budget`), and says how far apart
 * two renders sound (`compare`). Nothing here runs in a browser or reaches a player.
 *
 * The chip formats (MWA, YM, VGM, NSF, SID) belong to a separate package: `inspect` names them
 * by their signature, and `convert` hands them to `--converter <module>`, a module whose default
 * export is `(bytes, name) => Uint8Array`. Engines for `render --synth` come from `--module
 * <file>`, a module that calls `registerMidiSynth` when imported.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** the library: the TypeScript source in this repository, the built `dist/` in an installed package */
async function loadLibrary() {
	try {
		const [midi, render, soundFont, wav, resample, distance, synth] = await Promise.all([
			import('../src/audio/Midi.ts'),
			import('../src/audio/MidiRender.ts'),
			import('../src/audio/SoundFont.ts'),
			import('../src/audio/Wav.ts'),
			import('../src/audio/Resample.ts'),
			import('../src/audio/SpectralDistance.ts'),
			import('../src/audio/MidiSynth.ts'),
		]);
		return { ...midi, ...render, ...soundFont, ...wav, ...resample, ...distance, ...synth };
	} catch {
		return import(pathToFileURL(join(HERE, '..', 'dist', 'audio', 'index.js')).href);
	}
}

const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));

const SYSEX_MAKERS = new Map([
	[0x41, 'Roland'],
	[0x42, 'Korg'],
	[0x43, 'Yamaha'],
	[0x44, 'Casio'],
	[0x47, 'Akai'],
	[0x7e, 'universal non-real-time'],
	[0x7f, 'universal real-time'],
]);

/**
 * Names a file by its content, falling back on the extension for formats with no signature.
 * Returns `{ format, kind }` where kind is `midi`, `wav`, `soundfont`, `compressed`, `chip`,
 * `tracker`, `sysex` or `unknown`.
 */
export function detectAudioFormat(bytes, name = '') {
	const head4 = ascii(bytes, 0, 4);
	const extension = extname(name).toLowerCase();
	if (head4 === 'MThd') return { format: 'MIDI', kind: 'midi' };
	if (head4 === 'RIFF') {
		const form = ascii(bytes, 8, 12);
		if (form === 'WAVE') return { format: 'WAV', kind: 'wav' };
		if (form === 'sfbk') return { format: 'SoundFont 2', kind: 'soundfont' };
		if (form === 'RMID') return { format: 'RIFF MIDI', kind: 'midi' };
	}
	if (head4 === 'OggS')
		return { format: ascii(bytes, 28, 35) === '\x01vorbis' ? 'Ogg Vorbis' : 'Ogg', kind: 'compressed' };
	if (head4 === 'fLaC') return { format: 'FLAC', kind: 'compressed' };
	if (head4 === 'MWA1') return { format: 'MWA', kind: 'chip' };
	if (head4 === 'NESM') return { format: 'NSF', kind: 'chip' };
	if (head4 === 'PSID' || head4 === 'RSID') return { format: 'SID', kind: 'chip' };
	if (head4 === 'Vgm ') return { format: 'VGM', kind: 'chip' };
	if (head4 === 'IMPM') return { format: 'Impulse Tracker', kind: 'tracker' };
	if (ascii(bytes, 0, 17) === 'Extended Module: ') return { format: 'XM', kind: 'tracker' };
	if (head4.startsWith('YM') && /^YM[3456]/.test(head4)) return { format: 'YM', kind: 'chip' };
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
		return {
			format: extension === '.vgz' ? 'VGZ (gzip VGM)' : 'gzip',
			kind: extension === '.vgz' ? 'chip' : 'unknown',
		};
	}
	if (bytes[0] === 0xf0 && bytes.includes(0xf7)) return { format: 'MIDI SysEx', kind: 'sysex' };
	if (head4.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
		return { format: 'MP3', kind: 'compressed' };
	if (ascii(bytes, 4, 8) === 'ftyp') return { format: 'MP4 audio', kind: 'compressed' };
	if (extension === '.mod' && bytes.length > 1084) return { format: 'MOD', kind: 'tracker' };
	return { format: 'unknown', kind: 'unknown' };
}

/** the SysEx messages of a file: how many, who made the instrument, how large */
function sysexSummary(bytes) {
	const messages = [];
	let start = -1;
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === 0xf0) start = i;
		else if (bytes[i] === 0xf7 && start !== -1) {
			messages.push({ maker: bytes[start + 1], size: i - start + 1 });
			start = -1;
		}
	}
	return {
		messages: messages.length,
		makers: [...new Set(messages.map((m) => SYSEX_MAKERS.get(m.maker) ?? `0x${m.maker.toString(16)}`))],
		largestMessage: Math.max(0, ...messages.map((m) => m.size)),
	};
}

/** the facts about a MIDI file a developer wants before rendering it */
function midiSummary(lib, bytes) {
	const file = lib.parseMidi(bytes);
	const notes = lib.scheduleMidi(file);
	const channels = {};
	for (const note of notes) {
		const entry = (channels[note.channel] ??= { notes: 0, programs: new Set() });
		entry.notes++;
		entry.programs.add(note.channel === 9 ? 'drums' : note.program);
	}
	const end = notes.reduce((latest, note) => Math.max(latest, note.time + note.duration), 0);
	return {
		ticksPerQuarter: file.ticksPerQuarter,
		events: file.events.length,
		notes: notes.length,
		seconds: Number(end.toFixed(3)),
		loopStartSeconds: lib.midiLoopStart(file),
		channels: Object.fromEntries(
			Object.entries(channels).map(([channel, entry]) => [
				channel,
				{ notes: entry.notes, programs: [...entry.programs] },
			]),
		),
	};
}

/** describes one file: its format and the numbers that matter for that format */
export async function inspectAudio(bytes, name = '') {
	const lib = await loadLibrary();
	const detected = detectAudioFormat(bytes, name);
	const report = { name, bytes: bytes.length, ...detected };
	if (detected.kind === 'wav') Object.assign(report, lib.wavInfo(bytes));
	else if (detected.kind === 'midi' && detected.format === 'MIDI') Object.assign(report, midiSummary(lib, bytes));
	else if (detected.kind === 'sysex') Object.assign(report, sysexSummary(bytes));
	else if (detected.kind === 'soundfont') {
		const font = lib.parseSoundFont(bytes);
		report.presets = font.presets ? font.presets.length : undefined;
	}
	return report;
}

/** `"0,9"` as `[0, 9]`, each a MIDI channel */
export function parseChannelList(text) {
	return text.split(',').map((item) => {
		const channel = Number(item.trim());
		if (!Number.isInteger(channel) || channel < 0 || channel > 15)
			throw new Error(`invalid channel "${item}": expected 0 to 15`);
		return channel;
	});
}

async function importModule(path) {
	return import(pathToFileURL(resolve(path)).href);
}

/**
 * Renders MIDI bytes to WAV bytes. `synth` is an engine name or a comma list tried in order
 * (the engines come from `modules`, imported first), `soundfont` the bytes of a SoundFont.
 */
export async function renderToWav(midiBytes, options = {}) {
	const lib = await loadLibrary();
	for (const module of options.modules ?? []) await importModule(module);
	const rendered = lib.renderMidiToBuffer(lib.parseMidi(midiBytes), {
		synth: options.synth ? options.synth.split(',').map((name) => name.trim()) : undefined,
		soundfont: options.soundfont ? lib.parseSoundFont(options.soundfont) : null,
		sampleRate: options.rate,
		gain: options.gain,
		channels: options.channels,
	});
	return lib.encodeWav(rendered, options.float ? 'float32' : 'pcm16');
}

/** resamples WAV bytes to another rate */
export async function resampleWav(wavBytes, rate, float = false) {
	const lib = await loadLibrary();
	return lib.encodeWav(lib.resampleStereo(lib.decodeWav(wavBytes), rate), float ? 'float32' : 'pcm16');
}

/** how far apart two WAV files sound, in dB of log-spectrum difference */
export async function compareWavs(a, b, options = {}) {
	const lib = await loadLibrary();
	return lib.spectralDistance(lib.decodeWav(a), lib.decodeWav(b), options);
}

const AUDIO_EXTENSIONS = new Set([
	'.mid',
	'.midi',
	'.wav',
	'.ogg',
	'.mp3',
	'.flac',
	'.m4a',
	'.mwa',
	'.sf2',
	'.sf3',
	'.syx',
	'.nsf',
	'.sid',
	'.vgm',
	'.ym',
]);

/** every audio file under the given files and folders */
function collectFiles(paths) {
	const found = [];
	const visit = (path) => {
		const stats = statSync(path);
		if (stats.isDirectory()) {
			for (const entry of readdirSync(path).sort()) visit(join(path, entry));
		} else if (AUDIO_EXTENSIONS.has(extname(path).toLowerCase())) {
			found.push(path);
		}
	};
	for (const path of paths) visit(path);
	return found;
}

const MEGABYTE = 1024 * 1024;

/**
 * What the audio of a game costs: for each file the bytes on disk, the bytes it adds to a page
 * (base64 makes it a third larger) and the memory it holds once decoded into a bus. A MIDI file
 * is rendered to PCM before it plays, so its memory is its length times the render rate; a
 * compressed file's decoded size cannot be known without decoding it, and is left out of the
 * total rather than guessed.
 */
export async function audioBudget(paths, options = {}) {
	const lib = await loadLibrary();
	const rate = options.rate ?? 22050;
	const maxSeconds = options.maxSeconds ?? 480;
	const files = [];
	for (const path of collectFiles(paths)) {
		const bytes = readFileSync(path);
		const detected = detectAudioFormat(bytes, path);
		let seconds = null;
		let decodedBytes = null;
		let renderRate = rate;
		let sizingSeconds = null;
		if (detected.kind === 'midi' && detected.format === 'MIDI') {
			const summary = midiSummary(lib, bytes);
			seconds = summary.seconds;
			//the memory a render holds includes its decay tail; the track's own length does not
			sizingSeconds = Math.min(maxSeconds, seconds + 1.5);
		} else if (detected.kind === 'wav') {
			const info = lib.wavInfo(bytes);
			seconds = info.seconds;
			sizingSeconds = seconds;
			renderRate = info.sampleRate;
		}
		if (sizingSeconds !== null) decodedBytes = Math.ceil(sizingSeconds * renderRate) * 2 * 4;
		files.push({
			path,
			format: detected.format,
			diskBytes: bytes.length,
			pageBytes: Math.ceil((bytes.length * 4) / 3),
			seconds,
			decodedBytes,
		});
	}
	const total = (key) => files.reduce((sum, file) => sum + (file[key] ?? 0), 0);
	const problems = [];
	if (options.maxMegabytes !== undefined && total('decodedBytes') > options.maxMegabytes * MEGABYTE) {
		problems.push(
			`decoded audio is ${(total('decodedBytes') / MEGABYTE).toFixed(1)} MB, over the ${options.maxMegabytes} MB budget`,
		);
	}
	for (const file of files) {
		if (file.seconds !== null && file.seconds > (options.maxTrackSeconds ?? Infinity)) {
			problems.push(`${file.path} is ${file.seconds.toFixed(0)} s, over ${options.maxTrackSeconds} s`);
		}
	}
	return {
		files,
		totals: { diskBytes: total('diskBytes'), pageBytes: total('pageBytes'), decodedBytes: total('decodedBytes') },
		problems,
	};
}

const USAGE = `usage: mwg-audio <command>
  inspect <file>...                              the format and its numbers: MIDI notes and channels, WAV layout, SysEx messages
  render <in.mid> -o <out.wav> [--synth <names>] [--module <file>...] [--soundfont <file>] [--rate <hz>]
                                                 [--channels 0,9] [--gain <0-1>] [--float]
                                                 a MIDI file to WAV through a registered engine (--module imports the code that registers it)
  convert <in> <out> [--rate <hz>] [--converter <module>]
                                                 .mid to .wav, .wav to .wav at another rate, or any file through a converter module
                                                 (MWA and the other chip formats come from the retro-audio package's converter)
  budget <file|folder>... [--rate <hz>] [--max-mb <n>] [--max-track-seconds <n>] [--json]
                                                 disk, page and decoded memory cost of the audio; exits 1 over a budget
  compare <a.wav> <b.wav> [--max <db>]           spectral distance between two renders; exits 1 over --max`;

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
		const out = [];
		for (let at = rest.indexOf(name); at !== -1 && at < rest.length; at = rest.indexOf(name, at + 1)) {
			for (let i = at + 1; i < rest.length && !rest[i].startsWith('--') && rest[i] !== '-o'; i++)
				out.push(rest[i]);
		}
		return out;
	};
	const number = (name) => (flag(name) === undefined ? undefined : Number(flag(name)));
	const positional = () => {
		const out = [];
		const valued = new Set([
			'-o',
			'--synth',
			'--module',
			'--soundfont',
			'--rate',
			'--channels',
			'--gain',
			'--converter',
			'--max',
			'--max-mb',
			'--max-track-seconds',
		]);
		for (let i = 0; i < rest.length; i++) {
			if (valued.has(rest[i])) i++;
			else if (!rest[i].startsWith('-')) out.push(rest[i]);
		}
		return out;
	};

	if (command === 'inspect') {
		const files = positional();
		if (files.length === 0) throw new Error('usage: mwg-audio inspect <file>...');
		for (const file of files) console.log(JSON.stringify(await inspectAudio(readFileSync(file), file), null, 2));
	} else if (command === 'render') {
		const [input] = positional();
		const out = flag('-o');
		if (!input || !out) throw new Error('usage: mwg-audio render <in.mid> -o <out.wav>');
		const wav = await renderToWav(readFileSync(input), {
			synth: flag('--synth'),
			modules: valuesAfter('--module'),
			soundfont: flag('--soundfont') ? readFileSync(flag('--soundfont')) : undefined,
			rate: number('--rate'),
			gain: number('--gain'),
			channels: flag('--channels') ? parseChannelList(flag('--channels')) : undefined,
			float: rest.includes('--float'),
		});
		mkdirSync(dirname(resolve(out)), { recursive: true });
		writeFileSync(out, wav);
		console.log(`wrote ${out}: ${(wav.length / 1024).toFixed(0)} KB`);
	} else if (command === 'convert') {
		const [input, output] = positional();
		if (!input || !output) throw new Error('usage: mwg-audio convert <in> <out>');
		const bytes = readFileSync(input);
		const target = extname(output).toLowerCase();
		let result;
		if (flag('--converter')) {
			const converter = (await importModule(flag('--converter'))).default;
			if (typeof converter !== 'function')
				throw new Error('a converter module must export a default function (bytes, name) => Uint8Array');
			result = await converter(bytes, input);
		} else if (target === '.mwa') {
			throw new Error(
				"converting to MWA is the retro-audio package's job: pass its converter with --converter <module>",
			);
		} else if (target === '.wav') {
			const detected = detectAudioFormat(bytes, input);
			if (detected.kind === 'midi') result = await renderToWav(bytes, { rate: number('--rate') });
			else if (detected.kind === 'wav')
				result = number('--rate') ? await resampleWav(bytes, number('--rate')) : bytes;
			else throw new Error(`cannot convert ${detected.format} to .wav without a converter`);
		} else {
			throw new Error(`no conversion to "${target}" is built in: pass --converter <module>`);
		}
		mkdirSync(dirname(resolve(output)), { recursive: true });
		writeFileSync(output, result);
		console.log(`wrote ${output}: ${(result.length / 1024).toFixed(0)} KB`);
	} else if (command === 'budget') {
		const paths = positional();
		if (paths.length === 0) throw new Error('usage: mwg-audio budget <file|folder>...');
		const report = await audioBudget(paths, {
			rate: number('--rate'),
			maxMegabytes: number('--max-mb'),
			maxTrackSeconds: number('--max-track-seconds'),
		});
		if (rest.includes('--json')) {
			console.log(JSON.stringify(report, null, 2));
		} else {
			for (const file of report.files) {
				const memory =
					file.decodedBytes === null
						? 'decoded size unknown'
						: `${(file.decodedBytes / MEGABYTE).toFixed(1)} MB decoded`;
				console.log(
					`${file.path}  ${file.format}  ${(file.pageBytes / 1024).toFixed(0)} KB in the page  ${memory}`,
				);
			}
			const { totals } = report;
			console.log(
				`total: ${(totals.pageBytes / 1024).toFixed(0)} KB in the page, ${(totals.decodedBytes / MEGABYTE).toFixed(1)} MB decoded (files of unknown decoded size not counted)`,
			);
		}
		for (const problem of report.problems) console.error(problem);
		if (report.problems.length > 0) process.exitCode = 1;
	} else if (command === 'compare') {
		const [a, b] = positional();
		if (!a || !b) throw new Error('usage: mwg-audio compare <a.wav> <b.wav>');
		const result = await compareWavs(readFileSync(a), readFileSync(b));
		console.log(`${result.decibels.toFixed(2)} dB over ${result.windows} windows`);
		if (number('--max') !== undefined && result.decibels > number('--max')) {
			console.error(`over the ${number('--max')} dB limit`);
			process.exitCode = 1;
		}
	} else {
		throw new Error(`unknown command "${command}"\n${USAGE}`);
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (
	process.argv[1] &&
	existsSync(process.argv[1]) &&
	realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
