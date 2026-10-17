import { version as mwgVersion } from '../version.ts';
import { compileNodes, type MwlCompiledGame } from './compiler.ts';
import type { MwlNode } from './grammar.ts';
import {
	decodePackage,
	PackageError,
	PackageFormatError,
	sha256Hex,
	type PackageFile,
	type PackageLimits,
} from './package-container.ts';
import {
	compareVersions,
	KNOWN_PACKAGE_CAPABILITIES,
	parsePackageDocument,
	satisfiesVersionRange,
	type PackageAction,
	type PackageAnimation,
	type PackageAsset,
	type PackageCharacter,
	type PackageDocument,
	type PackageMusic,
	type PackageScript,
	type PackageSoundEffect,
} from './package-document.ts';

/**
 * A second package with the same id and version, or one whose dependency is not merged.
 *
 * @example
 * ```ts
 * import { PackageConflictError } from '@datamoc/mw_games/mwl';
 *
 * console.log(new PackageConflictError('already merged').name); // 'PackageConflictError'
 * ```
 */
export class PackageConflictError extends PackageError {
	constructor(message: string) {
		super(message);
		this.name = 'PackageConflictError';
	}
}

export interface LoadedPackage {
	readonly document: PackageDocument;
	/** the path of the main document */
	readonly main: string;
	readonly files: readonly PackageFile[];
	/** SHA-256 over every path and digest in the directory: the identity of these exact bytes */
	readonly hash: string;
}

/**
 * Decodes a `.mwp` (digests, limits, paths) and reads its main document. Nothing in the package
 * is executed, fetched or compiled: this is the whole install step.
 *
 * @example
 * ```ts
 * import { encodePackage, loadPackage } from '@datamoc/mw_games/mwl';
 *
 * const source = "[{ tag: 'package', id: 'marta', version: '1.0.0' }]";
 * const bytes = await encodePackage([{ path: 'content.mwl', data: new TextEncoder().encode(source) }]);
 * console.log((await loadPackage(bytes)).document.meta.id); // 'marta'
 * ```
 */
export async function loadPackage(bytes: Uint8Array, limits: Partial<PackageLimits> = {}): Promise<LoadedPackage> {
	const decoded = await decodePackage(bytes, limits);
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const documents: Record<string, string> = {};
	for (const file of decoded.files) {
		if (!file.path.endsWith('.mwl')) continue;
		try {
			documents[file.path] = decoder.decode(file.data);
		} catch {
			throw new PackageFormatError(`"${file.path}" is not UTF-8 text`);
		}
	}
	const document = parsePackageDocument(documents[decoded.main], { file: decoded.main, files: documents });
	const directory = decoded.entries.map((entry) => `${entry.path}\n${entry.sha256}\n`).join('');
	return {
		document,
		main: decoded.main,
		files: decoded.files,
		hash: await sha256Hex(new TextEncoder().encode(directory)),
	};
}

/**
 * The exact identity a save game records: `id@version#sha256`.
 *
 * @example
 * ```ts
 * import { encodePackage, loadPackage, packageRef } from '@datamoc/mw_games/mwl';
 *
 * const source = "[{ tag: 'package', id: 'marta', version: '1.0.0' }]";
 * const bytes = await encodePackage([{ path: 'content.mwl', data: new TextEncoder().encode(source) }]);
 * console.log(packageRef(await loadPackage(bytes)).startsWith('marta@1.0.0#')); // true
 * ```
 */
export function packageRef(pkg: LoadedPackage): string {
	return `${pkg.document.meta.id}@${pkg.document.meta.version}#${pkg.hash}`;
}

/**
 * Splits a reference written by `packageRef` back into its three parts.
 *
 * @example
 * ```ts
 * import { parsePackageRef } from '@datamoc/mw_games/mwl';
 *
 * console.log(parsePackageRef('marta@1.0.0#abc').version); // '1.0.0'
 * ```
 */
export function parsePackageRef(ref: string): { id: string; version: string; hash: string } {
	const match = /^([A-Za-z_][\w.-]*)@(\d+\.\d+\.\d+[\w.+-]*)#([0-9a-f]{64}|[\w-]+)$/.exec(ref);
	if (!match) throw new PackageFormatError(`"${ref}" is not an id@version#sha256 package reference`);
	return { id: match[1], version: match[2], hash: match[3] };
}

// ---------------------------------------------------------------- policy

export interface PackagePolicy {
	/** capabilities this game grants; a package asking for any other is refused */
	readonly allow: readonly string[];
	/** a capability mwg does not know is refused (default) or, with `false`, ignored */
	readonly refuseUnknown?: boolean;
	/** versions this game provides; `mwg` defaults to the running mwg, `retroAudio` to none */
	readonly provides?: { readonly mwg?: string; readonly retroAudio?: string };
}

