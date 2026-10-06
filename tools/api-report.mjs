import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generates `API_REPORT.md` from emitted declaration files, or checks that the committed
 * report still matches them.
 *
 * The report is the reviewable half of the API-surface guard: it lists every export of
 * every public subpath in package.json, with the declaration text behind it, so a rename,
 * removal, or signature change shows up as a readable diff in a pull request. `npm test`
 * verifies it stays honest via `tests/api-surface.test.ts`; `npm run api:report`
 * regenerates it from a fresh build.
 *
 * Modes:
 *   node tools/api-report.mjs                           write API_REPORT.md and api-surface.json from dist/
 *   node tools/api-report.mjs --check                   fail if dist/ disagrees with either committed file
 *   node tools/api-report.mjs --check --declarations D  fail if declarations under D disagree
 *   node tools/api-report.mjs --diff OLD NEW            list added/removed/kind-changed
 *                                                       exports between two api-surface.json files
 *
 * The last mode exists for the test suite, which emits declarations into a temp dir with
 * `tsc --emitDeclarationOnly` and checks those, so `npm test` needs no prior build.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reportPath = join(root, 'API_REPORT.md');
const manifestPath = join(root, 'api-surface.json');

/** public subpath -> declaration file path (relative to the declarations dir) */
function publicModules() {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const modules = [];

	for (const [subpath, target] of Object.entries(pkg.exports)) {
		if (subpath.startsWith('./tools')) continue;
		const types = typeof target === 'string' ? null : (target.types ?? target.import);
		const distPath = typeof target === 'string' ? target : types;
		if (!distPath || !distPath.startsWith('./dist/')) continue;
		const rel = distPath.replace(/^\.\/dist\//, '').replace(/\\/g, '/');
		modules.push({ subpath, rel });
	}

	modules.sort((a, b) => (a.subpath === '.' ? -1 : b.subpath === '.' ? 1 : a.subpath.localeCompare(b.subpath)));
	return modules;
}

function readDeclarations(dir) {
	const files = new Map();

	function walk(current) {
		for (const entry of readdirSync(current)) {
			const full = join(current, entry);
			const info = statSync(full);
			if (info.isDirectory()) walk(full);
			else if (entry.endsWith('.d.ts'))
				files.set(relative(dir, full).replace(/\\/g, '/'), readFileSync(full, 'utf8'));
		}
	}

	walk(dir);
	return files;
}

/** strip block comments and line comments, so they cannot be mistaken for declarations */
function stripComments(text) {
	return text
		.replace(/\/\*\*?[\s\S]*?\*\//g, '')
		.split('\n')
		.map((line) => line.replace(/\/\/.*$/, ''))
		.join('\n');
}

function kindOf(text) {
	if (/^export declare abstract class\b/.test(text)) return 'class';
	if (/^export declare class\b/.test(text)) return 'class';
	if (/^export interface\b/.test(text)) return 'interface';
	if (/^export type\b/.test(text)) return 'type';
	if (/^export declare function\b/.test(text)) return 'function';
	if (/^export declare const\b/.test(text)) return 'const';
	if (/^export declare enum\b/.test(text)) return 'enum';
	if (/^export declare namespace\b/.test(text)) return 'namespace';
	return 'export';
}

function nameOf(text) {
	const match = text.match(
		/^export declare (?:abstract )?(?:class|function|const|enum|namespace) (\w+)|^export (?:interface|type) (\w+)/,
	);
	return match?.[1] ?? match?.[2] ?? null;
}

/** split an import/export name list like `a, b as c, type T` into { local, exported, type } entries */
function splitNameList(list) {
	return list
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const type = entry.startsWith('type ');
			const bare = entry.replace(/^type\s+/, '');
			const parts = bare.split(/\s+as\s+/);
			return { local: parts[0].trim(), exported: (parts[1] ?? parts[0]).trim(), type };
		});
}

/** normalize a specifier like './Game.ts' into a declarations-dir-relative .d.ts path */
function resolveSpecifier(fromFile, specifier) {
	if (!specifier.startsWith('.')) return null;
	return relative('.', resolve(dirname(fromFile), specifier))
		.replace(/\\/g, '/')
		.replace(/\.ts$/, '.d.ts');
}

/**
 * Parse one declaration file into its own declarations, its imports, and the export
 * statements that re-export them. Barrels in tsc output are mostly re-export statements;
 * leaf files are mostly `export declare ...` blocks.
 */
