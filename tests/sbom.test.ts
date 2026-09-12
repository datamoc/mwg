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

	assert.equal(committed, expected, 'run "npm run sbom" and commit the result');
});
