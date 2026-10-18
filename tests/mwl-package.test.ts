import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { compile } from '../src/mwl/compiler.ts';
import { evaluateCondition } from '../src/mwl/conditions.ts';
import {
	checkPackagePolicy,
	compilePackages,
	decodePackage,
	DEFAULT_PACKAGE_LIMITS,
	encodePackage,
	generateCredits,
	loadPackage,
	mergePackage,
	PackageConflictError,
	packageContent,
	PackageFormatError,
	PackageIntegrityError,
	PackageLimitError,
	PackagePathError,
	packageRef,
	parsePackageDocument,
	parsePackageRef,
	satisfiesVersionRange,
	sha256Hex,
	verifyPackage,
	type PackageFile,
} from '../src/mwl/index.ts';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

/** deterministic incompressible bytes, so an entry is stored and one flipped bit leaves the stream valid */
function noise(length: number, seed = 1): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let index = 0; index < length; index++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		out[index] = state >>> 24;
	}
	return out;
}

function png(width: number, height: number): Uint8Array {
	const out = new Uint8Array(33);
	out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	const view = new DataView(out.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return out;
}

function wav(seconds: number): Uint8Array {
	const rate = 8000;
	const data = rate * seconds;
	const out = new Uint8Array(44 + data);
	const view = new DataView(out.buffer);
	out.set(text('RIFF'), 0);
	view.setUint32(4, 36 + data, true);
	out.set(text('WAVEfmt '), 8);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate, true);
	view.setUint16(32, 1, true);
	view.setUint16(34, 8, true);
	out.set(text('data'), 36);
	view.setUint32(40, data, true);
	return out;
}

/** a container written by hand, to build what `encodePackage` would never emit */
function rawPackage(
	entries: { path: string; size: number; packed: Uint8Array; sha256: string }[],
	main = 'content.mwl',
): Uint8Array {
	let offset = 0;
	const directory = deflateRawSync(
		Buffer.from(
			JSON.stringify({
				entries: entries.map((entry) => {
					const item = {
						path: entry.path,
						size: entry.size,
						packed: entry.packed.length,
						offset,
						sha256: entry.sha256,
					};
					offset += entry.packed.length;
					return item;
				}),
				main,
			}),
		),
	);
	const out = new Uint8Array(8 + directory.length + offset);
	out.set(text('MWP1'), 0);
	new DataView(out.buffer).setUint32(4, directory.length, true);
	out.set(directory, 8);
	let at = 8 + directory.length;
	for (const entry of entries) {
		out.set(entry.packed, at);
		at += entry.packed.length;
	}
	return out;
}

async function rawEntry(
	path: string,
	data: Uint8Array,
): Promise<{ path: string; size: number; packed: Uint8Array; sha256: string }> {
	return { path, size: data.length, packed: new Uint8Array(deflateRawSync(data)), sha256: await sha256Hex(data) };
}

const CHARACTER = `[
	{ tag: 'package', id: 'marta-the-ranger', version: '1.0.0', author: 'Ada', license: 'CC-BY-4.0',
	  requires: { mwg: '>=0.42', retroAudio: '>=0.1', capabilities: ['audio'] } },
	{ tag: 'asset', id: 'portrait', kind: 'image', path: 'media/portrait.png', license: 'CC0-1.0', source: 'https://example.org/p' },
	{ tag: 'asset', id: 'sheet', kind: 'image', path: 'media/sheet.png', license: 'CC0-1.0', source: 'own work' },
	{ tag: 'asset', id: 'theme', kind: 'music', path: 'media/theme.mid', license: 'CC0-1.0', source: 'own work' },
	{
		tag: 'character', id: 'marta', name: _("Marta"), portrait: 'portrait',
		sprite: { image: 'sheet', frame: [32, 48] },
		hitpoints: 28, movement: 5, attack: 7, defense: 3, theme: 'theme',
		animations: { idle: { frames: [0, 1, 2, 1], fps: 4, loop: true }, shoot: { frames: [8, 9], events: { '9': { sound: 'arrow' } } } },
		sounds: { hurt: 'ouch', arrow: 'arrow' },
		scripts: ['on-low-health'],
	},
	{ tag: 'sound_effect', id: 'arrow', chip: 'ym2149', priority: 5, voices: [{ channel: 'any', volume: { start: 15, step: -0.8 } }] },
	{ tag: 'sound_effect', id: 'ouch', chip: 'sn76489', priority: 6 },
	{ tag: 'music', id: 'main-theme', src: 'theme', loop: true },
	{ tag: 'script', id: 'on-low-health', on: 'damage', when: 'self.hp <= self.maxHp / 4',
	  do: [{ tag: 'play', sound: 'ouch' }, { tag: 'message', text: _("Marta grits her teeth.") }] },
]`;