function parseFile(text) {
	const declarations = new Map(); // name -> { kind, text }
	const imports = new Map(); // exported name -> { source, local, type }
	const statements = []; // { kind: 'star'|'starAs'|'list', type, list?, source? }

	const clean = stripComments(text);
	const lines = clean.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const importMatch =
			line.match(/^import type\s+\{([^}]+)\}\s+from\s+'([^']+)';?/) ??
			line.match(/^import\s+\{([^}]+)\}\s+from\s+'([^']+)';?/);
		if (importMatch) {
			const typeOnly = /^import type/.test(line);
			const source = importMatch[2];
			for (const entry of splitNameList(importMatch[1])) {
				imports.set(entry.exported, { source, local: entry.local, type: typeOnly || entry.type });
			}
			continue;
		}

		if (/^export \* as \w+ from '[^']+';?/.test(line)) {
			const match = line.match(/^export \* as (\w+) from '([^']+)';?/);
			statements.push({ kind: 'starAs', name: match[1], source: match[2] });
			continue;
		}

		if (/^export \* from '[^']+';?/.test(line)) {
			const match = line.match(/^export \* from '([^']+)';?/);
			statements.push({ kind: 'star', source: match[1] });
			continue;
		}

		const listMatch = line.match(/^export (type\s+)?\{([^}]*)\}\s*(?:from\s+'([^']+)')?;?/);
		if (listMatch && (line.startsWith('export {') || line.startsWith('export type {'))) {
			const typeOnly = Boolean(listMatch[1]);
			const list = splitNameList(listMatch[2]).map((entry) => ({ ...entry, type: typeOnly || entry.type }));
			statements.push({ kind: 'list', type: typeOnly, list, source: listMatch[3] ?? null });
			continue;
		}

		// block declarations: class/interface bodies span several lines
		if (
			/^export declare (?:abstract )?class\b/.test(line) ||
			/^export interface\b/.test(line) ||
			/^export declare (?:enum|namespace)\b/.test(line)
		) {
			let depth = 0;
			let collected = '';
			let started = false;
			let j = i;
			for (; j < lines.length; j++) {
				collected += (collected ? '\n' : '') + lines[j];
				const opens = (lines[j].match(/\{/g) ?? []).length;
				const closes = (lines[j].match(/\}/g) ?? []).length;
				depth += opens - closes;
				if (opens > 0) started = true;
				if (started && depth <= 0) break;
			}
			i = j;
			const name = nameOf(collected);
			if (name)
				declarations.set(name, { kind: kindOf(collected), text: collected.trim().replace(/[ \t]+$/gm, '') });
			continue;
		}

		// single-line declarations: functions, consts, type aliases
		if (/^export declare (?:function|const)\b/.test(line) || /^export type\b/.test(line)) {
			// tsc keeps these on one line; if a line ever wraps, follow it to the closing `;`
			let collected = line;
			let j = i;
			while (!/[;]$/.test(collected.trim()) && j + 1 < lines.length) {
				j += 1;
				collected += '\n' + lines[j];
				if (collected.split('\n').length > 20) break; // safety, never infinite
			}
			i = j;
			const name = nameOf(collected);
			if (name)
				declarations.set(name, { kind: kindOf(collected), text: collected.trim().replace(/[ \t]+$/gm, '') });
			continue;
		}
	}

	return { declarations, imports, statements };
}

