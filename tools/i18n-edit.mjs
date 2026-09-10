import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, resolve } from 'node:path';
import readline from 'node:readline';

import {
	parseFTL,
	createEditSession,
	cueKeyFor,
	diffPlaceholders,
	isAudioKey,
	sessionRows,
	sessionCompleteness,
	setTargetText,
	setTargetSound,
	copyFromBase,
	deleteTargetKey,
	swapSession,
	tokenizeMessage,
	validateCatalog,
	validateMessageAudio,
	messageText,
} from '../src/i18n/index.ts';
import { parseMarkdown } from '../src/two-d/ui/markdown.ts';

/**
 * A split-screen translation editor for `mwg/i18n` catalogs, in the shape of a small
 * terminal editor (ne-style): the reference language on the left, the translation being
 * worked on on the right. Either file may be any language - the "main" side is whichever
 * path is passed first, and `x` swaps the two at any time.
 *
 * A sound cue is an ordinary `<key>.audio` entry holding a sound path (read by the
 * semantic formatter's `audio` channel, played through `mwg/audio`'s `Sound`), so
 * associating one with a string is just setting one more key (`s`), never translating a
 * file path.
 *
 * Catalog files are auto-detected: JSON (`{ locale, direction, messages }`) or FTL
 * (`key = value` lines, parsed by `parseFTL`). Saving follows the target path's own
 * extension; an FTL target flattens plural/select entries to plain text with a warning,
 * so JSON targets are recommended wherever plurals matter.
 *
 * usage:
 *   node tools/i18n-edit.mjs <base> <target> [--create] [--assets <dir>]
 *   node tools/i18n-edit.mjs <base> <target> --check [--assets <dir>]
 *
 * The panes render markdown (`**bold**` as bold, `*italic*` as italic) and flag
 * placeholder mismatches (`{dmg:03d}` dropped or reshaped in the translation) - the
 * same `parseMarkdown`/`diffPlaceholders` the runtime uses, so the editor can never
 * disagree with the game about either.
 *
 * `Ctrl+P` previews the current row's cue through the operating system's own player
 * (`afplay`, `aplay`/`paplay`/`ffplay`, Windows WAV via SoundPlayer), since a
 * dependency-free tool cannot bundle audio playback of its own; `MWG_SFX_PLAYER` names
 * a replacement command when none of those fit.
 */

const ANSI = {
	reset: '\x1b[0m',
	reverse: '\x1b[7m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	altOn: '\x1b[?1049h',
	altOff: '\x1b[?1049l',
	hideCursor: '\x1b[?25l',
	showCursor: '\x1b[?25h',
};

function usageError(message) {
	console.error(`i18n-edit: ${message}`);
	console.error('usage: node tools/i18n-edit.mjs <base> <target> [--create] [--check] [--assets <dir>]');
	process.exit(2);
}

function parseArgs(argv) {
	const positional = [];
	let create = false;
	let check = false;
	let assetsDir = null;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--create') create = true;
		else if (arg === '--check') check = true;
		else if (arg === '--assets') {
			assetsDir = argv[++i];
			if (!assetsDir) usageError('--assets needs a directory');
		} else if (arg === '--help' || arg === '-h') {
			console.log(
				'Split-screen translation editor for mwg/i18n catalogs.\n\n' +
					'  node tools/i18n-edit.mjs <base> <target> [--create] [--assets <dir>]\n' +
					'  node tools/i18n-edit.mjs <base> <target> --check [--assets <dir>]\n\n' +
					'Keys: j/k or arrows move, Enter/e edit, s sound cue, Ctrl+P preview cue,\n' +
					'  r copy from base, x swap sides, m missing-only, / search,\n' +
					'  v markdown preview, w save, q quit, ? help.',
			);
			process.exit(0);
		} else if (arg.startsWith('-')) {
			usageError(`unknown option ${arg}`);
		} else {
			positional.push(arg);
		}
	}
	if (positional.length !== 2) usageError('needs exactly a <base> and a <target> file');
	return { basePath: positional[0], targetPath: positional[1], create, check, assetsDir };
}

function guessLocale(path) {
	const name = basename(path).replace(/\.(json|ftl)$/i, '');
	return name || 'und';
}

function guessDirection(locale) {
	return /^(ar|he|fa|ur)(?:-|$)/i.test(locale) ? 'rtl' : 'ltr';
}

function isProbablyFTL(text) {
	return /^[A-Za-z0-9_-]+\s*=/m.test(text);
}

