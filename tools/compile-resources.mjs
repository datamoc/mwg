import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, extname, relative, sep, dirname } from 'node:path';
import { WEBP_CONVERTIBLE_EXTENSIONS } from './webp-convert.mjs';

/**
 * Turns a folder of assets into scripts a `file://` page can load.
 *
 * Opening a page from disk removes three things a normal web game relies on:
 *
 *   - `fetch()` and XHR are blocked, so nothing can be loaded on demand and no directory
 *     can be listed;
 *   - ES modules are blocked by CORS, so the page cannot use a module loader;
 *   - an `<img>` read from a sibling file counts as cross-origin in Chrome, so uploading
 *     it into a WebGL texture throws a SecurityError.
 *
 * The last one is the awkward one: even shipping plain .png files next to the page does
 * not work. What does work is a `<script src>`, which is exempt from those rules. So each
 * asset becomes a `data:` URI inside a generated script, grouped by folder so no single
 * file is enormous and a rebuild only rewrites what changed.
 *
 * The result is a global `__MWG_ASSETS__` mapping asset path to `data:` URI, which
 * `mwg/assets` reads.
 */

export const DEFAULT_MIME = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.mp3': 'audio/mpeg',
	'.ttf': 'font/ttf',
	'.woff2': 'font/woff2',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.mid': 'audio/midi',
	'.midi': 'audio/midi',
	'.sf2': 'application/octet-stream',
	'.sf3': 'application/octet-stream',
};

const isSoundFontKey = (key) => /\.sf[23]$/i.test(key);
const SOUNDFONT_CODECS = ['opus', 'vorbis', 'flac'];
const isMidiKey = (key) => /\.(mid|midi)$/i.test(key);

/**
 * The SoundFont/MIDI implementation lives in the library, not in this tool: in this
 * repository it is the TypeScript source, in an installed package it is the built
 * `dist/` the source compiles to. Only called when a build actually embeds a
 * SoundFont it can subset, so a game without one never pays for the import.
 */
async function loadSoundFontTools() {
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

function checkedSoundFontUsage(soundFontUsage) {
	if (soundFontUsage === undefined) return undefined;
	if (!Array.isArray(soundFontUsage)) throw new Error('soundFontUsage must be an array of { bank, program }');
	return soundFontUsage.map((entry, index) => {
		const { bank, program } = entry ?? {};
		if (!Number.isInteger(bank) || bank < 0 || !Number.isInteger(program) || program < 0 || program > 127) {
			throw new Error(`soundFontUsage[${index}] needs an integer bank >= 0 and a program between 0 and 127`);
		}
		return { bank, program };
	});
}

/**
 * A SoundFont 2 compressed into a SoundFont 3 in `codec`; a SoundFont 3 comes back as it is. `explicit`
 * is whether the caller named the codec: without it a machine with no `ffmpeg` keeps the SoundFont 2 and
 * says so in `warning`, with it the build fails, since the developer asked for exactly that format.
 */
async function compressSoundFont(tools, bytes, codec, explicit, encode, options) {
	const { ffmpegEncode } = await import('./soundfonts.mjs');
	try {
		const compressed = Buffer.from(await tools.encodeSoundFont(bytes, encode ?? ffmpegEncode, codec, options));
		//an unchanged result is a font that was already a SoundFont 3
		return { bytes: compressed, codec: compressed.equals(bytes) ? null : codec };
	} catch (error) {
		if (error?.code === 'FFMPEG_MISSING' && !explicit) {
			return {
				bytes,
				codec: null,
				warning: `ffmpeg is not installed, so the SoundFont stays a SoundFont 2 instead of a SoundFont 3 in ${codec}: install ffmpeg, or pass soundFontCodec: 'flac' (no ffmpeg needed) or false`,
			};
		}
		throw new Error(`cannot compress the SoundFont as ${codec}: ${error.message ?? error}`);
	}
}

/** a numeric `--name=value` CLI argument, undefined when absent */
export function numberFlag(args, prefix) {
	const arg = args.find((a) => a.startsWith(prefix));
	return arg === undefined ? undefined : Number(arg.slice(prefix.length));
}

/** the `--soundfont-codec=` CLI value as an option: a codec name, `false` for `none`, undefined when absent */
export function soundFontCodecFromFlag(arg) {
	const value = arg?.slice('--soundfont-codec='.length);
	return value === undefined ? undefined : value === 'none' ? false : value;
}

/** parses a `--soundfont-usage=bank:program,...` CLI value; undefined when the flag is absent */
export function soundFontUsageFromFlag(value) {
	if (value === undefined) return undefined;
	return value
		.split(',')
		.filter(Boolean)
		.map((pair) => {
			const [bank, program] = pair.split(':').map(Number);
			return { bank, program };
		});
}

export async function* walk(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else yield full;
	}
}