function resolveModule(file, files, cache) {
	if (cache.has(file)) return cache.get(file);

	const text = files.get(file);
	if (text === undefined) return new Map();
	const parsed = parseFile(text);
	const exports = new Map();

	function add(name, kind, declaration, declaring = file) {
		if (!exports.has(name)) exports.set(name, { kind, text: declaration, file: declaring });
	}

	for (const [name, decl] of parsed.declarations) add(name, decl.kind, decl.text, file);

	for (const statement of parsed.statements) {
		if (statement.kind === 'starAs') {
			add(statement.name, 'namespace', `export * as ${statement.name} from '${statement.source}'`);
			continue;
		}

		if (statement.kind === 'star') {
			const target = resolveSpecifier(file, statement.source);
			if (target === null || !files.has(target)) continue;
			for (const [name, decl] of resolveModule(target, files, cache)) add(name, decl.kind, decl.text, decl.file);
			continue;
		}

		// explicit re-export list
		for (const entry of statement.list) {
			if (statement.source) {
				const target = resolveSpecifier(file, statement.source);
				if (target === null || !files.has(target)) {
					add(
						entry.exported,
						entry.type ? 'type' : 're-export',
						`export ${entry.type ? 'type ' : ''}{ ${entry.local}${entry.local !== entry.exported ? ` as ${entry.exported}` : ''} } from '${statement.source}'`,
					);
					continue;
				}
				const resolved = resolveModule(target, files, cache).get(entry.local);
				if (resolved) add(entry.exported, resolved.kind, resolved.text, resolved.file);
				else
					add(
						entry.exported,
						entry.type ? 'type' : 'export',
						`export { ${entry.local} } from '${statement.source}'`,
					);
				continue;
			}

			// local re-export: the name came from an import in the same file, or a local declaration
			const imported = parsed.imports.get(entry.exported);
			if (imported) {
				const target = resolveSpecifier(file, imported.source);
				if (target !== null && files.has(target)) {
					const resolved = resolveModule(target, files, cache).get(imported.local);
					if (resolved) {
						add(entry.exported, resolved.kind, resolved.text, resolved.file);
						continue;
					}
				}
				add(
					entry.exported,
					imported.type || entry.type ? 'type' : 're-export',
					`export { ${entry.local} } from '${imported.source}'`,
				);
				continue;
			}

			const local = parsed.declarations.get(entry.exported);
			if (local) add(entry.exported, local.kind, local.text);
			else add(entry.exported, entry.type ? 'type' : 'export', `export { ${entry.exported} }`);
		}
	}

	cache.set(file, exports);
	return exports;
}

function renderReport(modules, files) {
	const cache = new Map();
	const lines = [
		'# mwg API report',
		'',
		'Generated from the built declarations by `npm run api:report`; verified by',
		'`tests/api-surface.test.ts`. Do not edit by hand - run `npm run api:report` after a',
		'build instead.',
		'',
	];

	for (const { subpath, rel } of modules) {
		const exported = resolveModule(rel, files, cache);
		const names = [...exported.keys()].sort((a, b) => a.localeCompare(b));
		lines.push(`## ${subpath === '.' ? 'root (`@datamoc/mw_games`)' : `\`${subpath}\``}`, '');

		if (names.length === 0) {
			lines.push('_no exports_', '');
			continue;
		}

		for (const name of names) {
			const { kind, text } = exported.get(name);
			lines.push(`### \`${name}\` (${kind})`, '');
			lines.push(
				text
					.split('\n')
					.map((line) => (line ? `    ${line}` : ''))
					.join('\n'),
				'',
			);
		}
	}

	return lines.join('\n');
}

/**
 * The P28 machine-readable surface: one entry per export per subpath, sorted by
 * `(subpath, name)`, as `{ name, kind, subpath, declaringModule }`.
 *
 * - `name`/`kind` are the export's name and declaration kind (`class`, `interface`,
 *   `type`, `function`, `const`, `enum`, `namespace`, or a re-export spelling the
 *   report could not resolve further). For a `tools/*` subpath, which ships no
 *   declarations, `name` is the subpath itself and `kind` is `'tool'` (or `'data'`
 *   for the manifest itself, the one shipped JSON file).
 * - `subpath` is the `package.json` exports key a consumer imports (`'.'`, `'./core'`,
 *   `'./tools/browser-smoke'`, ...), including the bare-string `tools/*` entries an
 *   export-object `types` filter never sees.
 * - `declaringModule` is the declaration file that declares the name, relative to the
 *   declarations dir (`core/Random.d.ts`), or the shipped tool script for tools
 *   entries (`tools/browser-smoke.mjs`); a name only re-exported from an external
 *   package (Pixi's `Container` via `two-d/pixi-interop`) names the barrel that
 *   surfaces it instead.
 *
 * A version bump then yields a one-command surface diff:
 * `node tools/api-report.mjs --diff <old api-surface.json> <new api-surface.json>`.
 */
