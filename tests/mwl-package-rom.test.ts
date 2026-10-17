import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	detectRomImage,
	encodePackage,
	registerRomDigest,
	sha256Hex,
	verifyPackage,
	checkConditionSyntax,
	evaluateCondition,
} from '../src/mwl/index.ts';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

function noise(length: number, seed = 1): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let index = 0; index < length; index++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		out[index] = state >>> 24;
	}
	return out;
}

test('an exact ROM size with no recognised format is refused, with the way out', async () => {
	const refusal = await detectRomImage(noise(65536), 'media/bank.bin');
	assert.equal(refusal?.reason, 'size');
	assert.match(refusal?.message ?? '', /"media\/bank.bin" looks like an instrument ROM image/);
	assert.match(refusal?.message ?? '', /supply the patches as a \.syx file instead/);
	for (const size of [8192, 131072, 524288, 2097152])
		assert.equal((await detectRomImage(noise(size, size)))?.reason, 'size');
});

test('sizes that are not ROM sizes, recognised formats and text are left alone', async () => {
	assert.equal(await detectRomImage(noise(65535)), null);
	assert.equal(await detectRomImage(noise(70000)), null);
	const png = noise(65536);
	png.set([0x89, 0x50, 0x4e, 0x47]);
	assert.equal(await detectRomImage(png, 'a.png'), null);
	const midi = noise(32768);
	midi.set(text('MThd'));
	assert.equal(await detectRomImage(midi), null);
	const syx = noise(16384);
	syx[0] = 0xf0;
	syx[syx.length - 1] = 0xf7;
	assert.equal(await detectRomImage(syx, 'patches.syx'), null, 'a SysEx dump is what a package should carry');
	assert.equal(await detectRomImage(text('{ "a": 1 }'.padEnd(65536, ' ')), 'data.json'), null);
});

test('a .rom extension and a registered digest are refused whatever the bytes are', async () => {
	assert.equal((await detectRomImage(text('tiny'), 'D50.ROM'))?.reason, 'extension');
	const secret = noise(1234, 99);
	assert.equal(await detectRomImage(secret, 'x.dat'), null);
	registerRomDigest((await sha256Hex(secret)).toUpperCase(), 'Example PCM ROM');
	const hit = await detectRomImage(secret, 'x.dat');
	assert.equal(hit?.reason, 'digest');
	assert.equal(hit?.label, 'Example PCM ROM');
	assert.throws(() => registerRomDigest('abc', 'bad'), /64 hexadecimal/);
});

test('verify refuses a package that carries a ROM image', async () => {
	const source =
		"[{ tag: 'package', id: 'p', version: '1.0.0' }, { tag: 'asset', id: 'rom', kind: 'data', path: 'bank.bin' }]";
	const bytes = await encodePackage([
		{ path: 'content.mwl', data: text(source) },
		{ path: 'bank.bin', data: noise(65536, 5) },
	]);
	const report = await verifyPackage(bytes);
	assert.equal(report.ok, false);
	assert.match(report.errors.join(), /instrument ROM image/);
});

test('conditions: both sides of and/or are always read, and a syntax check does not evaluate', () => {
	assert.equal(evaluateCondition('true or false', {}), true);
	assert.equal(evaluateCondition('false and true', {}), false);
	assert.equal(evaluateCondition('a or b and not c', { a: false, b: true, c: false }), true);
	assert.deepEqual(checkConditionSyntax('hp > 0 and (mp / 2 >= cost or rage) where cost = base + 1'), [
		'base',
		'hp',
		'mp',
		'rage',
	]);
	assert.throws(() => checkConditionSyntax('hp >'), /incomplete/);
	assert.throws(() => checkConditionSyntax('hp > 0 )'), /unexpected token/);
	assert.throws(() => checkConditionSyntax(''), /incomplete/);
});

// The command line runs from dist, so it is exercised only once a build has put the package code
// there (CI builds before it tests; `npm run build:pkg` does it locally).
const built = existsSync(new URL('../dist/mwl/package.js', import.meta.url));
const tool = new URL('../tools/mwl.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function mwl(...args: string[]): { status: number | null; stdout: string; stderr: string } {
	const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('mwl pack, verify, unpack and build work on a folder and a package', { skip: !built }, () => {
	const root = mkdtempSync(join(tmpdir(), 'mwp-'));
	try {
		const dir = join(root, 'marta');
		mkdirSync(join(dir, 'media'), { recursive: true });
		writeFileSync(
			join(dir, 'content.mwl'),
			`[
	{ tag: 'package', id: 'marta', version: '1.0.0', author: 'Ada', license: 'MIT' },
	{ tag: 'asset', id: 'portrait', kind: 'image', path: 'media/portrait.png', license: 'CC0-1.0', source: 'own work' },
	{ tag: 'character', id: 'marta', name: _('Marta'), portrait: 'portrait', hitpoints: 20 },
]`,
		);
		const png = Buffer.alloc(33);
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(png);
		png.writeUInt32BE(8, 16);
		png.writeUInt32BE(8, 20);
		writeFileSync(join(dir, 'media', 'portrait.png'), png);

		const file = join(root, 'marta.mwp');
		const packed = mwl('pack', dir, '-o', file);
		assert.equal(packed.status, 0, packed.stderr);
		assert.ok(statSync(file).size > 0);
		const verified = mwl('verify', file, '--allow', 'audio');
		assert.equal(verified.status, 0, verified.stderr);
		assert.match(verified.stdout, /valid package marta@1\.0\.0#/);
		assert.equal(JSON.parse(mwl('verify', file, '--json').stdout).ok, true);

		const out = join(root, 'out');
		assert.equal(mwl('unpack', file, '-o', out).status, 0);
		assert.deepEqual(readFileSync(join(out, 'media', 'portrait.png')), png);
		assert.equal(mwl('build', file, '-o', join(root, 'gen')).status, 0);
		assert.match(readFileSync(join(root, 'gen', 'game-data.ts'), 'utf8'), /marta:marta/);
		assert.deepEqual(JSON.parse(readFileSync(join(root, 'gen', 'i18n.json'), 'utf8')).messages, { Marta: 'Marta' });
		assert.match(readFileSync(join(root, 'gen', 'CREDITS.txt'), 'utf8'), /License: CC0-1.0/);
		assert.match(readFileSync(join(root, 'gen', 'assets.json'), 'utf8'), /marta\/media\/portrait.png/);

		// tampering is caught by verify, and a ROM is refused at pack time
		const bytes = Buffer.from(readFileSync(file));
		bytes[bytes.length - 3] ^= 0xff;
		writeFileSync(join(root, 'bad.mwp'), bytes);
		assert.equal(mwl('verify', join(root, 'bad.mwp')).status, 1);
		writeFileSync(join(dir, 'bank.bin'), noise(65536, 8));
		const refused = mwl('pack', dir, '-o', join(root, 'rom.mwp'));
		assert.equal(refused.status, 1);
		assert.match(refused.stderr, /instrument ROM image/);
		assert.equal(existsSync(join(root, 'rom.mwp')), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
