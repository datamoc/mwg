import { version as mwgVersion } from '../version.ts';
import { PackageError, sha256Hex, type PackageLimits } from './package-container.ts';
import { PACKAGE_MEDIA_KINDS, type PackageDocument } from './package-document.ts';
import {
	checkPackagePolicy,
	loadPackage,
	packageRef,
	rangeHolds,
	requestedCapabilities,
	type PackagePolicy,
} from './package.ts';
import { detectRomImage } from './package-rom.ts';

export interface PackageReport {
	/** true when there is no error; warnings do not count */
	readonly ok: boolean;
	readonly errors: readonly string[];
	readonly warnings: readonly string[];
	/** `id@version#sha256`, when the package could be read at all */
	readonly ref?: string;
	/** what the package asks for, including `script` when a script carries code */
	readonly capabilities: readonly string[];
}

export interface VerifyPackageOptions {
	readonly limits?: Partial<PackageLimits>;
	/** also refuse what this game would refuse */
	readonly policy?: PackagePolicy;
}

/**
 * Checks a `.mwp` end to end and reports instead of throwing: container (digests, limits,
 * paths), schema, declared `asset.sha256`, every reference, the licence and source of each
 * medium, the capabilities requested, `requires.mwg`, instrument ROM images, and the game's
 * policy when one is given.
 *
 * @example
 * ```ts
 * import { encodePackage, verifyPackage } from '@datamoc/mw_games/mwl';
 *
 * const source = "[{ tag: 'package', id: 'marta', version: '1.0.0' }]";
 * const bytes = await encodePackage([{ path: 'content.mwl', data: new TextEncoder().encode(source) }]);
 * console.log((await verifyPackage(bytes)).ok); // true
 * ```
 */
export async function verifyPackage(bytes: Uint8Array, options: VerifyPackageOptions = {}): Promise<PackageReport> {
	let pkg;
	try {
		pkg = await loadPackage(bytes, options.limits);
	} catch (error) {
		if (!(error instanceof PackageError)) throw error;
		return { ok: false, errors: [error.message], warnings: [], capabilities: [] };
	}
	const { document } = pkg;
	const errors: string[] = [];
	const warnings: string[] = [];
	const digests = new Map<string, string>();
	for (const file of pkg.files) {
		digests.set(file.path, await sha256Hex(file.data));
		const rom = await detectRomImage(file.data, file.path);
		if (rom) errors.push(rom.message);
	}
	checkAssets(document, digests, errors);
	checkReferences(document, errors);
	for (const file of pkg.files)
		if (
			file.path !== pkg.main &&
			!file.path.endsWith('.mwl') &&
			!document.assets.some((asset) => asset.path === file.path)
		)
			warnings.push(`"${file.path}" is in the package but no asset declares it`);
	const capabilities = requestedCapabilities(document);
	if (capabilities.includes('script') && !document.meta.requires.capabilities.includes('script'))
		errors.push('a script carries code but the package does not declare requires.capabilities: ["script"]');
	const { mwg } = document.meta.requires;
	if (mwg !== undefined && !rangeHolds(mwgVersion, mwg, 'requires.mwg', errors))
		errors.push(`requires mwg ${mwg}, this is mwg ${mwgVersion}`);
	if (options.policy)
		errors.push(...checkPackagePolicy(document, options.policy).map((refusal) => `refused by policy: ${refusal}`));
	return { ok: errors.length === 0, errors, warnings, ref: packageRef(pkg), capabilities };
}

function checkAssets(document: PackageDocument, digests: ReadonlyMap<string, string>, errors: string[]): void {
	for (const asset of document.assets) {
		const actual = digests.get(asset.path);
		if (actual === undefined) errors.push(`asset "${asset.id}": "${asset.path}" is not in the package`);
		else if (asset.sha256 !== undefined && asset.sha256 !== actual)
			errors.push(`asset "${asset.id}": sha256 does not match "${asset.path}"`);
		if (PACKAGE_MEDIA_KINDS.includes(asset.kind)) {
			if (!asset.license) errors.push(`asset "${asset.id}": a ${asset.kind} needs a license`);
			if (!asset.source) errors.push(`asset "${asset.id}": a ${asset.kind} needs a source`);
		}
	}
}

/** a reference resolves inside the package, or names another package (`pkg:id`) which is not checked here */
function checkReferences(document: PackageDocument, errors: string[]): void {
	const ids = (list: readonly { id: string }[]): Set<string> => new Set(list.map((item) => item.id));
	const assets = ids(document.assets);
	const sounds = ids(document.soundEffects);
	const animations = ids(document.animations);
	const music = ids(document.music);
	const scripts = ids(document.scripts);
	const check = (where: string, name: string | undefined, ...pools: Set<string>[]): void => {
		if (name === undefined || name.includes(':')) return;
		if (!pools.some((pool) => pool.has(name))) errors.push(`${where}: "${name}" is not defined in the package`);
	};
	for (const character of document.characters) {
		const where = `character "${character.id}"`;
		check(`${where} portrait`, character.portrait, assets);
		check(`${where} sprite`, character.sprite?.image, assets);
		check(`${where} theme`, character.theme, music, assets);
		for (const [name, id] of Object.entries(character.animations))
			check(`${where} animation ${name}`, id, animations);
		for (const [name, id] of Object.entries(character.sounds)) check(`${where} sound ${name}`, id, sounds);
		for (const id of character.scripts) check(`${where} script`, id, scripts);
	}
	for (const animation of document.animations)
		for (const [frame, event] of Object.entries(animation.events))
			check(`animation "${animation.id}" frame ${frame}`, event.sound, sounds);
	for (const track of document.music) {
		check(`music "${track.id}" src`, track.src, assets);
		check(`music "${track.id}" fallback`, track.fallback, assets);
	}
	for (const script of document.scripts)
		for (const action of script.do)
			if (action.tag === 'play' && typeof action.attributes.sound === 'string')
				check(`script "${script.id}" play`, action.attributes.sound, sounds, assets);
}
