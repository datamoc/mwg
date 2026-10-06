#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The consumer adoption auditor: the mechanism behind "every export is adopted or
 * explicitly reasoned", shipped so no consumer rebuilds the gate by hand.
 *
 * A framework that ships its doctrine as prose makes every consumer rebuild the same
 * audit - which exports are used, which are deliberately not, which local definitions
 * shadow framework names, which directories may only import types, which subpaths are
 * denied, and how many files may reach past the facade - differently, and let it rot.
 * This tool is the shared checker; every value expressing *policy* (the reasons, the
 * globs, the budgets) stays in the consumer repository.
 *
 * It reads the P28 manifest (`api-surface.json`: `{ name, kind, subpath,
 * declaringModule }` per export), the consumer's own import rows and local
 * definitions (via `scanImports`/`scanLocals`, or any producer of the same shapes),
 * and a consumer-authored config:
 *
 * ```json
 * {
 * 	"reasons": {
 * 		"./board :: AlphaBetaGame": "chess engine, no board game in this project",
 * 		"local :: World": "documented collision: the game's own map container, never the framework export"
 * 	},
 * 	"denySubpaths": ["./three-d"],
 * 	"typeOnlyDirs": ["src/simulation"],
 * 	"budgets": [{ "match": "./two-d/pixi-interop", "limit": 37, "reason": "escape hatch, one reason per file" }]
 * }
 * ```
 *
 * Reasons are keyed either by export (`<subpath> :: <name>`, see `adoptionKey`) or by
 * `local :: <Name>` for a documented shadowing collision. The audit reports, with
 * `file:line` and a non-zero exit:
 *
 * - `unadopted` - a manifest export the consumer neither imports nor reasons about;
 * - `stale-reason` - a reason naming no manifest export and no local definition;
 * - `collision` - a local definition shadowing a never-imported manifest export with
 *   no `local ::` reason documenting it;
 * - `denied-subpath` - an import from a denied subpath (a denied prefix also covers
 *   its children: `./two-d` covers `./two-d/render`);
 * - `type-only` - a runtime import from a file under a type-only directory;
 * - `budget` - more importing files than a budget allows, naming the first file past
 *   the limit.
 */

export function adoptionKey(subpath, name) {
	return `${subpath} :: ${name}`;
}

function isUnder(file, dir) {
	return file === dir || file.startsWith(`${dir}/`);
}

function subpathMatches(subpath, match) {
	return subpath === match || subpath.startsWith(`${match}/`);
}

/**
 * Every `import ... from '@datamoc/mw_games/<sub>'` row in the given files, as
 * `{ file, line, subpath, names, typeOnly }`. `import type` rows are type-only; a
 * mixed value/type named list counts as runtime (conservative: the file still pulls
 * the module in at runtime). A default or namespace import carries no names, so it
 * adopts the whole subpath.
 */
export function scanImports(files) {
	const rows = [];
	const pattern =
		/^\s*import\s+(type\s+)?(?:\*\s+as\s+(\w+)|{([^}]*)}|(\w+))?\s*from\s*['"]@datamoc\/mw_games(\/[^'"]*)?['"]/gm;

	for (const { path, text } of files) {
		for (const match of text.matchAll(pattern)) {
			const line = text.slice(0, match.index).split('\n').length;
			const subpath = match[5] === undefined ? '.' : `.${match[5]}`;
			const names = (match[3] ?? '')
				.split(',')
				.map((entry) =>
					entry
						.trim()
						.replace(/^type\s+/, '')
						.split(/\s+as\s+/)
						.pop()
						.trim(),
				)
				.filter(Boolean);
			rows.push({ file: path, line, subpath, names, typeOnly: Boolean(match[1]) });
		}
	}

	return rows;
}

/**
 * Every top-level `interface`/`type`/`class`/`function`/`const`/`enum` the consumer
 * defines itself, as `{ name, file, line }` - the shadowing candidates.
 */
export function scanLocals(files) {
	const locals = [];
	const pattern = /^(?:export\s+)?(?:interface|type|class|function|const|enum)\s+([A-Za-z0-9_]+)/gm;

	for (const { path, text } of files) {
		for (const match of text.matchAll(pattern)) {
			const line = text.slice(0, match.index).split('\n').length;
			locals.push({ name: match[1], file: path, line });
		}
	}

	return locals;
}

/**
 * Runs every rule over the manifest, the consumer's import rows and locals, and its
 * config. Returns findings in a stable order (rule, then message); empty means the
 * adoption is fully accounted for.
 */