const CHARACTER_FILES = (source = CHARACTER): PackageFile[] => [
	{ path: 'content.mwl', data: text(source) },
	{ path: 'media/portrait.png', data: png(32, 48) },
	{ path: 'media/sheet.png', data: png(256, 96) },
	{ path: 'media/theme.mid', data: noise(300, 7) },
];

const minimal = (id: string, version: string, extra = ''): string =>
	`[{ tag: 'package', id: '${id}', version: '${version}' }${extra ? `, ${extra}` : ''}]`;

async function packageOf(source: string, extra: PackageFile[] = []): Promise<Uint8Array> {
	return encodePackage([{ path: 'content.mwl', data: text(source) }, ...extra]);
}

test('a package round-trips and decodes in directory order', async () => {
	const bytes = await encodePackage(CHARACTER_FILES());
	const decoded = await decodePackage(bytes);
	assert.equal(decoded.main, 'content.mwl');
	assert.deepEqual(
		decoded.files.map((file) => file.path),
		['content.mwl', 'media/portrait.png', 'media/sheet.png', 'media/theme.mid'],
	);
	assert.deepEqual(decoded.files[3].data, noise(300, 7));
	assert.deepEqual(await encodePackage(CHARACTER_FILES()), bytes, 'encoding is deterministic');
});

test('a flipped byte, bad magic and truncation never return content', async () => {
	const bytes = await encodePackage([
		{ path: 'content.mwl', data: text(minimal('a', '1.0.0')) },
		{ path: 'blob.bin', data: noise(200, 3) },
	]);
	const tampered = Uint8Array.from(bytes);
	tampered[tampered.length - 5] ^= 0x01;
	await assert.rejects(decodePackage(tampered), PackageIntegrityError);
	await assert.rejects(
		decodePackage(Uint8Array.from(bytes, (byte, index) => (index === 0 ? 0x58 : byte))),
		PackageFormatError,
	);
	await assert.rejects(decodePackage(bytes.subarray(0, bytes.length - 20)), PackageFormatError);
	await assert.rejects(decodePackage(bytes.subarray(0, 6)), PackageFormatError);
});

test('a WAV header declaring a huge byte rate cannot shorten the measured duration', async () => {
	const lying = wav(3);
	new DataView(lying.buffer).setUint32(28, 8000 * 1000, true);
	const bytes = await encodePackage([
		{ path: 'content.mwl', data: text(minimal('a', '1.0.0')) },
		{ path: 'b.wav', data: lying },
	]);
	await assert.rejects(decodePackage(bytes, { maxAudioSeconds: 2 }), PackageLimitError);
});

test('a WAV header with a zero block align or sample rate is refused, not trusted', async () => {
	for (const offset of [24, 32]) {
		const broken = wav(3);
		new DataView(broken.buffer).setUint32(28, 8000 * 1000, true);
		if (offset === 24) new DataView(broken.buffer).setUint32(24, 0, true);
		else new DataView(broken.buffer).setUint16(32, 0, true);
		await assert.rejects(
			encodePackage([
				{ path: 'content.mwl', data: text(minimal('a', '1.0.0')) },
				{ path: 'b.wav', data: broken },
			]),
			PackageFormatError,
		);
	}
});