/** reads one catalog file, detecting JSON vs FTL; returns { catalog, format, typography } */
async function loadCatalogFile(path) {
	const text = await readFile(path, 'utf8');
	if (!path.toLowerCase().endsWith('.ftl')) {
		try {
			const data = JSON.parse(text);
			if (data && typeof data === 'object' && data.messages && typeof data.messages === 'object') {
				return {
					catalog: {
						locale: typeof data.locale === 'string' ? data.locale : guessLocale(path),
						direction: data.direction === 'rtl' ? 'rtl' : 'ltr',
						messages: data.messages,
						...(data.typography === false ? { typography: false } : {}),
					},
					format: 'json',
					typography: data.typography,
				};
			}
		} catch {
			// not JSON - fall through to the FTL attempt below
		}
	}
	if (path.toLowerCase().endsWith('.ftl') || isProbablyFTL(text)) {
		return { catalog: parseFTL(guessLocale(path), text), format: 'ftl', typography: undefined };
	}
	throw new Error(`${path}: neither a JSON catalog ({ locale, direction, messages }) nor FTL`);
}

function toJSONValue(value, flattened) {
	if (typeof value === 'string') return value;
	if (value !== null && typeof value === 'object' && 'format' in value) {
		flattened.push(true);
		return messageText(value);
	}
	return value;
}

function serializeTarget(targetPath, catalog) {
	if (targetPath.toLowerCase().endsWith('.ftl')) {
		const lines = [`# generated by mwg/tools/i18n-edit, do not edit by hand unless flattened plurals are acceptable`];
		let flattened = 0;
		for (const key of Object.keys(catalog.messages).sort()) {
			const value = catalog.messages[key];
			if (typeof value === 'string') {
				lines.push(`${key} = ${value}`);
			} else {
				flattened++;
				lines.push(`${key} = ${messageText(value)}`);
			}
		}
		return { text: lines.join('\n') + '\n', flattened };
	}
	const flattened = [];
	const messages = {};
	for (const key of Object.keys(catalog.messages).sort()) {
		messages[key] = toJSONValue(catalog.messages[key], flattened);
	}
	const data = { locale: catalog.locale, direction: catalog.direction, messages };
	if (catalog.typography === false) data.typography = false;
	return { text: JSON.stringify(data, null, 2) + '\n', flattened: flattened.length };
}

/** non-interactive report for CI; returns an exit code */
function runCheck(session, basePath, targetPath, assetsDir) {
	const rows = sessionRows(session);
	const missing = rows.filter((row) => row.status === 'missing').map((row) => row.key);
	const extra = rows.filter((row) => row.status === 'extra').map((row) => row.key);
	//audio entries are reported by validateMessageAudio below, not here
	const issues = validateCatalog(session.target).filter((issue) => !isAudioKey(issue.key));
	const audioIssues = [...validateMessageAudio(session.base), ...validateMessageAudio(session.target)];
	const completeness = sessionCompleteness(session);
	const root = assetsDir ? resolve(assetsDir) : process.cwd();
	const missingFiles = [];
	const placeholderProblems = [];
	for (const row of rows) {
		if (row.sound && row.soundKey && !isRemotePath(row.sound) && !existsSync(resolve(root, row.sound))) {
			missingFiles.push(`${row.soundKey} -> ${row.sound}`);
		}
		const summary = placeholderSummary(row.baseText, row.targetText);
		if (summary) placeholderProblems.push(`${row.key}: ${summary}`);
	}

	console.log(`base:   ${basePath} (${session.base.locale})`);
	console.log(`target: ${targetPath} (${session.target.locale})`);
	console.log(`keys: ${rows.length}, completeness: ${(completeness * 100).toFixed(1)}%`);
	for (const key of missing) console.log(`missing: ${key}`);
	for (const key of extra) console.log(`extra:   ${key}`);
	for (const issue of issues) console.log(`issue:   ${issue.key} [${issue.kind}] ${issue.detail}`);
	for (const issue of audioIssues) console.log(`audio:   ${issue.key} [${issue.kind}] ${issue.detail}`);
	for (const entry of placeholderProblems) console.log(`placeholders: ${entry}`);
	for (const entry of missingFiles) console.log(`cue file not found: ${entry}`);

	const failed = missing.length > 0 || issues.length > 0 || audioIssues.length > 0 || placeholderProblems.length > 0;
	return failed ? 1 : 0;
}

function isRemotePath(path) {
	return /^(data:|https?:)/i.test(path);
}

