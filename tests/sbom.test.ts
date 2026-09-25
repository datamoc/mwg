import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildSbom, hashesFromIntegrity, purlFor, serialize, type Lockfile, type PackageJson } from '../tools/sbom.mjs';

test('purlFor encodes a scoped name the way the purl npm examples do', () => {
	assert.equal(purlFor('rot-js', '2.2.1'), 'pkg:npm/rot-js@2.2.1');
	assert.equal(purlFor('@datamoc/mw_games', '0.7.8'), 'pkg:npm/%40datamoc/mw_games@0.7.8');
});

test('hashesFromIntegrity converts npm base64 to CycloneDX hex', () => {
	assert.deepEqual(hashesFromIntegrity('sha512-AAAA'), [{ alg: 'SHA-512', content: '000000' }]);
	assert.deepEqual(hashesFromIntegrity('sha1-Zm9v'), [{ alg: 'SHA-1', content: Buffer.from('foo').toString('hex') }]);
	assert.deepEqual(hashesFromIntegrity('md5-AAAA'), [], 'an unknown algorithm is dropped, not guessed at');
	assert.deepEqual(hashesFromIntegrity(undefined), []);
});

test('buildSbom marks dev-only packages excluded and production ones required', () => {
	const lockfile: Lockfile = {
		packages: {
			'': { dependencies: { 'prod-pkg': '^1.0.0' }, devDependencies: { 'dev-pkg': '^2.0.0' } },
			'node_modules/prod-pkg': { version: '1.2.3', integrity: 'sha512-AAAA', license: 'MIT' },
			'node_modules/dev-pkg': { version: '2.0.0', dev: true, license: 'Apache-2.0 OR MIT' },
		},
	};

	const bom = buildSbom({ name: 'demo', version: '1.0.0', license: 'MPL-2.0' }, lockfile);

	assert.equal(bom.bomFormat, 'CycloneDX');
	assert.equal(bom.specVersion, '1.6');
	assert.equal(bom.metadata.component.purl, 'pkg:npm/demo@1.0.0');
	assert.deepEqual(
		bom.components.map((component) => [component.name, component.scope]),
		[
			['dev-pkg', 'excluded'],
			['prod-pkg', 'required'],
		],
	);
	const prod = bom.components.find((component) => component.name === 'prod-pkg');
	assert.deepEqual(prod?.hashes, [{ alg: 'SHA-512', content: '000000' }]);
	assert.deepEqual(prod?.licenses, [{ license: { id: 'MIT' } }]);
	const dev = bom.components.find((component) => component.name === 'dev-pkg');
	assert.deepEqual(dev?.licenses, [{ license: { name: 'Apache-2.0 OR MIT' } }], 'an expression stays a name');
	const root = bom.dependencies.find((dependency) => dependency.ref === 'pkg:npm/demo@1.0.0');
	assert.deepEqual(root?.dependsOn, ['pkg:npm/dev-pkg@2.0.0', 'pkg:npm/prod-pkg@1.2.3']);
});

test('buildSbom resolves a dependency to the nearest nested copy, not the top-level one', () => {
	const lockfile: Lockfile = {
		packages: {
			'': { dependencies: { a: '^1.0.0', b: '^1.0.0' } },
			'node_modules/a': { version: '1.0.0', dependencies: { b: '^2.0.0' } },
			'node_modules/b': { version: '1.0.0' },
			'node_modules/a/node_modules/b': { version: '2.0.0' },
		},
	};

	const bom = buildSbom({ name: 'demo', version: '1.0.0' }, lockfile);

	const refOf = (name: string): string | undefined =>
		bom.dependencies.find((dependency) => dependency.ref.startsWith(`pkg:npm/${name}@`))?.ref;
	assert.equal(refOf('a'), 'pkg:npm/a@1.0.0');
	assert.deepEqual(bom.dependencies.find((dependency) => dependency.ref === 'pkg:npm/a@1.0.0')?.dependsOn, [
		'pkg:npm/b@2.0.0',
	]);
	assert.deepEqual(bom.dependencies.find((dependency) => dependency.ref === 'pkg:npm/demo@1.0.0')?.dependsOn, [
		'pkg:npm/a@1.0.0',
		'pkg:npm/b@1.0.0',
	]);
});

