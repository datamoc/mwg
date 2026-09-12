import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = 'sbom.cdx.json';
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
 */
export function buildSbom(packageJson, lockfile) {
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

	const rootLicenses = licenseFor(packageJson.license);
	const metadata = {
		tools: {
			components: [
				{ type: 'application', group: 'datamoc', name: 'tools/sbom.mjs', version: packageJson.version },
			],
		},
		component: {
			type: 'library',
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

/** the exact committed bytes: two-space JSON and a trailing newline */
export function serialize(bom) {
	return `${JSON.stringify(bom, null, 2)}\n`;
}

async function readJson(path) {
	return JSON.parse(await readFile(path, 'utf8'));
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	const check = process.argv.includes('--check');
	const bom = buildSbom(
		await readJson(resolve(ROOT, 'package.json')),
		await readJson(resolve(ROOT, 'package-lock.json')),
	);
	const json = serialize(bom);
	const path = resolve(ROOT, OUTPUT);
	const summary = `CycloneDX ${SPEC_VERSION}, ${bom.components.length} components`;

	if (check) {
		const committed = await readFile(path, 'utf8').catch(() => undefined);
		if (committed !== json) {
			console.error(`${OUTPUT} is out of date with package-lock.json. Run "npm run sbom" and commit the result.`);
			process.exitCode = 1;
		} else {
			console.log(`${OUTPUT} matches package-lock.json (${summary}).`);
		}
	} else {
		await writeFile(path, json, 'utf8');
		console.log(`wrote ${OUTPUT} (${summary})`);
	}
}
