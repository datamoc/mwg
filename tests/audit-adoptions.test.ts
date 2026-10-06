import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import { adoptionKey, auditAdoptions, formatFindings, scanImports, scanLocals } from '../tools/audit-adoptions.mjs';

import type { AuditorConfig, ConsumerImport, LocalDefinition, ManifestEntry } from '../tools/audit-adoptions.d.mts';

/**
 * P30: the shipped adoption auditor checks a manifest against a consumer's imports,
 * locals and policy config. Renderer-free throughout: the fixtures below are inline
 * data, never the filesystem, except the one CLI test that proves the exit contract.
 */

const MANIFEST: ManifestEntry[] = [
	{ name: 'Generator', kind: 'class', subpath: './core', declaringModule: 'core/Random.d.ts' },
	{ name: 'Scheduler', kind: 'class', subpath: './simulation', declaringModule: 'simulation/Runtime.d.ts' },
	{ name: 'World', kind: 'class', subpath: './world', declaringModule: 'world/index.d.ts' },
];

const CONFIG: AuditorConfig = { reasons: {} };

test('an import silences unadopted; a reason does too', () => {
	const imports: ConsumerImport[] = [
		{ file: 'src/a.ts', line: 1, subpath: './core', names: ['Generator'], typeOnly: false },
	];
	const config: AuditorConfig = {
		reasons: { './simulation :: Scheduler': 'turns live elsewhere', './world :: World': 'no world map here' },
	};
	const rules = auditAdoptions(MANIFEST, imports, [], config).map((finding) => finding.rule);
	assert.ok(!rules.includes('unadopted'), 'every export is imported or reasoned');

	const bare = auditAdoptions(MANIFEST, [], [], CONFIG);
	assert.equal(bare.filter((finding) => finding.rule === 'unadopted').length, 3);
});

test('a reason naming nothing is stale, whether an export or a local', () => {
	const config: AuditorConfig = {
		reasons: {
			'./core :: Nope': 'removed upstream',
			'local :: Ghost': 'deleted with the feature',
			'./simulation :: Scheduler': 'kept',
		},
	};
	const imports: ConsumerImport[] = [
		{ file: 'src/a.ts', line: 1, subpath: './core', names: ['Generator'], typeOnly: false },
		{ file: 'src/a.ts', line: 2, subpath: './world', names: ['World'], typeOnly: false },
	];
	const stale = auditAdoptions(MANIFEST, imports, [], config).filter((finding) => finding.rule === 'stale-reason');
	assert.deepEqual(
		stale.map((finding) => finding.message).sort(),
		['./core :: Nope names no manifest export', 'local :: Ghost documents no local definition'].sort(),
	);
});

test('a local shadowing a never-imported export is a collision with file:line, unless documented', () => {
	const locals: LocalDefinition[] = [{ name: 'World', file: 'src/map.ts', line: 12 }];
	const imports: ConsumerImport[] = [
		{ file: 'src/a.ts', line: 1, subpath: './core', names: ['Generator'], typeOnly: false },
		{ file: 'src/a.ts', line: 2, subpath: './simulation', names: ['Scheduler'], typeOnly: false },
	];
	const [collision] = auditAdoptions(MANIFEST, imports, locals, CONFIG).filter(
		(finding) => finding.rule === 'collision',
	);
	assert.equal(collision.file, 'src/map.ts');
	assert.equal(collision.line, 12);

	const documented: AuditorConfig = { reasons: { 'local :: World': 'the game map, never the framework export' } };
	assert.equal(
		auditAdoptions(MANIFEST, imports, locals, documented).filter((finding) => finding.rule === 'collision').length,
		0,
	);

	const adopted: ConsumerImport[] = [
		...imports,
		{ file: 'src/b.ts', line: 3, subpath: './world', names: ['World'], typeOnly: false },
	];
	assert.equal(
		auditAdoptions(MANIFEST, adopted, locals, CONFIG).filter((finding) => finding.rule === 'collision').length,
		0,
		'importing the export turns the shadow into an adoption, not a copy',
	);
});

test('a denied prefix covers its children, and reports file:line', () => {
	const config: AuditorConfig = { reasons: {}, denySubpaths: ['./two-d'] };
	const imports: ConsumerImport[] = [
		{ file: 'src/view.ts', line: 4, subpath: './two-d/render', names: ['TileMap'], typeOnly: false },
	];
	const [finding] = auditAdoptions([], imports, [], config);
	assert.equal(finding.rule, 'denied-subpath');
	assert.equal(finding.file, 'src/view.ts');
	assert.equal(finding.line, 4);
});