/**
 * @param options.from folder holding the assets
 * @param options.to folder to write the generated scripts into
 * @param options.mime extension to MIME type, merged over the defaults
 * @param options.assetFiles exact paths relative to `from` to embed; omit for all, [] for none.
 *   Unknown paths and explicitly selected unsupported formats fail before replacing output.
 *   credits.json is converted to CREDITS.txt only when selected (or when no list is given).
 * @param options.groupBy how to name the script an asset lands in; defaults to its top folder
 * @param options.toWebp convert `.png`/`.jpg`/`.jpeg` assets to WebP before embedding
 *   (default false - see `tools/webp-convert.mjs`). The asset's *key* never changes (a game
 *   still calls `load('tiles.png')` in both dev and built modes; dev mode serves the literal
 *   file from disk, unconverted), only the embedded `data:` URI's bytes and MIME type do, and
 *   only when the WebP result is actually smaller - a conversion that would not save
 *   anything is silently skipped rather than embedded anyway.
 * @param options.webpLossless use WebP's lossless mode when converting (default true - a
 *   pixel-art tileset's exact colours survive; set false only with `webpQuality` to opt into
 *   lossy re-encoding for photographic source art)
 * @param options.webpQuality 0-100, used only when `webpLossless` is false (default 90)
 * @param options.svgo minify embedded `.svg` assets through the optional `svgo` package (default
 *   false - see `tools/svg-optimise.mjs`). The key never changes, only the embedded bytes, and
 *   only when the optimised file is actually smaller. A file svgo cannot parse fails the build by
 *   name rather than shipping unoptimised in silence.
 * @param options.soundFont subset an embedded `.sf2` or `.sf3` to the programs the embedded
 *   `.mid`/`.midi` files use (default true); `false` embeds every SoundFont whole
 * @param options.soundFontUsage explicit `{ bank, program }` list to subset to, for a
 *   game that voices notes no shipped MIDI file requests; overrides the MIDI-derived list
 * @param options.soundFontCodec how a plain `.sf2` is embedded: compressed into a SoundFont 3 in
 *   this codec (`'opus'` by default, or `'vorbis'`, `'flac'`), or `false` to embed the SoundFont 2
 *   as it is. The asset key does not change and `loadSoundFont` reads either kind. Opus and Vorbis
 *   are encoded by `ffmpeg` on the developer machine; when it is absent and no codec was asked for
 *   by name, the font embeds as a SoundFont 2 and the result says why, and a codec named
 *   explicitly fails the build. A `.sf3` is embedded as it is, in whatever codec it already has.
 * @param options.soundFontBitrate target bitrate in kbit/s (6 to 510) for an Opus SoundFont; ffmpeg's own
 *   default (about 64 kbit/s for these mono samples) when absent. Ignored by the other codecs
 * @param options.soundFontQuality Vorbis quality level, -1 (smallest) to 10 (best); ffmpeg's own default
 *   (3) when absent. Ignored by the other codecs
 * @param options.soundFontEncode replaces the encoder (`(frames, rate, codec) => bytes`), for tests
 * @returns the group names, in the order the page should load them
 *
 * An `assets/credits.json` (an array, or `{ "credits": [...] }`, of `{ name, license, author?, url? }`)
 * is not embedded as an asset: it is turned into `CREDITS.txt` beside the compiled scripts, for
 * the attribution that free art packs require. An entry without a `name` and a `license` is an
 * error, since a credits file that silently omits a pack defeats its purpose.
 */
