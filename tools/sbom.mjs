#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT = 'sbom.cdx.json';
/** this tool's own package, named in every document's `metadata.tools` whichever project it describes */
const TOOL = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const SPEC_VERSION = '1.6';

const HASH_ALGORITHMS = { sha512: 'SHA-512', sha384: 'SHA-384', sha256: 'SHA-256', sha1: 'SHA-1' };

/** the RFC 4122 DNS namespace, undashed because it is only ever fed to the hash as bytes */
const DNS_NAMESPACE = '6ba7b8109dad11d180b400c04fd430c8';

/**
 * Package URL for an npm package, the SBOM's `bom-ref` as well. A scoped name's `@` is
 * percent-encoded but its `/` is not, which is what the purl spec's own npm examples do
 * (`pkg:npm/%40angular/animation@12.3.1`).
 */
export function purlFor(name, version) {
	const encoded = name.startsWith('@') ? `%40${name.slice(1)}` : name;
	return `pkg:npm/${encoded}@${version}`;
}

/**
 * npm's `integrity` field (`sha512-<base64>`, sometimes several space-separated) as CycloneDX
 * hashes. CycloneDX carries a hash as lowercase hex, so the base64 is decoded and re-encoded.
 */
export function hashesFromIntegrity(integrity) {
	if (typeof integrity !== 'string') return [];
	const hashes = [];
	for (const part of integrity.split(/\s+/)) {
		const dash = part.indexOf('-');
		if (dash < 0) continue;
		const alg = HASH_ALGORITHMS[part.slice(0, dash).toLowerCase()];
		if (alg === undefined) continue;
		hashes.push({ alg, content: Buffer.from(part.slice(dash + 1), 'base64').toString('hex') });
	}
	return hashes;
}

/** an SPDX id stays an `id`; anything with spaces or an expression stays a `name` instead */
function licenseFor(license) {
	if (typeof license !== 'string' || license.trim() === '') return undefined;
	const value = license.trim();
	return /^[A-Za-z0-9.+-]+$/.test(value) ? { license: { id: value } } : { license: { name: value } };
}

/** the package a lockfile location holds: `node_modules/@scope/name` is `@scope/name` */
function nameFromLocation(location) {
	const marker = 'node_modules/';
	return location.slice(location.lastIndexOf(marker) + marker.length);
}

/** node resolution over a lockfile: the nearest `node_modules/<name>` at or above `location` */
function resolveDependency(packages, location, name) {
	let dir = location;
	for (;;) {
		const candidate = dir === '' ? `node_modules/${name}` : `${dir}/node_modules/${name}`;
		if (packages[candidate] !== undefined) return candidate;
		if (dir === '') return undefined;
		const marker = dir.lastIndexOf('/node_modules/');
		dir = marker < 0 ? '' : dir.slice(0, marker);
	}
}

function scopeOf(entry) {
	if (entry.dev === true) return 'excluded';
	if (entry.optional === true) return 'optional';
	return 'required';
}

/** required beats optional beats excluded when one purl is reachable more than one way */
const SCOPE_RANK = { required: 0, optional: 1, excluded: 2 };

/**
 * A version-5 (RFC 4122 name-based) UUID in the DNS namespace. The same name always hashes to the
 * same UUID, which is what lets `serialNumber` below be derived instead of invented; twelve lines
 * of SHA-1 beats a dependency for the one UUID this tool will ever need.
 */