function toolEntries() {
	const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	const tools = [];

	for (const [subpath, target] of Object.entries(pkg.exports)) {
		if (typeof target !== 'string' || target.startsWith('./dist/')) continue;
		const targetPath = typeof target === 'string' ? target : (target.import ?? target.types);
		if (!targetPath) continue;
		tools.push({
			subpath,
			target: targetPath.replace(/^\.\//, '').replace(/\\/g, '/'),
			kind: targetPath.endsWith('.json') ? 'data' : 'tool',
		});
	}

	tools.sort((a, b) => a.subpath.localeCompare(b.subpath));
	return tools;
}

function emitManifest(modules, files) {
	const cache = new Map();
	const entries = [];

	for (const { subpath, rel } of modules) {
		for (const [name, decl] of resolveModule(rel, files, cache)) {
			entries.push({
				name,
				kind: decl.kind,
				subpath,
				declaringModule: (decl.file ?? rel).replace(/\\/g, '/'),
			});
		}
	}

	for (const { subpath, target, kind } of toolEntries()) {
		entries.push({ name: subpath, kind, subpath, declaringModule: target });
	}

	entries.sort((a, b) => a.subpath.localeCompare(b.subpath) || a.name.localeCompare(b.name));
	return entries;
}

/**
 * Tab-indented: prettier formats this repo's JSON with tabs (`useTabs`), and the
 * committed manifest must already be in that style for `format:check` to pass.
 */
function renderManifest(manifest) {
	return `${JSON.stringify(manifest, null, '\t')}\n`;
}

/** added/removed/changed-kind lines between two manifests, for the one-command diff */
function diffManifests(oldEntries, newEntries) {
	const keyOf = (entry) => `${entry.subpath} :: ${entry.name}`;
	const oldByKey = new Map(oldEntries.map((entry) => [keyOf(entry), entry]));
	const newByKey = new Map(newEntries.map((entry) => [keyOf(entry), entry]));
	const lines = [];

	for (const [key, entry] of oldByKey) {
		if (!newByKey.has(key)) lines.push(`- ${key} (${entry.kind}, ${entry.subpath})`);
	}

	for (const [key, entry] of newByKey) {
		const old = oldByKey.get(key);
		if (!old) lines.push(`+ ${key} (${entry.kind}, ${entry.subpath})`);
		else if (old.kind !== entry.kind) lines.push(`~ ${key}: ${old.kind} -> ${entry.kind}`);
	}

	return lines;
}

function main() {
	const args = process.argv.slice(2);
	const check = args.includes('--check');
	const declarationsFlag = args.indexOf('--declarations');
	const declarationsDir = declarationsFlag === -1 ? null : args[declarationsFlag + 1];
	const diffFlag = args.indexOf('--diff');
	if (diffFlag !== -1) {
		const [oldFile, newFile] = args.slice(diffFlag + 1);
		if (!oldFile || !newFile) {
			console.error('usage: node tools/api-report.mjs --diff <old api-surface.json> <new api-surface.json>');
			process.exitCode = 1;
			return;
		}
		const lines = diffManifests(
			JSON.parse(readFileSync(oldFile, 'utf8')),
			JSON.parse(readFileSync(newFile, 'utf8')),
		);
		for (const line of lines) console.log(line);
		console.log(`${lines.length} surface difference(s)`);
		if (lines.length > 0) process.exitCode = 1;
		return;
	}

	const dir = declarationsDir ?? join(root, 'dist');
	const files = readDeclarations(dir);
	const modules = publicModules();
	const rendered = renderReport(modules, files);
	const manifest = renderManifest(emitManifest(modules, files));

	if (!check) {
		writeFileSync(reportPath, rendered);
		writeFileSync(manifestPath, manifest);
		console.log(`wrote ${relative(root, reportPath)} (${files.size} declaration files)`);
		console.log(`wrote ${relative(root, manifestPath)} (${JSON.parse(manifest).length} exports)`);
		return;
	}

	//line endings belong to the checkout, not to the report: a Windows clone reads this file
	//with CRLF where the repository stores LF, and tsc's own emit picks up the platform
	//newline, so compare the text each side would diff as rather than raw bytes
	const committed = readFileSync(reportPath, 'utf8').replace(/\r\n/g, '\n');
	if (committed === rendered.replace(/\r\n/g, '\n')) {
		console.log('API_REPORT.md matches the current declarations.');
		const committedManifest = readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n');
		if (committedManifest !== manifest.replace(/\r\n/g, '\n')) {
			console.error('api-surface.json is out of date. Run `npm run api:report` and commit the result.');
			process.exitCode = 1;
			return;
		}
		console.log('api-surface.json matches the current declarations.');
		return;
	}

	console.error('API_REPORT.md is out of date. Run `npm run api:report` and commit the result.');
	process.exitCode = 1;
}

main();
