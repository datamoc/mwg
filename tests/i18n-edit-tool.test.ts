import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseMarkdown } from '../src/two-d/ui/markdown.ts';
import { loadCatalogFile, serializeTarget, spansToAnsi, truncateAnsi, placeholderSummary, expectedPlaceholders, playerCandidates } from '../tools/i18n-edit.mjs';

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'mwg-i18n-edit-'));
	try {
		await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('a JSON catalog loads with locale, direction, messages and typography intact', async () => {
	await withTmpDir(async (dir) => {
		const path = join(dir, 'fr.json');
		await writeFile(
			path,
			JSON.stringify({
				locale: 'fr',
				direction: 'ltr',
				typography: false,
				messages: { greeting: 'Bonjour !', gems: { one: 'une gemme', other: 'des gemmes' } },
			}),
		);
		const { catalog, format } = await loadCatalogFile(path);
		assert.equal(format, 'json');
		assert.equal(catalog.locale, 'fr');
		assert.equal(catalog.typography, false);
		assert.deepEqual(catalog.messages.gems, { one: 'une gemme', other: 'des gemmes' });
	});
});

test('an FTL file loads by extension, and JSON-looking text wins over content sniffing', async () => {
	await withTmpDir(async (dir) => {
		const ftl = join(dir, 'de.ftl');
		await writeFile(ftl, 'greeting = Hallo, { $name }!\n');
		const loaded = await loadCatalogFile(ftl);
		assert.equal(loaded.format, 'ftl');
		assert.equal(loaded.catalog.locale, 'de');
		assert.equal(typeof loaded.catalog.messages.greeting, 'string');

		const json = join(dir, 'en.txt');
		await writeFile(json, JSON.stringify({ locale: 'en', direction: 'ltr', messages: { greeting: 'Hi' } }));
		assert.equal((await loadCatalogFile(json)).format, 'json');
	});
});

test('a file that is neither JSON nor FTL throws a readable error', async () => {
	await withTmpDir(async (dir) => {
		const path = join(dir, 'notes.txt');
		await writeFile(path, 'just some prose, no equals sign at line start\n');
		await assert.rejects(loadCatalogFile(path), /neither a JSON catalog/);
	});
});

test('a JSON target saves sorted keys with a trailing newline, preserving plurals', () => {
	const { text, flattened } = serializeTarget('fr.json', {
		locale: 'fr',
		direction: 'ltr',
		messages: { greeting: 'Bonjour !', gems: { one: 'une gemme', other: 'des gemmes' }, farewell: 'Au revoir.' },
	});
	assert.equal(flattened, 0);
	assert.ok(text.endsWith('\n'));
	const parsed = JSON.parse(text);
	assert.deepEqual(Object.keys(parsed.messages), ['farewell', 'gems', 'greeting']);
	assert.deepEqual(parsed.messages.gems, { one: 'une gemme', other: 'des gemmes' });
});

test('spansToAnsi wraps bold and italic runs in terminal escapes', () => {
	const ansi = spansToAnsi(parseMarkdown('Take **two** *small* coins'));
	assert.ok(ansi.includes('\x1b[1mtwo\x1b[22m'));
	assert.ok(ansi.includes('\x1b[3msmall\x1b[23m'));
	assert.ok(ansi.startsWith('Take ') && ansi.endsWith(' coins'));
});

test('truncateAnsi cuts by visible width and closes styles left open', () => {
	const ansi = spansToAnsi(parseMarkdown('Take **two** coins'));
	const cut = truncateAnsi(ansi, 7);
	assert.equal(cut.replace(/\x1b\[[0-9;]*m/g, ''), 'Take tw');
	assert.ok(cut.endsWith('\x1b[22m\x1b[23m'));
	assert.equal(truncateAnsi('plain', 10), 'plain');
});

test('placeholderSummary reports drift, expectedPlaceholders lists needs', () => {
	assert.equal(placeholderSummary('Hit for {dmg:03d}!', 'Touché !'), 'missing {dmg}');
	assert.equal(placeholderSummary('Hit for {dmg:03d}!', 'Touché pour {dmg} !'), "{dmg}: ':03d' vs '(plain)'");
	assert.equal(placeholderSummary('Same {x}.', 'Same {x}.'), '');
	assert.equal(placeholderSummary('Has {x}.', ''), '');
	assert.equal(expectedPlaceholders('Hit for {dmg:03d} by {name}!'), '{dmg:03d} {name}');
	assert.equal(expectedPlaceholders('No tokens.'), '');
});

test('playerCandidates picks the OS player by extension, overridable by env', () => {
	assert.deepEqual(playerCandidates('sounds/hit.wav', 'darwin'), [{ cmd: 'afplay', args: ['sounds/hit.wav'] }]);
	assert.deepEqual(playerCandidates('sounds/hit.wav', 'linux').map((candidate) => candidate.cmd), ['aplay', 'paplay', 'ffplay']);
	assert.deepEqual(playerCandidates('music/theme.mp3', 'linux').map((candidate) => candidate.cmd), ['ffplay', 'mpg123']);
	assert.deepEqual(playerCandidates('sounds/hit.ogg', 'linux').map((candidate) => candidate.cmd), ['paplay', 'ffplay']);

	const wav = playerCandidates('sounds/hit.wav', 'win32');
	assert.equal(wav.length, 1);
	assert.equal(wav[0].cmd, 'powershell');
	assert.deepEqual(playerCandidates('music/theme.mp3', 'win32'), []);

	process.env.MWG_SFX_PLAYER = 'ffplay -nodisp -autoexit';
	try {
		assert.deepEqual(playerCandidates('sounds/hit.wav', 'win32'), [{ cmd: 'ffplay -nodisp -autoexit', args: ['sounds/hit.wav'], shell: true }]);
	} finally {
		delete process.env.MWG_SFX_PLAYER;
	}
});

test('an FTL target flattens select messages and reports how many', async () => {
	await withTmpDir(async (dir) => {
		const ftl = join(dir, 'en.ftl');
		await writeFile(ftl, 'greeting = Hello!\ncount = { $n ->\n   *[other] { $n } things\n}\n');
		const { catalog } = await loadCatalogFile(ftl);
		const { text, flattened } = serializeTarget(join(dir, 'out.ftl'), catalog);
		assert.equal(flattened, 1);
		assert.ok(text.includes('greeting = Hello!'));
	});
});