function uuidv5(name) {
	const bytes = createHash('sha1')
		.update(Buffer.from(DNS_NAMESPACE, 'hex'))
		.update(name, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Builds a CycloneDX document from `package.json` and `package-lock.json` alone, so the SBOM is
 * reproducible and needs no network access. Every locked package is a component (dev-only ones
 * marked `excluded`, since they are not part of a published install) and the lockfile's own
 * resolution is turned into the dependency graph. Output is deterministic: components and edges
 * are sorted and `serialNumber` is a UUID derived from the document's own content rather than
 * from the clock, so the committed file can be checked for drift the way `API_REPORT.md` and
 * `PROJECT_STATS.json` already are: two BOMs that share a serial are the same BOM, and any change
 * to a component, a hash or an edge produces a new one.
 *
 * `metadata.timestamp` is deliberately absent. A generation time stamped into a committed file is
 * either a drift-check failure on every run or one stale moment every later read is dated to,
 * while `CHANGELOG.md` already dates each version.
 *
 * `type` is the described component's CycloneDX type: `'library'` for this framework,
 * `'application'` for a game (`mwg-sbom` picks it from whether the project is `private`).
 */
export function buildSbom(packageJson, lockfile, { type = 'library' } = {}) {
	const packages = lockfile.packages ?? {};
	const rootPurl = purlFor(packageJson.name, packageJson.version);

	const byPurl = new Map();
	for (const [location, entry] of Object.entries(packages)) {
		if (location === '' || entry.link === true || typeof entry.version !== 'string') continue;
		const name = typeof entry.name === 'string' ? entry.name : nameFromLocation(location);
		const purl = purlFor(name, entry.version);
		const scope = scopeOf(entry);
		const existing = byPurl.get(purl);
		if (existing !== undefined) {
			if (SCOPE_RANK[scope] < SCOPE_RANK[existing.scope]) existing.scope = scope;
			continue;
		}
		const component = { type: 'library', 'bom-ref': purl, name, version: entry.version, purl, scope };
		const hashes = hashesFromIntegrity(entry.integrity);
		if (hashes.length > 0) component.hashes = hashes;
		const licenses = licenseFor(entry.license);
		if (licenses !== undefined) component.licenses = [licenses];
		byPurl.set(purl, component);
	}

	const components = [...byPurl.values()].sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));

	const edges = new Map();
	const addEdge = (from, to) => {
		if (!edges.has(from)) edges.set(from, new Set());
		edges.get(from).add(to);
	};
	for (const [location, entry] of Object.entries(packages)) {
		if (location !== '' && (entry.link === true || typeof entry.version !== 'string')) continue;
		const from =
			location === ''
				? rootPurl
				: purlFor(typeof entry.name === 'string' ? entry.name : nameFromLocation(location), entry.version);
		const declared = {
			...(entry.dependencies ?? {}),
			...(entry.devDependencies ?? {}),
			...(entry.optionalDependencies ?? {}),
			...(entry.peerDependencies ?? {}),
		};
		for (const name of Object.keys(declared)) {
			const target = resolveDependency(packages, location, name);
			const targetEntry = target === undefined ? undefined : packages[target];
			if (targetEntry === undefined || typeof targetEntry.version !== 'string') continue;
			const targetName = typeof targetEntry.name === 'string' ? targetEntry.name : nameFromLocation(target);
			addEdge(from, purlFor(targetName, targetEntry.version));
		}
	}

	const refs = [rootPurl, ...components.map((component) => component['bom-ref'])];
	const dependencies = [...new Set(refs)]
		.sort()
		.map((ref) => ({ ref, dependsOn: [...(edges.get(ref) ?? [])].sort() }));

	return document(packageJson, type, components, dependencies);
}

/** the envelope both builders share, with the content-derived serial */
function document(packageJson, type, components, dependencies) {
	const rootPurl = purlFor(packageJson.name, packageJson.version);
	const rootLicenses = licenseFor(packageJson.license);
	const metadata = {
		tools: {
			components: [{ type: 'application', group: 'datamoc', name: 'tools/sbom.mjs', version: TOOL.version }],
		},
		component: {
			type,
			'bom-ref': rootPurl,
			name: packageJson.name,
			version: packageJson.version,
			purl: rootPurl,
			...(typeof packageJson.description === 'string' ? { description: packageJson.description } : {}),
			...(rootLicenses === undefined ? {} : { licenses: [rootLicenses] }),
		},
	};
	return {
		bomFormat: 'CycloneDX',
		specVersion: SPEC_VERSION,
		serialNumber: `urn:uuid:${uuidv5(JSON.stringify({ metadata, components, dependencies }))}`,
		version: 1,
		metadata,
		components,
		dependencies,
	};
}

/**
 * The package a bundled module came from: the last `node_modules/<name>` (or `<@scope/name>`) in
 * its path, with the directory holding that package's `package.json`. Null for the game's own
 * source and for bundler-virtual modules.
 */
export function packageOfModule(id) {
	const path = id.replace(/^\0/, '').split('?')[0].split(sep).join('/');
	const marker = path.lastIndexOf('/node_modules/');
	if (marker < 0) return null;
	const parts = path.slice(marker + '/node_modules/'.length).split('/');
	const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
	if (!name || name.startsWith('.')) return null;
	return { name, dir: `${path.slice(0, marker)}/node_modules/${name}` };
}