test('declared limits refuse on size, count, image dimensions and audio length', async () => {
	const bytes = await encodePackage([
		{ path: 'content.mwl', data: text(minimal('a', '1.0.0')) },
		{ path: 'a.png', data: png(100, 50) },
		{ path: 'b.wav', data: wav(3) },
	]);
	assert.equal((await decodePackage(bytes)).files.length, 3);
	await assert.rejects(decodePackage(bytes, { maxEntries: 2 }), PackageLimitError);
	await assert.rejects(decodePackage(bytes, { maxEntryBytes: 1000 }), PackageLimitError);
	await assert.rejects(decodePackage(bytes, { maxTotalBytes: 1000 }), PackageLimitError);
	await assert.rejects(decodePackage(bytes, { maxPackageBytes: 100 }), PackageLimitError);
	await assert.rejects(decodePackage(bytes, { maxImageWidth: 99 }), PackageLimitError);
	await assert.rejects(decodePackage(bytes, { maxAudioSeconds: 2 }), PackageLimitError);
	await assert.rejects(
		encodePackage([
			{ path: 'content.mwl', data: text('[]') },
			{ path: 'x.png', data: png(5000, 1) },
		]),
		PackageLimitError,
	);
	assert.ok(DEFAULT_PACKAGE_LIMITS.maxEntries > 0);
});

test('a zip bomb is stopped while inflating, not after', async () => {
	const bomb = new Uint8Array(20 * 1024 * 1024);
	const lie = await rawEntry('bomb.bin', new Uint8Array(1000));
	const packed = new Uint8Array(deflateRawSync(bomb));
	const bytes = rawPackage([await rawEntry('content.mwl', text('[]')), { ...lie, packed }]);
	await assert.rejects(decodePackage(bytes), PackageLimitError);
	// an entry that declares a size above the limit is refused before it is read at all
	const huge = rawPackage([await rawEntry('content.mwl', text('[]')), { ...lie, size: 10 ** 12 }]);
	await assert.rejects(decodePackage(huge), PackageLimitError);
});

test('path traversal, absolute paths and duplicates are refused on write and on read', async () => {
	for (const path of ['../x', 'a/../x', '/abs', 'C:/x', 'a\\b', 'a//b', './a', '']) {
		await assert.rejects(
			encodePackage([
				{ path: 'content.mwl', data: text('[]') },
				{ path, data: noise(4) },
			]),
			PackagePathError,
			path,
		);
	}
	await assert.rejects(
		encodePackage([
			{ path: 'content.mwl', data: text('[]') },
			{ path: 'A.txt', data: noise(4) },
			{ path: 'a.txt', data: noise(4) },
		]),
		PackagePathError,
	);
	const main = await rawEntry('content.mwl', text('[]'));
	await assert.rejects(decodePackage(rawPackage([main, await rawEntry('../escape', noise(4))])), PackagePathError);
	await assert.rejects(
		decodePackage(rawPackage([main, await rawEntry('dup', noise(4)), await rawEntry('dup', noise(4))])),
		PackagePathError,
	);
	await assert.rejects(decodePackage(rawPackage([main], 'missing.mwl')), PackageFormatError);
});

test('a package document parses the proposal example into typed data', () => {
	const document = parsePackageDocument(CHARACTER);
	assert.equal(document.meta.id, 'marta-the-ranger');
	assert.deepEqual(document.meta.requires, { mwg: '>=0.42', retroAudio: '>=0.1', capabilities: ['audio'] });
	assert.deepEqual(
		document.assets.map((asset) => asset.kind),
		['image', 'image', 'music'],
	);
	const [marta] = document.characters;
	assert.deepEqual(marta.stats, { hitpoints: 28, movement: 5, attack: 7, defense: 3 });
	assert.deepEqual(marta.animations, { idle: 'marta.idle', shoot: 'marta.shoot' });
	assert.deepEqual(document.animations.find((animation) => animation.id === 'marta.shoot')?.events, {
		9: { sound: 'arrow' },
	});
	assert.deepEqual(document.messages, ['Marta', 'Marta grits her teeth.']);
	assert.equal(document.scripts[0].do[0].tag, 'play');
	assert.equal(document.soundEffects[0].definition.chip, 'ym2149');
});