/**
 * What a package asks for: its declared capabilities plus `script` when any script carries code.
 *
 * @example
 * ```ts
 * import { parsePackageDocument, requestedCapabilities } from '@datamoc/mw_games/mwl';
 *
 * const document = parsePackageDocument("[{ tag: 'package', id: 'p', version: '1.0.0' }, { tag: 'script', id: 's', on: 'start', code: '1' }]");
 * console.log(requestedCapabilities(document)); // ['script']
 * ```
 */
export function requestedCapabilities(document: PackageDocument): string[] {
	const capabilities = new Set(document.meta.requires.capabilities);
	if (document.scripts.some((script) => script.code !== undefined)) capabilities.add('script');
	return [...capabilities].sort();
}

/**
 * Evaluates a package against what a game accepts and returns readable refusals; an empty list
 * means accepted. Nothing is executed or fetched: the decision rests on the declared requests.
 *
 * @example
 * ```ts
 * import { checkPackagePolicy, parsePackageDocument } from '@datamoc/mw_games/mwl';
 *
 * const document = parsePackageDocument(
 *   "[{ tag: 'package', id: 'marta', version: '1.0.0', requires: { capabilities: ['script'] } }]",
 * );
 * console.log(checkPackagePolicy(document, { allow: ['audio'] })); // ['asks for the "script" capability, which this game does not allow']
 * ```
 */
export function checkPackagePolicy(document: PackageDocument, policy: PackagePolicy): string[] {
	const refusals: string[] = [];
	const { requires } = document.meta;
	for (const capability of requestedCapabilities(document)) {
		const known = KNOWN_PACKAGE_CAPABILITIES.includes(capability);
		if (!policy.allow.includes(capability) && (known || policy.refuseUnknown !== false))
			refusals.push(`asks for the "${capability}" capability, which this game does not allow`);
	}
	const mwg = policy.provides?.mwg ?? mwgVersion;
	if (requires.mwg !== undefined && !rangeHolds(mwg, requires.mwg, 'requires.mwg', refusals))
		refusals.push(`requires mwg ${requires.mwg}, this game runs ${mwg}`);
	if (requires.retroAudio !== undefined) {
		const provided = policy.provides?.retroAudio;
		if (provided === undefined)
			refusals.push(`requires retro-audio ${requires.retroAudio}, which this game does not provide`);
		else if (!rangeHolds(provided, requires.retroAudio, 'requires.retroAudio', refusals))
			refusals.push(`requires retro-audio ${requires.retroAudio}, this game provides ${provided}`);
	}
	return refusals;
}

/** true when the range holds; a malformed range is reported once and counts as holding, to avoid a second message */
export function rangeHolds(version: string, range: string, label: string, problems: string[]): boolean {
	try {
		return satisfiesVersionRange(version, range);
	} catch {
		problems.push(`${label} "${range}" is not a valid version range`);
		return true;
	}
}

// ---------------------------------------------------------------- merge and namespaces

export interface PackageSet {
	readonly packages: readonly LoadedPackage[];
}

/**
 * Adds a package to a content set (a new set; the old one is untouched). Dependencies named by
 * `import` must already be in the set. Two versions of one package may coexist: the newest owns
 * the plain `packageId:id` names, every version answers to `packageId@version:id`.
 *
 * @example
 * ```ts
 * import { encodePackage, loadPackage, mergePackage, packageContent } from '@datamoc/mw_games/mwl';
 *
 * const source = "[{ tag: 'package', id: 'marta', version: '1.0.0' }, { tag: 'sound_effect', id: 'ouch', chip: 'sn76489' }]";
 * const bytes = await encodePackage([{ path: 'content.mwl', data: new TextEncoder().encode(source) }]);
 * const set = mergePackage(await loadPackage(bytes));
 * console.log(Object.keys(packageContent(set).soundEffects)); // ['marta:ouch']
 * ```
 */
export function mergePackage(pkg: LoadedPackage, into: PackageSet = { packages: [] }): PackageSet {
	const { id, version } = pkg.document.meta;
	if (into.packages.some((other) => other.document.meta.id === id && other.document.meta.version === version))
		throw new PackageConflictError(`package ${id}@${version} is already in the content set`);
	for (const dependency of pkg.document.imports) {
		if (dependency.package === undefined) continue;
		const present = into.packages.filter((other) => other.document.meta.id === dependency.package);
		if (
			!present.some(
				(other) =>
					dependency.version === undefined ||
					satisfiesVersionRange(other.document.meta.version, dependency.version),
			)
		)
			throw new PackageConflictError(
				`${id}@${version} imports package ${dependency.package}${dependency.version ? ` ${dependency.version}` : ''}, which is not merged`,
			);
	}
	return { packages: [...into.packages, pkg] };
}