export function auditAdoptions(manifest, imports, locals, config) {
	const findings = [];
	const reasons = config.reasons ?? {};
	const manifestKeys = new Set(manifest.map((entry) => adoptionKey(entry.subpath, entry.name)));
	const importedKeys = new Set();
	const starSubpaths = new Set();
	for (const row of imports) {
		for (const name of row.names) importedKeys.add(adoptionKey(row.subpath, name));
		if (row.names.length === 0) starSubpaths.add(row.subpath);
	}

	for (const entry of manifest) {
		const key = adoptionKey(entry.subpath, entry.name);
		if (!importedKeys.has(key) && !starSubpaths.has(entry.subpath) && !(key in reasons)) {
			findings.push({
				rule: 'unadopted',
				message: `${key} is neither imported nor reasoned (${entry.kind}, ${entry.declaringModule})`,
			});
		}
	}

	for (const key of Object.keys(reasons)) {
		if (key.startsWith('local :: ')) {
			const name = key.slice('local :: '.length);
			if (!locals.some((local) => local.name === name)) {
				findings.push({ rule: 'stale-reason', message: `${key} documents no local definition` });
			}
			continue;
		}
		if (!manifestKeys.has(key)) {
			findings.push({ rule: 'stale-reason', message: `${key} names no manifest export` });
		}
	}

	const exportedNames = new Set(manifest.map((entry) => entry.name));
	for (const local of locals) {
		if (!exportedNames.has(local.name)) continue;
		const shadowed = manifest
			.filter((entry) => entry.name === local.name)
			.every((entry) => !importedKeys.has(adoptionKey(entry.subpath, entry.name)));
		if (shadowed && !(`local :: ${local.name}` in reasons)) {
			findings.push({
				rule: 'collision',
				message: `${local.name} shadows a never-imported framework export with no documented reason`,
				file: local.file,
				line: local.line,
			});
		}
	}

	for (const denied of config.denySubpaths ?? []) {
		for (const row of imports) {
			if (subpathMatches(row.subpath, denied)) {
				findings.push({
					rule: 'denied-subpath',
					message: `${row.subpath} is denied by consumer config`,
					file: row.file,
					line: row.line,
				});
			}
		}
	}

	for (const dir of config.typeOnlyDirs ?? []) {
		for (const row of imports) {
			if (!row.typeOnly && isUnder(row.file, dir)) {
				findings.push({
					rule: 'type-only',
					message: `${row.file} may only import types, but imports ${row.subpath} at runtime`,
					file: row.file,
					line: row.line,
				});
			}
		}
	}

	for (const budget of config.budgets ?? []) {
		const offenders = [];
		for (const row of imports) {
			if (!subpathMatches(row.subpath, budget.match) || row.typeOnly) continue;
			if (!offenders.some((offender) => offender.file === row.file)) offenders.push(row);
		}
		if (offenders.length > budget.limit) {
			const firstPast = offenders[budget.limit];
			findings.push({
				rule: 'budget',
				message: `${offenders.length} files import past ${budget.match} (limit ${budget.limit}: ${budget.reason})`,
				file: firstPast.file,
				line: firstPast.line,
			});
		}
	}

	findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message));
	return findings;
}

/** `file:line: [rule] message`, or `[rule] message` for manifest-level findings */
export function formatFindings(findings) {
	return findings.map((finding) =>
		finding.file === undefined
			? `[${finding.rule}] ${finding.message}`
			: `${finding.file}:${finding.line ?? 0}: [${finding.rule}] ${finding.message}`,
	);
}

function main() {
	const args = process.argv.slice(2);
	const valueOf = (flag) => {
		const index = args.indexOf(flag);
		return index === -1 ? null : (args[index + 1] ?? null);
	};
	const manifestFile = valueOf('--manifest');
	const importsFile = valueOf('--imports');
	const localsFile = valueOf('--locals');
	const configFile = valueOf('--config');

	if (!manifestFile || !importsFile || !localsFile || !configFile) {
		console.error(
			'usage: mwg-audit-adoptions --manifest api-surface.json --imports imports.json --locals locals.json --config audit.json',
		);
		process.exitCode = 1;
		return;
	}

	const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
	const imports = JSON.parse(readFileSync(importsFile, 'utf8'));
	const locals = JSON.parse(readFileSync(localsFile, 'utf8'));
	const config = JSON.parse(readFileSync(configFile, 'utf8'));
	const lines = formatFindings(auditAdoptions(manifest, imports, locals, config));
	for (const line of lines) console.log(line);
	console.log(`${lines.length} adoption finding(s)`);
	if (lines.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