// ---------------------------------------------------------------- TUI

function truncate(text, width) {
	const clean = text.replace(/\s+/g, ' ');
	if (clean.length <= width) return clean;
	return clean.slice(0, Math.max(0, width - 1)) + '…';
}

const ANSI_BOLD = '\x1b[1m';
const ANSI_BOLD_OFF = '\x1b[22m';
const ANSI_ITALIC = '\x1b[3m';
const ANSI_ITALIC_OFF = '\x1b[23m';

/** styled spans to terminal escapes: bold as bold, italic as italic, markers consumed */
export function spansToAnsi(spans) {
	return spans
		.map((span) => {
			let text = span.text;
			if (span.italic) text = `${ANSI_ITALIC}${text}${ANSI_ITALIC_OFF}`;
			if (span.bold) text = `${ANSI_BOLD}${text}${ANSI_BOLD_OFF}`;
			return text;
		})
		.join('');
}

function visibleLength(ansi) {
	return ansi.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Cuts styled text to a visible width, counting characters on screen rather than escape
 * codes. A cut inside a styled run closes bold/italic afterwards, so no styling leaks
 * into the next column (the closers touch only those two attributes, never the row's
 * own reverse-video highlight).
 */
export function truncateAnsi(ansi, width) {
	let out = '';
	let visible = 0;
	let cut = false;
	const token = /(\x1b\[[0-9;]*m)|([^\x1b]+)/g;
	let match;
	while ((match = token.exec(ansi)) !== null && visible < width) {
		if (match[1]) {
			out += match[1];
			continue;
		}
		const take = Math.min(match[2].length, width - visible);
		out += match[2].slice(0, take);
		visible += take;
		if (take < match[2].length) cut = true;
	}
	if (cut) out += `${ANSI_BOLD_OFF}${ANSI_ITALIC_OFF}`;
	return out;
}

function padAnsi(ansi, width) {
	const missing = width - visibleLength(ansi);
	return missing > 0 ? ansi + ' '.repeat(missing) : ansi;
}

/** one-line summary of a row's placeholder drift, or '' when base and target agree */
export function placeholderSummary(baseText, targetText) {
	if (!baseText || !targetText) return '';
	const diff = diffPlaceholders(baseText, targetText);
	const parts = [];
	for (const token of diff.missing) parts.push(`missing {${token}}`);
	for (const token of diff.extra) parts.push(`extra {${token}}`);
	for (const { token, base, target } of diff.changed) {
		parts.push(`{${token}}: '${base || '(plain)'}' vs '${target || '(plain)'}'`);
	}
	return parts.join(', ');
}

/** placeholder tokens a translation must supply, for the edit prompt */
export function expectedPlaceholders(baseText) {
	return tokenizeMessage(baseText)
		.filter((part) => typeof part !== 'string')
		.map((part) => `{${part.token}${part.debug ? '=' : ''}${part.conv ? `!${part.conv}` : ''}${part.spec === undefined ? '' : `:${part.spec}`}}`)
		.join(' ');
}

const execFileAsync = promisify(execFile);

/**
 * How to play one cue file, ordered by preference. A dependency-free tool cannot bundle
 * audio playback, so it delegates to whatever the OS already has: `afplay` on macOS,
 * `SoundPlayer` (WAV only) on Windows, and format-capable `aplay`/`paplay` before the
 * general `ffplay` on everything else. `MWG_SFX_PLAYER` replaces the whole list with one
 * command (the cue path is appended) when none of those fit. `platform` is injectable
 * so the selection itself is unit-testable without spawning anything.
 */
export function playerCandidates(cuePath, platform = process.platform) {
	if (process.env.MWG_SFX_PLAYER) return [{ cmd: process.env.MWG_SFX_PLAYER, args: [cuePath], shell: true }];
	if (platform === 'darwin') return [{ cmd: 'afplay', args: [cuePath] }];
	if (platform === 'win32') {
		return /\.wav$/i.test(cuePath)
			? [{ cmd: 'powershell', args: ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${cuePath.replace(/'/g, "''")}').PlaySync()`] }]
			: [];
	}
	const ffplay = { cmd: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet', cuePath] };
	if (/\.wav$/i.test(cuePath)) return [{ cmd: 'aplay', args: [cuePath] }, { cmd: 'paplay', args: [cuePath] }, ffplay];
	if (/\.mp3$/i.test(cuePath)) return [ffplay, { cmd: 'mpg123', args: ['-q', cuePath] }];
	return [{ cmd: 'paplay', args: [cuePath] }, ffplay];
}

/**
 * Runs the first candidate that exists, falling through only when the command itself
 * is missing (`ENOENT`) - a player that runs and rejects the file reports its own
 * error instead. Resolves with null on success, so the caller reports one outcome.
 */
async function playFirstAvailable(candidates) {
	let missing = null;
	for (const { cmd, args, shell } of candidates) {
		try {
			await execFileAsync(cmd, args, shell ? { shell: true } : {});
			return null;
		} catch (error) {
			if (error?.code === 'ENOENT') {
				missing = error;
				continue;
			}
			return error;
		}
	}
	return missing ?? new Error('no audio player found (set MWG_SFX_PLAYER to name one)');
}

export async function main(argv = process.argv.slice(2)) {
	const { basePath, targetPath, create, check, assetsDir } = parseArgs(argv);

	let baseFile;
	try {
		baseFile = await loadCatalogFile(basePath);
	} catch (error) {
		console.error(`i18n-edit: ${error.message}`);
		process.exit(1);
	}

	let targetFile = null;
	try {
		targetFile = await loadCatalogFile(targetPath);
	} catch (error) {
		if (!create || !/ENOENT/.test(error.message)) {
			console.error(`i18n-edit: ${error.message}${!create ? ' (pass --create to start a new target)' : ''}`);
			process.exit(1);
		}
	}

	let session = targetFile
		? createEditSession(baseFile.catalog, targetFile.catalog)
		: createEditSession(baseFile.catalog, { locale: guessLocale(targetPath), direction: guessDirection(guessLocale(targetPath)), messages: {} });
	const targetIsNew = !targetFile;

	if (check) {
		process.exit(runCheck(session, basePath, targetPath, assetsDir));
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		console.error('i18n-edit: the editor needs a terminal; use --check for piped output');
		process.exit(2);
	}

	const editor = createEditor({ session, basePath, targetPath, targetIsNew, assetsDir });
	await editor.run();
}

function createEditor({ session, basePath, targetPath, targetIsNew, assetsDir }) {
	let index = 0;
	let scroll = 0;
	let missingOnly = false;
	let query = '';
	let dirty = targetIsNew;
	let status = '';
	let showHelp = false;
	let quit = false;
	let prompting = false;
	let renderMd = true;

	const rows = () => sessionRows(session, { missingOnly, query });

	function renderCell(raw, width) {
		const flat = raw.replace(/\s+/g, ' ');
		if (!renderMd) return truncate(flat, width).padEnd(width);
		return padAnsi(truncateAnsi(spansToAnsi(parseMarkdown(flat)), width), width);
	}

	function clamp() {
		const list = rows();
		index = Math.max(0, Math.min(index, Math.max(0, list.length - 1)));
	}

	function draw() {
		const width = process.stdout.columns || 100;
		const height = process.stdout.rows || 30;
		const list = rows();
		clamp();
		const bodyHeight = height - 5;
		if (index < scroll) scroll = index;
		if (index >= scroll + bodyHeight) scroll = index - bodyHeight + 1;

		const completeness = (sessionCompleteness(session) * 100).toFixed(1);
		const keyW = Math.min(28, Math.max(12, Math.floor(width * 0.22)));
		const rest = width - keyW - 4;
		const baseW = Math.floor(rest / 2);
		const targetW = rest - baseW;

		let out = ANSI.hideCursor;
		out += `${ANSI.cyan}${truncate(`${basename(basePath)} (${session.base.locale})`, keyW + baseW)}${ANSI.reset} `;
		out += `${ANSI.green}${truncate(`-> ${basename(targetPath)} (${session.target.locale})  ${completeness}%${dirty ? ' [+]' : ''}`, targetW)}${ANSI.reset}\n`;
		out += `${ANSI.dim}${'key'.padEnd(keyW)}  ${'base'.padEnd(baseW)}  target${missingOnly ? ' [missing-only]' : ''}${query ? ` [/${query}]` : ''}${ANSI.reset}\n`;

		for (let i = scroll; i < Math.min(list.length, scroll + bodyHeight); i++) {
			const row = list[i];
			const marker = row.status === 'missing' ? ANSI.red + '!' : row.status === 'extra' ? ANSI.yellow + '+' : ' ';
			const soundMark = row.sound ? (row.soundInherited ? `${ANSI.dim}~` : `${ANSI.cyan}*`) : ' ';
			const phMark = placeholderSummary(row.baseText, row.targetText) ? `${ANSI.yellow}≠` : ' ';
			const targetCell = row.targetText === '' ? `${ANSI.dim}<missing>` : renderCell(row.targetText, targetW);
			const line =
				`${marker}${soundMark}${phMark}${ANSI.reset} ` +
				`${truncate(row.key, keyW - 4).padEnd(keyW - 4)}  ` +
				`${renderCell(row.baseText, baseW)}  ` +
				`${targetCell}`;
			out += (i === index ? ANSI.reverse + line + ANSI.reset : line) + '\n';
		}
		const selected = list[index];
		const soundLine = selected?.sound
			? `cue ${selected.soundKey}: ${selected.sound}${selected.soundInherited ? ' (from base)' : ''}`
			: 'no cue (s to set)';
		const phLine = selected ? placeholderSummary(selected.baseText, selected.targetText) : '';
		const infoLine = status || (phLine ? `placeholders differ: ${phLine}` : soundLine);
		out += `\n${ANSI.dim}${truncate(infoLine, width)}${ANSI.reset}\n`;
		out += `${ANSI.dim}j/k move  Enter edit  s cue  r copy  x swap  m missing  / find  v render  w save  q quit  ? help${ANSI.reset}`;

		if (showHelp) {
			out += `\n${ANSI.reverse} ${'i18n-edit help (any key closes)'.padEnd(width - 2)} ${ANSI.reset}\n`;
			for (const line of [
				'j/k, Up/Down  move between keys        g/G        first/last key',
				'Enter/e       edit target text         s          set/clear <key>.audio cue',
				'Ctrl+P        preview the row cue      r          copy base text over',
				'd             delete a target-only key',
				'x             swap reference/target    v          toggle markdown preview',
				'm             missing-only filter      /          search, Esc clears',
				'w             save target file         q          quit (asks when unsaved)',
				'* means the key has its own cue, ~ means it inherits the base cue,',
				'≠ marks a placeholder mismatch against the reference text.',
			]) {
				out += truncate(line, width) + '\n';
			}
		}

		process.stdout.write('\x1b[H\x1b[2J' + out);
	}

	function prompt(question, initial = '') {
		prompting = true;
		return new Promise((resolvePromise) => {
			process.stdin.setRawMode(false);
			process.stdout.write(`${ANSI.showCursor}\n${question}`);
			if (initial) process.stdout.write(`${ANSI.dim}[${truncate(initial, 60)}]${ANSI.reset}`);
			process.stdout.write('\n> ');
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
			rl.question('', (answer) => {
				rl.close();
				process.stdin.setRawMode(true);
				prompting = false;
				resolvePromise(answer);
			});
		});
	}

	async function save() {
		const { text, flattened } = serializeTarget(targetPath, session.target);
		await writeFile(targetPath, text, 'utf8');
		dirty = false;
		status = flattened > 0 ? `saved ${targetPath} (warning: ${flattened} select/plural flattened)` : `saved ${targetPath}`;
	}

	function checkCueFile(path) {
		if (path === '' || isRemotePath(path)) return '';
		const root = assetsDir ? resolve(assetsDir) : process.cwd();
		return existsSync(resolve(root, path)) ? '' : ` (file not found under ${root})`;
	}

	function previewCue(displayName, absolutePath) {
		status = `playing ${displayName} ...`;
		playFirstAvailable(playerCandidates(absolutePath)).then((error) => {
			if (quit) return;
			status = error ? `could not play: ${String(error?.message ?? error).split('\n')[0]}` : `played ${displayName}`;
			draw();
		});
	}

	async function run() {
		process.stdout.write(ANSI.altOn);
		const restore = () => {
			process.stdout.write(ANSI.altOff + ANSI.showCursor);
		};
		process.on('SIGINT', () => {
			restore();
			process.exit(130);
		});
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		process.stdin.resume();
		draw();

		const onResize = () => {
			if (!prompting) draw();
		};
		process.stdout.on('resize', onResize);

		const done = new Promise((resolvePromise) => {
			const keyHandler = async (str, key) => {
				if (prompting) return;
				try {
					if (showHelp) {
						showHelp = false;
						draw();
						return;
					}
					const list = rows();
					const selected = list[index];
					switch (key.name) {
						case 'up':
							index = Math.max(0, index - 1);
							break;
						case 'k':
							if (key.ctrl || key.meta) return;
							index = Math.max(0, index - 1);
							break;
						case 'down':
							index = Math.min(Math.max(0, list.length - 1), index + 1);
							break;
						case 'j':
							if (key.ctrl || key.meta) return;
							index = Math.min(Math.max(0, list.length - 1), index + 1);
							break;
						case 'pageup':
							index = Math.max(0, index - 10);
							break;
						case 'pagedown':
							index = Math.min(Math.max(0, list.length - 1), index + 10);
							break;
						case 'g':
							index = key.shift ? Math.max(0, list.length - 1) : 0;
							break;
						case 'return':
						case 'e':
							if (selected) {
								const needed = expectedPlaceholders(selected.baseText);
								const answer = await prompt(
									`edit [${selected.key}]${needed ? ` (needs ${needed})` : ''} (empty cancels)`,
									selected.targetText || selected.baseText,
								);
								if (answer !== '') {
									session = setTargetText(session, selected.key, answer);
									dirty = true;
									status = `updated ${selected.key}`;
								}
							}
							break;
						case 's':
							if (selected) {
								const audioKey = cueKeyFor(session, selected.key);
								const current = session.target.messages[audioKey];
								const own = typeof current === 'string' ? current : '';
								const answer = (await prompt(`cue path for [${selected.key}] -> ${audioKey} (empty clears)`, own || selected.sound || '')).trim();
								if (answer !== '' || own !== '') {
									session = setTargetSound(session, selected.key, answer);
									dirty = true;
									status = answer === '' ? `cleared cue ${audioKey}` : `cue ${audioKey} = ${answer}${checkCueFile(answer)}`;
								}
							}
							break;
						case 'p':
							//plain `p` is deliberately unbound: previews start audio out of nowhere,
							//so the chord is the only way to ask for one
							if ((key.ctrl || key.meta) && selected) {
								if (!selected.sound) {
									status = 'no cue on this key (s to set)';
								} else if (isRemotePath(selected.sound)) {
									status = 'remote cues cannot be previewed';
								} else {
									const root = assetsDir ? resolve(assetsDir) : process.cwd();
									const absolute = resolve(root, selected.sound);
									if (!existsSync(absolute)) {
										status = `cue file not found: ${selected.sound}`;
									} else {
										previewCue(selected.sound, absolute);
									}
								}
							}
							break;
						case 'r':
							if (selected && selected.status === 'missing') {
								session = copyFromBase(session, selected.key);
								dirty = true;
								status = `copied base text for ${selected.key}`;
							} else {
								status = 'r copies only keys missing from the target';
							}
							break;
						case 'd':
							if (selected && selected.status === 'extra') {
								session = deleteTargetKey(session, selected.key);
								dirty = true;
								status = `deleted extra key ${selected.key}`;
							} else {
								status = 'd deletes only keys absent from the base';
							}
							break;
						case 'x':
							session = swapSession(session);
							index = 0;
							scroll = 0;
							status = `swapped: ${session.base.locale} is now the reference`;
							break;
						case 'v':
							renderMd = !renderMd;
							status = renderMd ? 'markdown preview on' : 'raw markdown source';
							break;
						case 'm':
							missingOnly = !missingOnly;
							index = 0;
							scroll = 0;
							break;
						case 'w':
							await save();
							break;
						case 'q':
							if (dirty) {
								const answer = await prompt('unsaved changes - quit anyway? (y/N)');
								if (!/^y(es)?$/i.test(answer.trim())) break;
							}
							quit = true;
							break;
						case '?':
							showHelp = true;
							break;
						case '/': {
							const answer = await prompt('search (empty clears)');
							query = answer.trim();
							index = 0;
							scroll = 0;
							break;
						}
						case 'escape':
							if (query !== '') {
								query = '';
								index = 0;
								scroll = 0;
							}
							break;
						default:
							if (str === '?') showHelp = true;
							break;
					}
				} finally {
					draw();
					if (quit) {
						process.stdin.removeListener('keypress', keyHandler);
						process.stdout.removeListener('resize', onResize);
						resolvePromise();
					}
				}
			};
			process.stdin.on('keypress', keyHandler);
		});

		await done;
		process.stdin.setRawMode(false);
		process.stdin.pause();
		restore();
		console.log(dirty ? 'quit with unsaved changes.' : 'done.');
	}

	return { run };
}

const isMain = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));
if (isMain) {
	main().catch((error) => {
		console.error(`i18n-edit: ${error?.stack ?? error}`);
		process.exit(1);
	});
}

export { dirname, loadCatalogFile, serializeTarget };