test('only package tags, safe actions and bounded conditions are accepted', () => {
	const head = "{ tag: 'package', id: 'p', version: '1.0.0' }";
	assert.throws(() => parsePackageDocument(`[${head}, { tag: 'unit_type', id: 'x' }]`), /not allowed in a package/);
	assert.throws(
		() => parsePackageDocument(`[{ tag: 'asset', id: 'a', kind: 'image', path: 'a.png' }]`),
		/needs a \[package\] tag/,
	);
	assert.throws(() => parsePackageDocument(`[${head}, ${head}]`), /second \[package\]/);
	const script = (body: string): string => `[${head}, { tag: 'script', id: 's', on: 'damage', ${body} }]`;
	assert.throws(() => parsePackageDocument(script("do: [{ tag: 'hook', name: 'ai:x' }]")), /not an allowed action/);
	assert.throws(() => parsePackageDocument(script("do: [{ tag: 'endlevel' }]")), /not an allowed action/);
	assert.throws(() => parsePackageDocument(script("when: 'hp <'")), /when/);
	assert.throws(() => parsePackageDocument(script(`when: '${'('.repeat(100)}1${')'.repeat(100)}'`)), /nested/);
	assert.throws(() => parsePackageDocument(script(`when: '${'1+'.repeat(2000)}1'`)), /longer than|tokens/);
	assert.throws(
		() => parsePackageDocument(`[${head}, { tag: 'asset', id: 'a', kind: 'video', path: 'a.avi' }]`),
		/kind must be/,
	);
	assert.throws(
		() => parsePackageDocument(`[${head}, { tag: 'asset', id: 'a', kind: 'image', path: '../a.png' }]`),
		PackagePathError,
	);
	assert.throws(
		() =>
			parsePackageDocument(`[${head}, { tag: 'music', id: 'm', src: 'a' }, { tag: 'music', id: 'm', src: 'a' }]`),
		/duplicate id/,
	);
	// the stack-safety bound is in the condition evaluator itself, not only in the package check
	assert.throws(() => evaluateCondition(`${'('.repeat(200)}1${')'.repeat(200)}`, {}), /nested/);
	assert.equal(evaluateCondition('self.hp <= self.maxHp / 4', { 'self.hp': 5, 'self.maxHp': 28 }), true);
});

test('an import of a file inside the package merges it under a prefix, to a bounded depth', () => {
	const files = { 'more.mwl': "[{ tag: 'sound_effect', id: 'beep', chip: 'ym2149' }]" };
	const document = parsePackageDocument(
		"[{ tag: 'package', id: 'p', version: '1.0.0' }, { tag: 'import', src: 'more.mwl', as: 'extra' }, { tag: 'import', package: 'base', version: '^1' }]",
		{ files },
	);
	assert.deepEqual(
		document.soundEffects.map((effect) => effect.id),
		['extra.beep'],
	);
	assert.deepEqual(
		document.imports.map((item) => item.package ?? item.src),
		['more.mwl', 'base'],
	);
	assert.throws(
		() =>
			parsePackageDocument("[{ tag: 'package', id: 'p', version: '1.0.0' }, { tag: 'import', src: 'x.mwl' }]", {
				files,
			}),
		/not in the package/,
	);
	const loop = { 'a.mwl': "[{ tag: 'import', src: 'a.mwl' }]" };
	assert.throws(
		() =>
			parsePackageDocument("[{ tag: 'package', id: 'p', version: '1.0.0' }, { tag: 'import', src: 'a.mwl' }]", {
				files: loop,
			}),
		/nested more than/,
	);
});

test('version ranges: exact, comparison, caret, tilde, partial and alternatives', () => {
	const cases: [string, string, boolean][] = [
		['0.43.0', '>=0.42', true],
		['0.41.9', '>=0.42', false],
		['0.43.0', '0.43.0', true],
		['0.43.1', '0.43.0', false],
		['0.43.1', '0.43', true],
		['0.43.0', '^0.43.0', true],
		['0.44.0', '^0.43.0', false],
		['1.4.0', '^1.2.3', true],
		['2.0.0', '^1.2.3', false],
		['0.0.4', '^0.0.3', false],
		['1.2.9', '~1.2.3', true],
		['1.3.0', '~1.2.3', false],
		['1.5.0', '>=1 <1.5', false],
		['1.4.9', '>=1 <1.5', true],
		['1.4.9', '> 1.4.9', false],
		['1.4.9', '<= 1.4.9', true],
		['3.0.0', '^1 || ^3', true],
		['2.0.0', '^1 || ^3', false],
		['9.9.9', '*', true],
		['0.43.0-rc.1', '>=0.43', true],
	];
	for (const [version, range, expected] of cases)
		assert.equal(satisfiesVersionRange(version, range), expected, `${version} ${range}`);
	assert.throws(() => satisfiesVersionRange('1.0.0', '>=banana'), PackageFormatError);
	assert.throws(() => parsePackageDocument("[{ tag: 'package', id: 'p', version: '1.0' }]"), /look like 1\.2\.3/);
});