/** the name prefix of a package in a set: the plain id for the newest version, `id@version` for older ones */
function prefixOf(set: PackageSet, pkg: LoadedPackage): string {
	const { id, version } = pkg.document.meta;
	const newest = set.packages
		.filter((other) => other.document.meta.id === id)
		.every((other) => compareVersions(version, other.document.meta.version) >= 0);
	return newest ? id : `${id}@${version}`;
}

type Owned<T> = Omit<T, 'id'> & { readonly id: string; readonly package: string };

export interface PackageContent {
	readonly assets: Readonly<Record<string, Owned<PackageAsset>>>;
	readonly characters: Readonly<Record<string, Owned<PackageCharacter>>>;
	readonly animations: Readonly<Record<string, Owned<PackageAnimation>>>;
	readonly soundEffects: Readonly<Record<string, Owned<PackageSoundEffect>>>;
	readonly music: Readonly<Record<string, Owned<PackageMusic>>>;
	readonly scripts: Readonly<Record<string, Owned<PackageScript>>>;
}

/**
 * The namespaced view of a set: every id becomes `packageId:id`, and every reference written
 * without a prefix is resolved to the same package first. A reference that already has a prefix
 * points at another package and is left alone. Each item records the package it came from.
 *
 * @example
 * ```ts
 * import { encodePackage, loadPackage, mergePackage, packageContent } from '@datamoc/mw_games/mwl';
 *
 * const source = "[{ tag: 'package', id: 'marta', version: '1.0.0' }, { tag: 'music', id: 'theme', src: 'song' }]";
 * const bytes = await encodePackage([{ path: 'content.mwl', data: new TextEncoder().encode(source) }]);
 * console.log(packageContent(mergePackage(await loadPackage(bytes))).music['marta:theme']?.src); // 'marta:song'
 * ```
 */
export function packageContent(set: PackageSet): PackageContent {
	const out = {
		assets: {} as Record<string, Owned<PackageAsset>>,
		characters: {} as Record<string, Owned<PackageCharacter>>,
		animations: {} as Record<string, Owned<PackageAnimation>>,
		soundEffects: {} as Record<string, Owned<PackageSoundEffect>>,
		music: {} as Record<string, Owned<PackageMusic>>,
		scripts: {} as Record<string, Owned<PackageScript>>,
	};
	for (const pkg of set.packages) {
		const prefix = prefixOf(set, pkg);
		const owner = `${pkg.document.meta.id}@${pkg.document.meta.version}`;
		const key = (id: string): string => `${prefix}:${id}`;
		const ref = (name: string): string => (name.includes(':') ? name : key(name));
		const { document } = pkg;
		for (const asset of document.assets)
			out.assets[key(asset.id)] = { ...asset, id: key(asset.id), path: assetPath(prefix, asset), package: owner };
		for (const item of document.animations)
			out.animations[key(item.id)] = {
				...item,
				id: key(item.id),
				events: Object.fromEntries(
					Object.entries(item.events).map(([frame, event]) => [frame, { sound: ref(event.sound) }]),
				),
				package: owner,
			};
		for (const item of document.soundEffects)
			out.soundEffects[key(item.id)] = { ...item, id: key(item.id), package: owner };
		for (const item of document.music)
			out.music[key(item.id)] = {
				...item,
				id: key(item.id),
				src: ref(item.src),
				...(item.fallback === undefined ? {} : { fallback: ref(item.fallback) }),
				package: owner,
			};
		for (const item of document.scripts)
			out.scripts[key(item.id)] = {
				...item,
				id: key(item.id),
				do: item.do.map((action) => qualifyAction(action, ref)),
				package: owner,
			};
		for (const item of document.characters)
			out.characters[key(item.id)] = {
				...item,
				id: key(item.id),
				...(item.portrait === undefined ? {} : { portrait: ref(item.portrait) }),
				...(item.sprite === undefined ? {} : { sprite: { ...item.sprite, image: ref(item.sprite.image) } }),
				...(item.theme === undefined ? {} : { theme: ref(item.theme) }),
				animations: mapValues(item.animations, ref),
				sounds: mapValues(item.sounds, ref),
				scripts: item.scripts.map(ref),
				package: owner,
			};
	}
	return out;
}

function mapValues(record: Readonly<Record<string, string>>, map: (value: string) => string): Record<string, string> {
	return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, map(value)]));
}

