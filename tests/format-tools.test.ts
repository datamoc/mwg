import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { entryPath } from '../tools/extract-rgssad.mjs';
import { writePlaceholderAssets } from '../tools/make-example-assets.mjs';

test('an rgssad entry name cannot escape the output folder', () => {
	const out = resolve('/tmp/extract-here');
	assert.equal(entryPath(out, 'Data\\Map001.rxdata'), join(out, 'Data', 'Map001.rxdata'));
	assert.equal(entryPath(out, 'Graphics/Titles/title.png'), join(out, 'Graphics', 'Titles', 'title.png'));
	for (const hostile of ['..\\..\\etc\\passwd', '../outside.txt', 'Data/../../outside', '/etc/passwd'])
		assert.throws(() => entryPath(out, hostile), /would be written outside/, hostile);
	assert.throws(
		() => entryPath(out, `..${sep}extract-here-sibling${sep}x`),
		/outside/,
		'a sibling sharing the prefix',
	);
});

test('writePlaceholderAssets writes the set and will not overwrite it without force', async () => {
	const out = mkdtempSync(join(tmpdir(), 'mwg-placeholder-'));
	try {
		await writePlaceholderAssets(out);
		const files = readdirSync(out);
		for (const expected of ['tiles.png', 'tiles.json', 'backdrop_room.png', 'icon_gem.svg'])
			assert.ok(files.includes(expected));
		await assert.rejects(() => writePlaceholderAssets(out), /already holds tiles\.png/);
		await writePlaceholderAssets(out, { force: true });
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
});

/** a minimal RGSSAD v1 writer (the XOR key stream of the format), so extraction is tested end to end */
function rgssad(entries: Array<[string, string]>): Buffer {
	const next = (key: number) => (Math.imul(key, 7) + 3) >>> 0;
	const out: number[] = [...Buffer.from('RGSSAD\0'), 1];
	let key = 0xdeadcafe;
	const u32 = (value: number) => {
		const bytes = Buffer.alloc(4);
		bytes.writeUInt32LE(value >>> 0);
		out.push(...bytes);
	};
	for (const [name, text] of entries) {
		const nameBytes = Buffer.from(name, 'latin1');
		const data = Buffer.from(text);
		u32(nameBytes.length ^ key);
		key = next(key);
		for (const byte of nameBytes) {
			out.push(byte ^ (key & 0xff));
			key = next(key);
		}
		u32(data.length ^ key);
		key = next(key);
		let dataKey = key;
		const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
		data.copy(padded);
		for (let i = 0; i < padded.length; i += 4) {
			padded.writeUInt32LE((padded.readUInt32LE(i) ^ dataKey) >>> 0, i);
			dataKey = next(dataKey);
		}
		out.push(...padded.subarray(0, data.length));
	}
	return Buffer.from(out);
}

test('extractRgssad writes an archive out and refuses an entry that escapes the folder', async () => {
	const { extractRgssad } = await import('../tools/extract-rgssad.mjs');
	const { writeFileSync, readFileSync, existsSync } = await import('node:fs');
	const dir = mkdtempSync(join(tmpdir(), 'mwg-rgssad-'));
	try {
		writeFileSync(
			join(dir, 'game.rgssad'),
			rgssad([
				['Data\\Map001.rxdata', 'the map'],
				['Graphics\\a.txt', 'x'],
			]),
		);
		assert.equal(await extractRgssad(join(dir, 'game.rgssad'), join(dir, 'out')), 2);
		assert.equal(readFileSync(join(dir, 'out', 'Data', 'Map001.rxdata'), 'utf8'), 'the map');
		writeFileSync(join(dir, 'hostile.rgssad'), rgssad([['../escaped.txt', 'x']]));
		await assert.rejects(() => extractRgssad(join(dir, 'hostile.rgssad'), join(dir, 'out2')), /outside/);
		assert.equal(existsSync(join(dir, 'escaped.txt')), false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