test('the policy refuses capabilities, unknown ones, and versions the game cannot offer', () => {
	const document = parsePackageDocument(
		"[{ tag: 'package', id: 'p', version: '1.0.0', requires: { mwg: '>=99', retroAudio: '>=0.1', capabilities: ['audio', 'network'] } }]",
	);
	assert.deepEqual(
		checkPackagePolicy(document, { allow: ['audio', 'network'], provides: { mwg: '99.0.0', retroAudio: '0.2.0' } }),
		[],
	);
	const refusals = checkPackagePolicy(document, { allow: ['audio'] });
	assert.equal(refusals.length, 3);
	assert.match(refusals.join('\n'), /"network"/);
	assert.match(refusals.join('\n'), /requires mwg >=99/);
	assert.match(refusals.join('\n'), /does not provide/);
	assert.equal(
		checkPackagePolicy(document, {
			allow: ['audio'],
			refuseUnknown: false,
			provides: { mwg: '99.0.0', retroAudio: '1.0.0' },
		}).length,
		0,
	);
});

test('a script carrying code needs the script capability, in the policy and in verify', async () => {
	const source = `[{ tag: 'package', id: 'p', version: '1.0.0' }, { tag: 'script', id: 's', on: 'start', code: 'return 1' }]`;
	const document = parsePackageDocument(source);
	assert.match(checkPackagePolicy(document, { allow: ['audio'] }).join(), /"script"/);
	assert.deepEqual(checkPackagePolicy(document, { allow: ['script'] }), []);
	const report = await verifyPackage(await packageOf(source));
	assert.equal(report.ok, false);
	assert.match(report.errors.join(), /does not declare/);
	assert.deepEqual(report.capabilities, ['script']);
	const declared = source.replace("version: '1.0.0' }", "version: '1.0.0', requires: { capabilities: ['script'] } }");
	assert.equal((await verifyPackage(await packageOf(declared))).ok, true);
	assert.equal((await verifyPackage(await packageOf(declared), { policy: { allow: [] } })).ok, false);
});