test('serialize is deterministic, with a serial number derived from the content and no timestamp', () => {
	const packages = { '': { dependencies: { 'prod-pkg': '^1.0.0' } }, 'node_modules/prod-pkg': { version: '1.0.0' } };
	const bom = buildSbom({ name: 'demo', version: '1.0.0' }, { packages });

	assert.equal(serialize(bom), serialize(buildSbom({ name: 'demo', version: '1.0.0' }, { packages })));
	// a version-5 UUID: the version nibble and the RFC 4122 variant bits, in CycloneDX's urn form
	assert.match(bom.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

	const moved = buildSbom(
		{ name: 'demo', version: '1.0.0' },
		{
			packages: { '': { dependencies: { 'prod-pkg': '^1.0.0' } }, 'node_modules/prod-pkg': { version: '1.0.1' } },
		},
	);
	assert.notEqual(moved.serialNumber, bom.serialNumber, 'a changed dependency is a different BOM');
	assert.equal(
		(bom.metadata as unknown as Record<string, unknown>).timestamp,
		undefined,
		'deliberate: see buildSbom',
	);
});

test('the committed sbom.cdx.json matches the current package.json and package-lock.json', () => {
	const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')) as T;
	const expected = serialize(buildSbom(read<PackageJson>('package.json'), read<Lockfile>('package-lock.json')));
	const committed = readFileSync(new URL('../sbom.cdx.json', import.meta.url), 'utf8');

	assert.equal(
		committed.replace(/\r\n/g, '\n'),
		expected.replace(/\r\n/g, '\n'),
		'run "npm run sbom" and commit the result',
	);
});

test('the artifact SBOM lists only the packages whose modules reached the bundle, and the shipped files', async () => {
	const { buildArtifactSbom, packageOfModule } = await import('../tools/sbom.mjs');
	const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	//forward slashes throughout, since packageOfModule normalizes to them on every platform and
	//mkdtempSync on Windows hands back backslashes
	const root = mkdtempSync(join(tmpdir(), 'mwg-sbom-')).replaceAll('\\', '/');
	try {
		for (const [name, version, license] of [
			['pixi.js', '8.1.0', 'MIT'],
			['@datamoc/mw_games', '0.16.0', 'MPL-2.0'],
		]) {
			mkdirSync(join(root, 'node_modules', name), { recursive: true });
			writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version, license }));
		}
		assert.deepEqual(packageOfModule(`${root}/node_modules/@datamoc/mw_games/dist/core/index.js`), {
			name: '@datamoc/mw_games',
			dir: `${root}/node_modules/@datamoc/mw_games`,
		});
		assert.equal(packageOfModule(`${root}/src/main.ts`), null);
		const bom = buildArtifactSbom({
			packageJson: { name: 'my-game', version: '1.0.0', private: true },
			modules: [
				`${root}/src/main.ts`,
				`${root}/node_modules/pixi.js/lib/index.mjs`,
				`${root}/node_modules/pixi.js/lib/app/Application.mjs`,
				`${root}/node_modules/@datamoc/mw_games/dist/two-d/Game.js`,
				'\0vite/preload-helper',
			],
			files: [
				{ path: 'index.html', sha256: 'aa' },
				{ path: 'game.js', sha256: 'bb' },
			],
		});
		assert.equal(bom.metadata.component.type, 'application');
		assert.deepEqual(
			bom.components.map((component) => component['bom-ref']),
			['pkg:npm/%40datamoc/mw_games@0.16.0', 'pkg:npm/pixi.js@8.1.0', 'file:game.js', 'file:index.html'],
		);
		assert.deepEqual(bom.components[1].licenses, [{ license: { id: 'MIT' } }]);
		assert.deepEqual(bom.components[2].hashes, [{ alg: 'SHA-256', content: 'bb' }]);
		assert.deepEqual(bom.dependencies, [
			{
				ref: 'pkg:npm/my-game@1.0.0',
				dependsOn: ['pkg:npm/%40datamoc/mw_games@0.16.0', 'pkg:npm/pixi.js@8.1.0'],
			},
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