export async function compileResources({
	from,
	to,
	mime = {},
	groupBy,
	assetFiles,
	toWebp: convertToWebp = false,
	webpLossless = true,
	webpQuality = 90,
	svgo: optimiseSvgFiles = false,
	soundFont = true,
	soundFontUsage,
	soundFontCodec,
	soundFontBitrate,
	soundFontQuality,
	soundFontEncode,
} = {}) {
	if (!from || !to) throw new Error('compileResources needs both `from` and `to`');
	if (soundFontCodec !== undefined && soundFontCodec !== false && !SOUNDFONT_CODECS.includes(soundFontCodec)) {
		throw new Error(`unknown soundFontCodec "${soundFontCodec}": expected ${SOUNDFONT_CODECS.join(', ')} or false`);
	}
	const codec = soundFontCodec === undefined ? 'opus' : soundFontCodec;
	const encodeOptions = (await import('./soundfonts.mjs')).checkedEncodeOptions({
		bitrate: soundFontBitrate,
		quality: soundFontQuality,
	});

	const types = { ...DEFAULT_MIME, ...mime };
	const group = groupBy ?? ((key) => (key.includes('/') ? key.slice(0, key.indexOf('/')) : 'assets'));

	const files = [];
	for await (const file of walk(from)) files.push(file);
	const keyOf = (file) => relative(from, file).split(sep).join('/');
	const selected =
		assetFiles === undefined
			? undefined
			: new Set(assetFiles.map((key) => key.replaceAll('\\', '/').replace(/^\.\//, '')));
	if (selected) {
		const known = new Set(files.map(keyOf));
		for (const key of selected) {
			if (!known.has(key)) throw new Error(`unknown asset file ${key}`);
			if (key !== 'credits.json' && !types[extname(key).toLowerCase()])
				throw new Error(`unsupported asset file ${key}`);
		}
	}

	// A shipped SoundFont carries only the programs the game's shipped MIDI files
	// request: the full bank - even a small one - is mostly
	// instruments no track plays. Usage is resolved before any output is replaced,
	// so an unreadable MIDI or SoundFont fails the build with the old output intact.
	// With no shipped MIDI and no explicit `soundFontUsage` the usage is unknowable
	// (a game may voice notes it generates), so the font embeds whole.
	const isSelected = (file) => !selected || selected.has(keyOf(file));
	const explicitUsage = checkedSoundFontUsage(soundFontUsage);
	const embedsSoundFont =
		soundFont !== false && files.some((file) => isSelected(file) && isSoundFontKey(keyOf(file)));
	let soundFontTools = null;
	let usage = explicitUsage;
	if (embedsSoundFont && usage === undefined) {
		const midiFiles = files.filter((file) => isSelected(file) && isMidiKey(keyOf(file)));
		if (midiFiles.length > 0) {
			soundFontTools = await loadSoundFontTools();
			const parsed = [];
			for (const file of midiFiles) {
				try {
					parsed.push(soundFontTools.parseMidi(await readFile(file)));
				} catch (error) {
					throw new Error(
						`cannot read MIDI asset ${keyOf(file)} to subset a SoundFont: ${error.message ?? error}`,
					);
				}
			}
			usage = soundFontTools.collectSoundFontUsage(parsed);
		}
	}
	const hasSoundFont = files.some((file) => isSelected(file) && isSoundFontKey(keyOf(file)));
	if (((embedsSoundFont && usage !== undefined) || (hasSoundFont && codec)) && !soundFontTools) {
		soundFontTools = await loadSoundFontTools();
	}
	const soundFonts = [];

	await rm(to, { recursive: true, force: true });
	await mkdir(to, { recursive: true });

	const groups = new Map();
	let skipped = 0;
	let rawBytes = 0;
	let embeddedBytes = 0;
	let webpConverted = 0;
	let svgOptimised = 0;

	// only paid when toWebp is actually used, so a build that never asks for it never imports
	// (or requires installing) sharp
	const toWebp = convertToWebp ? (await import('./webp-convert.mjs')).toWebp : null;
	const optimiseSvg = optimiseSvgFiles ? (await import('./svg-optimise.mjs')).optimiseSvg : null;

	const creditsFile = join(from, 'credits.json');
	let credits = null;
	const keys = [];

	for (const file of files) {
		if (selected && !selected.has(keyOf(file))) continue;
		if (file === creditsFile) {
			credits = creditsText(JSON.parse(await readFile(file, 'utf8')));
			continue;
		}
		const ext = extname(file).toLowerCase();
		const type = types[ext];
		if (!type) {
			skipped++;
			continue;
		}

		const key = keyOf(file);
		const data = await readFile(file);

		let mimeType = type;
		let bytes = data;
		if (toWebp && WEBP_CONVERTIBLE_EXTENSIONS.has(ext)) {
			const webp = await toWebp(data, { lossless: webpLossless, quality: webpQuality });
			if (webp.length < data.length) {
				mimeType = 'image/webp';
				bytes = webp;
				webpConverted++;
			}
		}

		if (optimiseSvg && ext === '.svg') {
			let optimised;
			try {
				optimised = await optimiseSvg(data);
			} catch (error) {
				throw new Error(`cannot optimise SVG asset ${key}: ${error.message ?? error}`);
			}
			if (optimised.length < data.length) {
				bytes = optimised;
				svgOptimised++;
			}
		}

		if (isSoundFontKey(key)) {
			const embed = { key, programs: null, rawBytes: data.length, embeddedBytes: data.length, codec: null };
			if (usage !== undefined && soundFontTools) {
				try {
					bytes = Buffer.from(soundFontTools.subsetSoundFont(data, usage));
				} catch (error) {
					throw new Error(`cannot subset SoundFont asset ${key}: ${error.message ?? error}`);
				}
				embed.programs = usage.length;
				embed.embeddedBytes = bytes.length;
				//the programs the MIDI files ask for that this font does not carry
				embed.missing = soundFontTools.missingSoundFontPrograms(data, usage);
			}
			if (codec && soundFontTools) {
				const compressed = await compressSoundFont(
					soundFontTools,
					bytes,
					codec,
					soundFontCodec !== undefined,
					soundFontEncode,
					encodeOptions,
				);
				bytes = compressed.bytes;
				embed.embeddedBytes = bytes.length;
				embed.codec = compressed.codec;
				if (compressed.warning) embed.warning = compressed.warning;
			}
			soundFonts.push(embed);
		}

		const name = group(key);
		if (!groups.has(name)) groups.set(name, {});
		groups.get(name)[key] = `data:${mimeType};base64,${bytes.toString('base64')}`;
		keys.push(key);
		rawBytes += data.length;
		embeddedBytes += bytes.length;
	}

	const written = [];
	for (const [name, assets] of groups) {
		const js =
			'//generated by mwg/tools/compile-resources, do not edit\n' +
			'(function(){var a=window.__MWG_ASSETS__||(window.__MWG_ASSETS__={});' +
			`var g=${JSON.stringify(assets)};for(var k in g)a[k]=g[k];})();\n`;

		await writeFile(join(to, `${name}.js`), js, 'utf8');
		written.push({ name, count: Object.keys(assets).length, size: js.length });
	}

	if (credits) await writeFile(join(to, 'CREDITS.txt'), credits, 'utf8');

	return {
		groups: written,
		keys,
		rawBytes,
		embeddedBytes,
		webpConverted,
		svgOptimised,
		skipped,
		credits,
		soundFonts,
	};
}

/** the plain-text credits for a manifest, one block per entry; throws on an entry that cannot be attributed */
export function creditsText(manifest) {
	const entries = Array.isArray(manifest) ? manifest : manifest?.credits;
	if (!Array.isArray(entries)) throw new Error('credits.json must be an array or { "credits": [...] }');
	const blocks = entries.map((entry, index) => {
		if (typeof entry?.name !== 'string' || typeof entry?.license !== 'string') {
			throw new Error(`credits.json entry ${index} needs a "name" and a "license"`);
		}
		const lines = [entry.name + (entry.author ? ` by ${entry.author}` : ''), `License: ${entry.license}`];
		if (entry.url) lines.push(entry.url);
		return lines.join('\n');
	});
	return blocks.join('\n\n') + '\n';
}

// ---------------------------------------------------------------- CLI

//the real path, since an npm `bin` shim reaches this file through a symlink; a suffix test on the
//name is not enough (`compress-dist.mjs` ends with `t.mjs`)
const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

async function runCli() {
	const args = process.argv.slice(2);
	const [from, to] = args.filter((a) => !a.startsWith('--'));
	if (!from || !to) {
		console.error(
			'usage: node compile-resources.mjs <asset folder> <output folder> [--to-webp] [--webp-lossy[=quality]] [--svgo] [--no-soundfont-subset] [--soundfont-usage=bank:program,...] [--soundfont-codec=opus|vorbis|flac|none] [--soundfont-bitrate=kbps] [--soundfont-quality=-1..10]',
		);
		process.exit(1);
	}
	const toWebp = args.includes('--to-webp');
	const lossyFlag = args.find((a) => a === '--webp-lossy' || a.startsWith('--webp-lossy='));
	const webpLossless = !lossyFlag;
	const webpQuality = lossyFlag && lossyFlag.includes('=') ? Number(lossyFlag.split('=')[1]) : 90;

	const soundFontUsage = soundFontUsageFromFlag(
		args.find((a) => a.startsWith('--soundfont-usage='))?.slice('--soundfont-usage='.length),
	);

	const { groups, rawBytes, embeddedBytes, webpConverted, svgOptimised, skipped, soundFonts } =
		await compileResources({
			from,
			to,
			//a flat folder has no subdirectories to group by, so everything lands in one file
			groupBy: (key) => (key.includes('/') ? key.slice(0, key.indexOf('/')) : 'assets'),
			toWebp,
			webpLossless,
			webpQuality,
			svgo: args.includes('--svgo'),
			soundFont: !args.includes('--no-soundfont-subset'),
			soundFontUsage,
			soundFontCodec: soundFontCodecFromFlag(args.find((a) => a.startsWith('--soundfont-codec='))),
			soundFontBitrate: numberFlag(args, '--soundfont-bitrate='),
			soundFontQuality: numberFlag(args, '--soundfont-quality='),
		});

	const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' KB';
	for (const { name, count, size } of groups) {
		console.log(`  ${join(relative(process.cwd(), to), name + '.js').padEnd(40)}${kb(size)}  (${count} files)`);
	}
	console.log(`  ${groups.length} script(s), ${kb(rawBytes)} of assets` + (skipped ? `, ${skipped} skipped` : ''));
	for (const font of soundFonts) {
		console.log(
			font.programs === null
				? `  ${font.key}: SoundFont embedded whole (${kb(font.rawBytes)}), no shipped MIDI to subset against`
				: `  ${font.key}: SoundFont subset to ${font.programs} program(s), ${kb(font.rawBytes)} -> ${kb(font.embeddedBytes)}`,
		);
		if (font.codec)
			console.log(`    compressed as a SoundFont 3 in ${font.codec}: ${kb(font.embeddedBytes)} embedded`);
		if (font.warning) console.log(`  warning: ${font.key}: ${font.warning}`);
		if (font.missing?.length > 0) {
			console.log(
				`  warning: ${font.key} does not carry ${font.missing.map(({ bank, program }) => `${bank}:${program}`).join(', ')}: ` +
					"they play the font's piano, or the built-in synthesizer with `missingProgram: 'synth'`",
			);
		}
	}
	if (args.includes('--svgo')) console.log(`  ${svgOptimised} SVG(s) optimised`);
	if (toWebp) {
		console.log(
			`  ${webpConverted} image(s) converted to WebP (${webpLossless ? 'lossless' : `lossy, quality ${webpQuality}`}), ` +
				`${kb(rawBytes)} -> ${kb(embeddedBytes)} embedded`,
		);
	}
}

//no top-level await: a vite config loaded as CommonJS has to be able to require() this module
if (isMain) {
	runCli().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}

export { dirname };