test('ids are namespaced, references resolve locally first, and two versions coexist', async () => {
	const source = (version: string): string =>
		minimal(
			'marta',
			version,
			"{ tag: 'sound_effect', id: 'ouch', chip: 'x' }, { tag: 'music', id: 'theme', src: 'song' }, { tag: 'music', id: 'ext', src: 'other:song' }",
		);
	const v1 = await loadPackage(await packageOf(source('1.0.0')));
	const v2 = await loadPackage(await packageOf(source('2.0.0')));
	assert.match(packageRef(v1), /^marta@1\.0\.0#[0-9a-f]{64}$/);
	assert.deepEqual({ id: 'marta', version: '1.0.0', hash: v1.hash }, parsePackageRef(packageRef(v1)));
	assert.notEqual(packageRef(v1), packageRef(v2));

	const single = packageContent(mergePackage(v1));
	assert.deepEqual(Object.keys(single.soundEffects), ['marta:ouch']);
	assert.equal(single.music['marta:theme'].src, 'marta:song');
	assert.equal(single.music['marta:ext'].src, 'other:song', 'a qualified reference is left alone');

	const both = packageContent(mergePackage(v2, mergePackage(v1)));
	assert.deepEqual(Object.keys(both.music).sort(), [
		'marta:ext',
		'marta:theme',
		'marta@1.0.0:ext',
		'marta@1.0.0:theme',
	]);
	assert.equal(both.music['marta:theme'].package, 'marta@2.0.0');
	assert.equal(both.music['marta@1.0.0:theme'].src, 'marta@1.0.0:song');
	assert.throws(() => mergePackage(v1, mergePackage(v1)), PackageConflictError);
});

test('an imported package must be merged first, at a version that satisfies the range', async () => {
	const base = await loadPackage(await packageOf(minimal('base', '1.2.0')));
	const child = await loadPackage(
		await packageOf(minimal('child', '1.0.0', "{ tag: 'import', package: 'base', version: '^1.1' }")),
	);
	assert.throws(() => mergePackage(child), PackageConflictError);
	assert.equal(mergePackage(child, mergePackage(base)).packages.length, 2);
	const old = await loadPackage(await packageOf(minimal('base', '1.0.0')));
	assert.throws(() => mergePackage(child, mergePackage(old)), PackageConflictError);
});

test('characters expand into unit_type nodes, with their messages and media paths', async () => {
	const loaded = await loadPackage(await encodePackage(CHARACTER_FILES()));
	const game = compilePackages(mergePackage(loaded));
	assert.equal(game.roots.length, 1);
	const [unit] = game.roots;
	assert.equal(unit.tag, 'unit_type');
	assert.deepEqual(unit.attributes, {
		id: 'marta-the-ranger:marta',
		name: 'Marta',
		hitpoints: '28',
		movement: '5',
		image: 'marta-the-ranger/media/sheet.png',
		profile: 'marta-the-ranger/media/portrait.png',
	});
	assert.equal(unit.children[0].attributes.damage, '7');
	assert.deepEqual(game.messages, ['Marta', 'Marta grits her teeth.']);
	assert.deepEqual(game.assets, [
		'marta-the-ranger/media/portrait.png',
		'marta-the-ranger/media/sheet.png',
		'marta-the-ranger/media/theme.mid',
	]);
	const content = packageContent(mergePackage(loaded));
	assert.deepEqual(content.characters['marta-the-ranger:marta'].sounds, {
		arrow: 'marta-the-ranger:arrow',
		hurt: 'marta-the-ranger:ouch',
	});
	assert.equal(content.scripts['marta-the-ranger:on-low-health'].do[0].attributes.sound, 'marta-the-ranger:ouch');
	assert.equal(content.animations['marta-the-ranger:marta.shoot'].events[9].sound, 'marta-the-ranger:arrow');
});

test('verify passes the example and reports each kind of problem', async () => {
	const ok = await verifyPackage(await encodePackage(CHARACTER_FILES()));
	assert.deepEqual(ok.errors, []);
	assert.equal(ok.ok, true);
	assert.match(ok.ref ?? '', /^marta-the-ranger@1\.0\.0#/);

	const noLicence = CHARACTER.replace(", license: 'CC0-1.0', source: 'own work'", '');
	assert.match(
		(await verifyPackage(await encodePackage(CHARACTER_FILES(noLicence)))).errors.join('\n'),
		/needs a license[\s\S]*needs a source/,
	);

	const missingFile = CHARACTER_FILES().filter((file) => file.path !== 'media/sheet.png');
	assert.match(
		(await verifyPackage(await encodePackage(missingFile))).errors.join(),
		/"media\/sheet.png" is not in the package/,
	);

	const wrongHash = CHARACTER.replace(
		"id: 'portrait', kind: 'image',",
		`id: 'portrait', kind: 'image', sha256: '${'0'.repeat(64)}',`,
	);
	assert.match(
		(await verifyPackage(await encodePackage(CHARACTER_FILES(wrongHash)))).errors.join(),
		/sha256 does not match/,
	);

	const dangling = CHARACTER.replace("portrait: 'portrait'", "portrait: 'nobody'");
	assert.match(
		(await verifyPackage(await encodePackage(CHARACTER_FILES(dangling)))).errors.join(),
		/"nobody" is not defined/,
	);

	const range = CHARACTER.replace('>=0.42', '>=999');
	assert.match(
		(await verifyPackage(await encodePackage(CHARACTER_FILES(range)))).errors.join(),
		/requires mwg >=999/,
	);

	const extra = [...CHARACTER_FILES(), { path: 'notes.txt', data: text('hello') }];
	assert.match((await verifyPackage(await encodePackage(extra))).warnings.join(), /notes.txt/);

	const broken = await verifyPackage(new Uint8Array(30));
	assert.equal(broken.ok, false);
	assert.match(broken.errors[0], /bad magic/);

	const refused = await verifyPackage(await encodePackage(CHARACTER_FILES()), {
		policy: { allow: [], provides: { retroAudio: '0.2.0' } },
	});
	assert.match(refused.errors.join(), /refused by policy: asks for the "audio" capability/);
});

test('credits list every package and licensed asset in the existing CREDITS.txt format', () => {
	const document = parsePackageDocument(CHARACTER);
	assert.equal(
		generateCredits([document]),
		[
			'marta-the-ranger 1.0.0 by Ada\nLicense: CC-BY-4.0',
			'portrait (marta-the-ranger) by Ada\nLicense: CC0-1.0\nhttps://example.org/p',
			'sheet (marta-the-ranger) by Ada\nLicense: CC0-1.0\nown work',
			'theme (marta-the-ranger) by Ada\nLicense: CC0-1.0\nown work',
		].join('\n\n') + '\n',
	);
	assert.equal(generateCredits([]), '');
});

test('a package meant to be shared refuses a synth-patch bank with no licence', async () => {
	const bank = (license: string): string =>
		minimal('patches', '1.0.0', `{ tag: 'asset', id: 'bank', kind: 'synth-patch', path: 'banks/a.syx'${license} }`);
	const files = [{ path: 'banks/a.syx', data: new Uint8Array([0xf0, 0x43, 0xf7]) }];
	const unlicensed = await packageOf(bank(''), files);
	assert.equal((await verifyPackage(unlicensed)).ok, true, 'a private package is not held to it');
	const refused = await verifyPackage(unlicensed, { shared: true });
	assert.equal(refused.ok, false);
	assert.match(refused.errors.join(), /asset "bank": a shared synth-patch needs a license/);
	const licensed = await packageOf(bank(", license: 'CC0-1.0'"), files);
	assert.equal((await verifyPackage(licensed, { shared: true })).ok, true);
});

test("a patch inspector's warnings are reported without refusing the package, its errors refuse it", async () => {
	const source = minimal(
		'patches',
		'1.0.0',
		"{ tag: 'asset', id: 'bank', kind: 'synth-patch', path: 'banks/a.syx', license: 'CC0-1.0' }",
	);
	const bytes = await packageOf(source, [{ path: 'banks/a.syx', data: new Uint8Array([0xf0, 0x41, 0xf7]) }]);
	const seen: string[] = [];
	const warned = await verifyPackage(bytes, {
		inspectPatch: (data, asset) => {
			seen.push(`${asset.id}:${asset.path}:${data.length}`);
			return { warnings: ['patch 3 uses wave 80, which the model replaces'] };
		},
	});
	assert.equal(warned.ok, true, 'an unrendered wave is a warning, not a refusal');
	assert.deepEqual(seen, ['bank:banks/a.syx:3']);
	assert.match(warned.warnings.join(), /asset "bank": patch 3 uses wave 80/);
	const refused = await verifyPackage(bytes, { inspectPatch: () => ({ errors: ['not a bank'] }) });
	assert.equal(refused.ok, false);
	assert.match(refused.errors.join(), /asset "bank": not a bank/);
});

test('credits add a support line only when the game asks for one, and only for a web address', () => {
	const document = parsePackageDocument(CHARACTER);
	const plain = generateCredits([document]);
	const support = { url: 'https://example.org/support' };
	assert.equal(
		generateCredits([document], { support }),
		`${plain}\nTake part in the project\nhttps://example.org/support\n`,
	);
	assert.equal(
		generateCredits([], { support: { ...support, label: 'Soutenir' } }),
		'Soutenir\nhttps://example.org/support\n',
	);
	assert.throws(() => generateCredits([], { support: { url: 'javascript:alert(1)' } }), /http or https/);
});

test('a file with no package tag compiles exactly as before', () => {
	const golden = JSON.parse(readFileSync(new URL('./fixtures/mwl/skirmish.golden.json', import.meta.url), 'utf8'));
	const source = readFileSync(new URL('./fixtures/mwl/skirmish.mwl', import.meta.url), 'utf8');
	assert.deepEqual(compile(source, { file: 'skirmish.mwl' }), golden);
	// the standard compiler still has no idea what a package tag is: the new tags live beside it
	assert.throws(() => compile(minimal('p', '1.0.0')), /unknown tag package/);
});
