import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';

/**
 * A barrel that re-exports two modules with `export *` and a name they both export gets a
 * silent hole: TypeScript resolves the ambiguity by exporting neither name, with no error.
 * A name vanishing from a barrel is worse than a duplicate name, because nothing fails at
 * build time - the first consumer to import it gets a confusing "has no exported member".
 * This test walks every barrel in `src/` that uses `export * from './...'`, resolves each
 * star source's real exported names, and fails the moment two sources collide.
 */

const ROOT = resolvePath(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = join(ROOT, 'src');

/** every `.ts` file under `src/`, recursively */
function walkTs(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const info = statSync(full);
		if (info.isDirectory()) out.push(...walkTs(full));
		else if (entry.endsWith('.ts')) out.push(full);
	}
	return out;
}

/**
 * Names a module makes reachable through its export statements, resolved recursively
 * through `export *` and `export { x as y } from './...'`. Regex-based on purpose, the same
 * trade the renderer-isolation test already makes: good enough to catch a collision, and
 * deliberately simple enough that its failure modes are visible rather than subtle.
 */
function exportedNames(file: string, seen: Set<string> = new Set()): Map<string, string> {
	if (seen.has(file)) return new Map();
	const nextSeen = new Set(seen);
	nextSeen.add(file);

	// Prettier wraps a long `export { a, b, ... } from './x.ts'` across lines, so collapse
	// each such block back onto one line before the per-line patterns below run
	const source = readFileSync(file, 'utf8')
		.replace(/\/\*\*?[\s\S]*?\*\//g, '')
		.replace(/\/\/.*$/gm, '')
		.replace(
			/export\s+(type\s+)?\{([\s\S]*?)\}\s*from/g,
			(_match, keyword: string | undefined, body: string) =>
				`export ${keyword ?? ''}{ ${body.replace(/\s+/g, ' ').trim()} } from`,
		);
	const names = new Map<string, string>();

	function add(name: string, from: string): void {
		if (!names.has(name)) names.set(name, from);
	}

	for (const line of source.split('\n')) {
		// export * as N from '...' - a namespace, one name, not a star
		let match = line.match(/export \* as (\w+) from '([^']+)'/);
		if (match) {
			add(match[1], line.trim());
			continue;
		}

		// export * from './...' - the collision-relevant case
		match = line.match(/export \* from '(\.[^']+)'/);
		if (match) {
			const target = resolvePath(dirname(file), match[1]);
			for (const [name, from] of exportedNames(target, nextSeen)) add(name, from);
			continue;
		}

		// export { a, b as c } from './...'
		match = line.match(/export (?:type )?\{([^}]+)\} from '(\.[^']+)'/);
		if (match) {
			const target = resolvePath(dirname(file), match[2]);
			const targetNames = exportedNames(target, nextSeen);
			for (const entry of match[1].split(',')) {
				const parts = entry
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/);
				const local = parts[0].trim();
				const exported = (parts[1] ?? parts[0]).trim();
				const found = targetNames.get(local);
				add(exported, found ?? `${match[2]} (${line.trim()})`);
			}
			continue;
		}

		// export { a, b } - a local re-export, resolved from the file's own declarations/imports
		match = line.match(/export (?:type )?\{([^}]+)\}(?!\s*from)/);
		if (match) {
			for (const entry of match[1].split(',')) {
				const name = entry
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/)
					.pop()!
					.trim();
				add(name, line.trim());
			}
			continue;
		}

		// export declare/class/function/const/interface/type/enum NAME - a real declaration
		match = line.match(
			/export (?:declare )?(?:abstract )?(?:class|interface|type|function|const|enum|namespace) (\w+)/,
		);
		if (match) add(match[1], line.trim());
	}

	return names;
}

const barrels = walkTs(SRC).filter((file) =>
	/export \* from '\./.test(readFileSync(file, 'utf8').replace(/\/\*\*?[\s\S]*?\*\//g, '')),
);

test('barrels with export * are actually being scanned', () => {
	assert.ok(barrels.length >= 2, 'src/index.ts and src/two-d/index.ts are the known star barrels');
});

test('no two export * sources in the same barrel export the same name', () => {
	const collisions: string[] = [];

	for (const barrel of barrels) {
		const source = readFileSync(barrel, 'utf8').replace(/\/\*\*?[\s\S]*?\*\//g, '');
		const stars = [...source.matchAll(/export \* from '(\.[^']+)'/g)].map((match) =>
			resolvePath(dirname(barrel), match[1]),
		);
		const byName = new Map<string, string[]>();

		for (const star of stars) {
			for (const [name, from] of exportedNames(star)) {
				const seen = byName.get(name) ?? [];
				seen.push(`${relative(barrel, star)} (${from})`);
				byName.set(name, seen);
			}
		}

		for (const [name, sources] of byName) {
			if (sources.length > 1) {
				collisions.push(`${relative(SRC, barrel)}: "${name}" is exported by ${sources.join(' and ')}`);
			}
		}
	}

	assert.deepEqual(
		collisions,
		[],
		'star-export collisions silently drop the name from the barrel - rename or re-export one explicitly',
	);
});

/** the guard on the guard: the root barrel must actually resolve the names games import */
test('the root barrel still resolves the names the getting-started page imports', () => {
	const rootNames = exportedNames(join(SRC, 'index.ts'));
	for (const name of ['Game', 'Scene2D', 'TintedSprite', 'MessageBox', 'Generator', 'version']) {
		assert.ok(rootNames.has(name), `root barrel lost "${name}" - if this is intentional, update this test`);
	}
});

function relative(from: string, to: string): string {
	return to.replace(from, '').replace(/^\//, '').replace(/\\/g, '/') || '.';
}