/**
 * The SBOM of what a build actually ships, rather than of `node_modules` (item 380): a game is
 * one tree-shaken bundle, so the lockfile lists tooling that never reaches a player and cannot say
 * which packages did. `modules` are the bundle's module ids (vite's module graph, collected by
 * `mwgPage()`), each package they come from becomes a `required` library component with its
 * version and licence read from its own `package.json`, and `files` are the shipped files as
 * `file` components carrying their SHA-256.
 *
 * @param {{ packageJson: object, modules: string[], files: { path: string, sha256: string }[] }} input
 */
export function buildArtifactSbom({ packageJson, modules, files }) {
	const packages = new Map();
	for (const id of modules) {
		const found = packageOfModule(id);
		if (!found || packages.has(found.dir)) continue;
		let manifest;
		try {
			manifest = JSON.parse(readFileSync(join(found.dir, 'package.json'), 'utf8'));
		} catch {
			continue;
		}
		packages.set(found.dir, {
			name: manifest.name ?? found.name,
			version: manifest.version,
			license: manifest.license,
		});
	}
	const libraries = new Map();
	for (const { name, version, license } of packages.values()) {
		if (typeof version !== 'string') continue;
		const purl = purlFor(name, version);
		const licenses = licenseFor(license);
		libraries.set(purl, {
			type: 'library',
			'bom-ref': purl,
			name,
			version,
			purl,
			scope: 'required',
			...(licenses === undefined ? {} : { licenses: [licenses] }),
		});
	}
	const fileComponents = [...files]
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
		.map(({ path, sha256 }) => ({
			type: 'file',
			'bom-ref': `file:${path}`,
			name: path,
			hashes: [{ alg: 'SHA-256', content: sha256 }],
		}));
	const components = [...[...libraries.values()].sort((a, b) => (a.purl < b.purl ? -1 : 1)), ...fileComponents];
	const rootPurl = purlFor(packageJson.name, packageJson.version);
	const dependencies = [{ ref: rootPurl, dependsOn: [...libraries.keys()].sort() }];
	return document(packageJson, 'application', components, dependencies);
}

/** SHA-256 of every file under `dist` a player receives: precompressed siblings and the SBOM itself left out */
export async function shippedFiles(dist) {
	const { walk } = await import('./compile-resources.mjs');
	const files = [];
	for await (const file of walk(dist)) {
		const path = relative(dist, file).split(sep).join('/');
		if (/\.(gz|br|xz)$/.test(path) || path.endsWith('.cdx.json')) continue;
		files.push({
			path,
			sha256: createHash('sha256')
				.update(await readFile(file))
				.digest('hex'),
		});
	}
	return files;
}

/** the exact committed bytes: two-space JSON and a trailing newline */
export function serialize(bom) {
	return `${JSON.stringify(bom, null, 2)}\n`;
}

async function readJson(path) {
	return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * `mwg-sbom [project folder] [--out=<file>] [--check]`: the lockfile SBOM of any npm project,
 * this framework included (`npm run sbom` here). A `private` project is described as an
 * `application`, anything else as a `library`. `--check` compares instead of writing, for CI.
 */
async function main(argv) {
	const root = resolve(argv.find((arg) => !arg.startsWith('--')) ?? '.');
	const out = resolve(root, argv.find((arg) => arg.startsWith('--out='))?.slice(6) ?? OUTPUT);
	const packageJson = await readJson(join(root, 'package.json'));
	const bom = buildSbom(packageJson, await readJson(join(root, 'package-lock.json')), {
		type: packageJson.private === true ? 'application' : 'library',
	});
	const json = serialize(bom);
	const name = relative(root, out) || out;
	const summary = `CycloneDX ${SPEC_VERSION}, ${bom.components.length} components`;

	if (argv.includes('--check')) {
		const committed = await readFile(out, 'utf8').catch(() => undefined);
		//CRLF is a Windows checkout's doing, not a difference in the BOM itself (and a missing
		//file still reads as out of date: '' never equals the serialized BOM)
		if ((committed ?? '').replace(/\r\n/g, '\n') !== json.replace(/\r\n/g, '\n')) {
			console.error(`${name} is out of date with package-lock.json. Run "npm run sbom" and commit the result.`);
			process.exitCode = 1;
		} else {
			console.log(`${name} matches package-lock.json (${summary}).`);
		}
	} else {
		await writeFile(out, json, 'utf8');
		console.log(`wrote ${name} (${summary})`);
	}
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
	await main(process.argv.slice(2));