test('a runtime import under a type-only directory fails; a type import passes', () => {
	const config: AuditorConfig = { reasons: {}, typeOnlyDirs: ['src/simulation'] };
	const runtime: ConsumerImport[] = [
		{ file: 'src/simulation/rule.ts', line: 2, subpath: './core', names: ['Generator'], typeOnly: false },
	];
	const typeOnly: ConsumerImport[] = [{ ...runtime[0], typeOnly: true }];
	assert.equal(auditAdoptions([], runtime, [], config)[0].rule, 'type-only');
	assert.equal(auditAdoptions([], typeOnly, [], config).length, 0);
});

test('a budget names the first file past the limit, and stays silent within it', () => {
	const config: AuditorConfig = {
		reasons: {},
		budgets: [{ match: './two-d/pixi-interop', limit: 1, reason: 'escape hatch' }],
	};
	const imports: ConsumerImport[] = [
		{ file: 'src/a.ts', line: 1, subpath: './two-d/pixi-interop', names: ['Sprite'], typeOnly: false },
		{ file: 'src/b.ts', line: 9, subpath: './two-d/pixi-interop', names: ['Graphics'], typeOnly: false },
	];
	const [finding] = auditAdoptions([], imports, [], config);
	assert.equal(finding.rule, 'budget');
	assert.equal(finding.file, 'src/b.ts');
	assert.equal(finding.line, 9);
	assert.match(finding.message, /2 files import past/);
	assert.equal(auditAdoptions([], imports.slice(0, 1), [], config).length, 0);
});

test('scanImports separates value from type imports and scanLocals finds definitions with lines', () => {
	const files = [
		{
			path: 'src/a.ts',
			text: `import { Generator } from '@datamoc/mw_games/core';\nimport type { Actor } from '@datamoc/mw_games/world';\n`,
		},
		{ path: 'src/b.ts', text: `export interface World {\n\thp: number;\n}\n` },
	];
	const imports = scanImports(files);
	assert.deepEqual(imports[0], {
		file: 'src/a.ts',
		line: 1,
		subpath: './core',
		names: ['Generator'],
		typeOnly: false,
	});
	assert.equal(imports[1].typeOnly, true);
	assert.deepEqual(scanLocals(files), [{ name: 'World', file: 'src/b.ts', line: 1 }]);
});

test('adoptionKey joins subpath and name the way reasons address them', () => {
	assert.equal(adoptionKey('./core', 'Generator'), './core :: Generator');
	assert.deepEqual(formatFindings([]), []);
	assert.deepEqual(formatFindings([{ rule: 'unadopted', message: 'x' }]), ['[unadopted] x']);
});

const ROOT = resolvePath(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

test('the CLI prints findings with file:line and exits non-zero, then clean when reasoned', () => {
	const scratchRoot = join(ROOT, '.example-check');
	mkdirSync(scratchRoot, { recursive: true });
	const dir = mkdtempSync(join(scratchRoot, 'audit-'));
	try {
		const manifestFile = join(dir, 'manifest.json');
		const importsFile = join(dir, 'imports.json');
		const localsFile = join(dir, 'locals.json');
		const configFile = join(dir, 'config.json');
		writeFileSync(manifestFile, JSON.stringify(MANIFEST), 'utf8');
		writeFileSync(
			importsFile,
			JSON.stringify([{ file: 'src/a.ts', line: 1, subpath: './core', names: ['Generator'], typeOnly: false }]),
			'utf8',
		);
		writeFileSync(localsFile, JSON.stringify([{ name: 'World', file: 'src/map.ts', line: 12 }]), 'utf8');
		writeFileSync(
			configFile,
			JSON.stringify({ reasons: { './simulation :: Scheduler': 'turns live elsewhere' } }),
			'utf8',
		);

		const run = (extra: string[]): { code: number; output: string } => {
			try {
				const output = execFileSync(
					'node',
					[
						join(ROOT, 'tools', 'audit-adoptions.mjs'),
						'--manifest',
						manifestFile,
						'--imports',
						importsFile,
						'--locals',
						localsFile,
						'--config',
						configFile,
						...extra,
					],
					{ cwd: ROOT, encoding: 'utf8', shell: true },
				);
				return { code: 0, output };
			} catch (error) {
				const caught = error as { status?: number; stdout?: string };
				return { code: caught.status ?? 1, output: caught.stdout ?? '' };
			}
		};

		const dirty = run([]);
		assert.equal(dirty.code, 1);
		assert.match(dirty.output, /src\/map\.ts:12: \[collision\]/);

		writeFileSync(
			configFile,
			JSON.stringify({
				reasons: {
					'./simulation :: Scheduler': 'turns live elsewhere',
					'./world :: World': 'no world map in this project',
					'local :: World': 'the game map, never the framework export',
				},
			}),
			'utf8',
		);
		const clean = run([]);
		assert.equal(clean.code, 0, clean.output);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