function qualifyAction(action: PackageAction, ref: (name: string) => string): PackageAction {
	const sound = action.attributes.sound;
	return action.tag === 'play' && typeof sound === 'string'
		? { tag: action.tag, attributes: { ...action.attributes, sound: ref(sound) } }
		: action;
}

/** the logical path the game's asset step serves a package file under */
function assetPath(prefix: string, asset: PackageAsset): string {
	return `${prefix}/${asset.path}`;
}

/** the unit_type attributes a character's stats can set; the rest stay on the character record */
const UNIT_TYPE_STATS = [
	'hitpoints',
	'movement',
	'level',
	'experience',
	'cost',
	'alignment',
	'race',
	'usage',
	'movetype',
	'movement_type',
];

/**
 * Compiles a content set: each character expands into a `unit_type` named `packageId:id`, and
 * the result is an ordinary compiled game, with the packages' `_()` strings in `messages` and
 * the packages' media paths in `assets`. A set with no package compiles to an empty game.
 *
 * @example
 * ```ts
 * import { compilePackages, encodePackage, loadPackage, mergePackage } from '@datamoc/mw_games/mwl';
 *
 * const source = "[{ tag: 'package', id: 'marta', version: '1.0.0' }, { tag: 'character', id: 'marta', hitpoints: 28 }]";
 * const bytes = await encodePackage([{ path: 'content.mwl', data: new TextEncoder().encode(source) }]);
 * console.log(compilePackages(mergePackage(await loadPackage(bytes))).roots[0]?.attributes.id); // 'marta:marta'
 * ```
 */
export function compilePackages(set: PackageSet): MwlCompiledGame {
	const nodes: MwlNode[] = [];
	const messages = new Set<string>();
	const assets = new Set<string>();
	for (const pkg of set.packages) {
		const { document } = pkg;
		const prefix = prefixOf(set, pkg);
		const location = { file: `${pkg.document.meta.id}/${pkg.main}`, line: 1, column: 1 };
		for (const message of document.messages) messages.add(message);
		for (const asset of document.assets) assets.add(assetPath(prefix, asset));
		for (const character of document.characters) {
			const attributes: Record<string, string> = { id: `${prefix}:${character.id}` };
			if (character.name !== undefined) attributes.name = character.name;
			if (character.description !== undefined) attributes.description = character.description;
			for (const stat of UNIT_TYPE_STATS)
				if (character.stats[stat] !== undefined) attributes[stat] = String(character.stats[stat]);
			const pathOf = (id: string): string | undefined => {
				const asset = document.assets.find((candidate) => candidate.id === id);
				return asset ? assetPath(prefix, asset) : undefined;
			};
			const image = character.sprite && pathOf(character.sprite.image);
			if (image) attributes.image = image;
			const profile = character.portrait && pathOf(character.portrait);
			if (profile) attributes.profile = profile;
			const damage = character.stats.attack;
			nodes.push({
				tag: 'unit_type',
				attributes,
				children:
					typeof damage === 'number'
						? [
								{
									tag: 'attack',
									attributes: { id: 'attack', damage: String(damage) },
									children: [],
									location,
								},
							]
						: [],
				location,
				gettext: [],
			});
		}
	}
	const game = compileNodes(nodes);
	return { ...game, messages: [...messages].sort(), assets: [...assets].sort() };
}

/**
 * The credits text for the packages present, in the format of the `CREDITS.txt` the asset step
 * writes: one block per package and per asset, each with its licence and, when known, its source.
 *
 * @example
 * ```ts
 * import { generateCredits, parsePackageDocument } from '@datamoc/mw_games/mwl';
 *
 * const document = parsePackageDocument(
 *   "[{ tag: 'package', id: 'marta', version: '1.0.0', author: 'Ada', license: 'CC-BY-4.0' }]",
 * );
 * console.log(generateCredits([document])); // 'marta 1.0.0 by Ada\nLicense: CC-BY-4.0\n'
 * ```
 */
export function generateCredits(documents: readonly PackageDocument[]): string {
	const blocks: string[] = [];
	for (const { meta, assets } of [...documents].sort((a, b) =>
		a.meta.id < b.meta.id ? -1 : a.meta.id > b.meta.id ? 1 : 0,
	)) {
		const author = meta.author ? ` by ${meta.author}` : '';
		if (meta.license) blocks.push(`${meta.id} ${meta.version}${author}\nLicense: ${meta.license}`);
		for (const asset of [...assets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
			if (!asset.license) continue;
			const lines = [`${asset.id} (${meta.id})${author}`, `License: ${asset.license}`];
			if (asset.source) lines.push(asset.source);
			blocks.push(lines.join('\n'));
		}
	}
	return blocks.length ? `${blocks.join('\n\n')}\n` : '';
}
