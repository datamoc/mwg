import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

interface ManifestEntry {
	name: string;
	kind: string;
	subpath: string;
	declaringModule: string;
}

/**
 * P28: `api-surface.json` is the machine-readable half of the API-surface guard - one
 * `{ name, kind, subpath, declaringModule }` entry per export per subpath, generated
 * from the same pass that maintains `API_REPORT.md`. Agreement with the declarations
 * is pinned by `tests/api-surface.test.ts` (the `--check` it runs now verifies both
 * files); this test pins the shape and the coverage instead, without needing a build.
 */
function loadManifest(): ManifestEntry[] {
	return JSON.parse(readFileSync(new URL('../api-surface.json', import.meta.url), 'utf8'));
}

test('every manifest entry carries exactly the documented shape', () => {
	const entries = loadManifest();
	assert.ok(entries.length > 1000, `expected a full surface, saw ${entries.length} entries`);

	const kinds = new Set([
		'class',
		'interface',
		'type',
		'function',
		'const',
		'enum',
		'namespace',
		'export',
		're-export',
		'tool',
		'data',
	]);
	for (const entry of entries) {
		assert.deepEqual(
			Object.keys(entry).sort(),
			['declaringModule', 'kind', 'name', 'subpath'],
			`entry has exactly the four documented fields: ${JSON.stringify(entry)}`,
		);
		assert.equal(typeof entry.name, 'string');
		assert.equal(typeof entry.subpath, 'string');
		assert.equal(typeof entry.declaringModule, 'string');
		assert.ok(kinds.has(entry.kind), `unknown kind ${entry.kind} for ${entry.subpath} :: ${entry.name}`);
		assert.ok(!entry.declaringModule.includes('\\'), 'declaringModule uses forward slashes');
	}
});

test('manifest entries are sorted by (subpath, name) with no duplicates', () => {
	const entries = loadManifest();
	const keys = entries.map((entry) => `${entry.subpath} :: ${entry.name}`);
	assert.deepEqual(
		[...keys].sort((a, b) => a.localeCompare(b)),
		keys,
		'manifest order is (subpath, name)',
	);
	assert.equal(new Set(keys).size, keys.length, 'no duplicate (subpath, name) entries');
});

test('every package.json subpath is enumerated, including the bare-string tools entries', () => {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	const subpaths = Object.keys(pkg.exports);
	const entries = loadManifest();
	const bySubpath = new Map<string, ManifestEntry[]>();
	for (const entry of entries) {
		if (!bySubpath.has(entry.subpath)) bySubpath.set(entry.subpath, []);
		bySubpath.get(entry.subpath)!.push(entry);
	}

	for (const subpath of subpaths) {
		assert.ok((bySubpath.get(subpath) ?? []).length > 0, `manifest enumerates ${subpath}`);
	}
	for (const entry of entries) {
		assert.ok(subpaths.includes(entry.subpath), `manifest entry names a shipped subpath: ${entry.subpath}`);
	}

	for (const [subpath, target] of Object.entries(pkg.exports) as [string, unknown][]) {
		if (typeof target !== 'string') continue;
		const listed = (bySubpath.get(subpath) ?? []).filter((entry) => entry.name === subpath);
		assert.equal(listed.length, 1, `bare-string subpath ${subpath} is enumerated once, as itself`);
		assert.ok(['tool', 'data'].includes(listed[0].kind), `${subpath} is a tool or data entry`);
		assert.equal(listed[0].declaringModule, (target as string).replace(/^\.\//, ''));
	}
});

test('known exports resolve to the module that declares them', () => {
	const entries = loadManifest();
	const find = (subpath: string, name: string): ManifestEntry => {
		const entry = entries.find((candidate) => candidate.subpath === subpath && candidate.name === name);
		assert.ok(entry, `manifest contains ${subpath} :: ${name}`);
		return entry!;
	};

	assert.equal(find('./core', 'NEIGHBOURS8').declaringModule, 'core/Grid.d.ts');
	assert.equal(find('./core', 'RandomSource').declaringModule, 'core/Random.d.ts');
	assert.equal(find('./core', 'RandomSource').kind, 'interface');
	assert.equal(find('./core', 'createHandles').declaringModule, 'core/Handles.d.ts');
	assert.ok(find('./two-d/pixi-interop', 'Container').declaringModule.endsWith('pixi-interop.d.ts'));
});
