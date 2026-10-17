import JSON5 from 'json5';
import { checkConditionSyntax } from './conditions.ts';
import { preprocess, type MwlPreprocessOptions } from './grammar.ts';
import { checkPackagePath, PackageFormatError } from './package-container.ts';

/** plain JSON, the form a sound-effect definition or a script action keeps */
export type PackageValue = null | boolean | number | string | PackageValue[] | { [key: string]: PackageValue };

export type PackageAssetKind = 'image' | 'audio' | 'music' | 'font' | 'data' | 'synth-patch';

/**
 * The `kind` values an `asset` tag accepts.
 *
 * @example
 * ```ts
 * import { PACKAGE_ASSET_KINDS } from '@datamoc/mw_games/mwl';
 *
 * console.log(PACKAGE_ASSET_KINDS.includes('synth-patch')); // true
 * ```
 */
export const PACKAGE_ASSET_KINDS: readonly PackageAssetKind[] = [
	'image',
	'audio',
	'music',
	'font',
	'data',
	'synth-patch',
];

/**
 * Kinds that are somebody's creative work: `license` and `source` are mandatory for these.
 *
 * @example
 * ```ts
 * import { PACKAGE_MEDIA_KINDS } from '@datamoc/mw_games/mwl';
 *
 * console.log(PACKAGE_MEDIA_KINDS.includes('data')); // false
 * ```
 */
export const PACKAGE_MEDIA_KINDS: readonly PackageAssetKind[] = ['image', 'audio', 'music', 'font'];

/**
 * The MWL tags a package document may hold, and the only ones. Standard game tags (`unit_type`,
 * `event`, ...) are refused in a package: a character expands into them, and keeping the two
 * apart means nothing in a shared file can reach the rules of the game it is dropped into.
 *
 * @example
 * ```ts
 * import { PACKAGE_TAGS } from '@datamoc/mw_games/mwl';
 *
 * console.log(PACKAGE_TAGS.includes('character')); // true
 * ```
 */
export const PACKAGE_TAGS = [
	'package',
	'asset',
	'character',
	'animation',
	'sound_effect',
	'music',
	'script',
	'import',
] as const;

/**
 * The event vocabulary a package script may `do`. It is the data-only subset of the MWL event
 * actions plus `play` and `give`; `hook` (game-author code), `endlevel`, `win`, `lose`,
 * `spawn`, `kill` and anything else that decides the outcome of a scenario are not on it.
 *
 * @example
 * ```ts
 * import { PACKAGE_SCRIPT_ACTIONS } from '@datamoc/mw_games/mwl';
 *
 * console.log(PACKAGE_SCRIPT_ACTIONS.includes('hook')); // false
 * ```
 */
export const PACKAGE_SCRIPT_ACTIONS: readonly string[] = [
	'message',
	'say',
	'play',
	'give',
	'set_variable',
	'gold',
	'heal_unit',
	'fire_event',
];

/**
 * The capabilities mwg itself knows how to grant; a package may name others, a policy decides.
 *
 * @example
 * ```ts
 * import { KNOWN_PACKAGE_CAPABILITIES } from '@datamoc/mw_games/mwl';
 *
 * console.log(KNOWN_PACKAGE_CAPABILITIES); // ['audio', 'script']
 * ```
 */
export const KNOWN_PACKAGE_CAPABILITIES: readonly string[] = ['audio', 'script'];

export interface PackageRequires {
	/** semver range of the mwg version, e.g. `>=0.42` */
	readonly mwg?: string;
	/** semver range of `@datamoc/mwg-retro-audio` */
	readonly retroAudio?: string;
	readonly capabilities: readonly string[];
}

export interface PackageMeta {
	readonly id: string;
	readonly version: string;
	readonly author?: string;
	readonly license?: string;
	readonly requires: PackageRequires;
}

export interface PackageAsset {
	readonly id: string;
	readonly kind: PackageAssetKind;
	readonly path: string;
	readonly mime?: string;
	readonly sha256?: string;
	readonly license?: string;
	readonly source?: string;
}

export interface PackageAnimation {
	readonly id: string;
	readonly frames: readonly number[];
	readonly fps?: number;
	readonly loop?: boolean;
	/** frame number to the sound effect it triggers */
	readonly events: Readonly<Record<string, { readonly sound: string }>>;
}

export interface PackageSoundEffect {
	readonly id: string;
	/** everything but the id: chip, priority, retrigger, voices... read by the audio engine */
	readonly definition: Readonly<Record<string, PackageValue>>;
}

export interface PackageMusic {
	readonly id: string;
	/** an asset id */
	readonly src: string;
	readonly loop?: boolean;
	readonly region?: readonly [number, number];
	/** an asset id of a streamed file for platforms without the engine */
	readonly fallback?: string;
}

export interface PackageAction {
	readonly tag: string;
	readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

export interface PackageScript {
	readonly id: string;
	readonly on: string;
	/** a pure condition from the MWL condition language */
	readonly when?: string;
	readonly do: readonly PackageAction[];
	/** real code; needs the `script` capability, which a game is free to refuse */
	readonly code?: string;
}

export interface PackageImport {
	/** another MWL document inside this package, merged under the same package id */
	readonly src?: string;
	/** another package this one builds on, which must be merged first */
	readonly package?: string;
	readonly version?: string;
	/** prefix, joined with a dot, for the ids of an imported file */
	readonly as?: string;
}

export interface PackageCharacter {
	readonly id: string;
	readonly name?: string;
	readonly description?: string;
	readonly portrait?: string;
	readonly sprite?: { readonly image: string; readonly frame?: readonly [number, number] };
	readonly theme?: string;
	/** name to animation id */
	readonly animations: Readonly<Record<string, string>>;
	/** name to sound-effect id */
	readonly sounds: Readonly<Record<string, string>>;
	readonly scripts: readonly string[];
	/** hitpoints, movement, attack, defense...: the numbers of the unit */
	readonly stats: Readonly<Record<string, string | number | boolean>>;
}

export interface PackageDocument {
	readonly meta: PackageMeta;
	readonly assets: readonly PackageAsset[];
	readonly characters: readonly PackageCharacter[];
	readonly animations: readonly PackageAnimation[];
	readonly soundEffects: readonly PackageSoundEffect[];
	readonly music: readonly PackageMusic[];
	readonly scripts: readonly PackageScript[];
	readonly imports: readonly PackageImport[];
	/** the `_("...")` strings, sorted, for the i18n catalog */
	readonly messages: readonly string[];
}

type Raw = Record<string, unknown>;

interface Sections {
	meta?: PackageMeta;
	assets: PackageAsset[];
	characters: PackageCharacter[];
	animations: PackageAnimation[];
	soundEffects: PackageSoundEffect[];
	music: PackageMusic[];
	scripts: PackageScript[];
	imports: PackageImport[];
	messages: Set<string>;
}

const ID = /^[A-Za-z_][\w.-]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][\w.+-]*)?$/;
const MAX_FRAMES = 4096;
const MAX_CODE = 65536;
const MAX_CONDITION = 512;
const MAX_ACTIONS = 64;
const MAX_JSON_DEPTH = 16;
const MAX_IMPORT_DEPTH = 4;

/**
 * Reads a package document: the MWL tags `package`, `asset`, `character`, `animation`,
 * `sound_effect`, `music`, `script` and `import`, into plain typed data. Macros and
 * `#include`s are expanded first, as for any MWL file. Nothing is executed: a script's `when` is
 * only checked for syntax and its `do` only for membership of the safe vocabulary.
 *
 * `character` is a macro, not a compiled type of its own: it stays one record here and expands
 * into a `unit_type` (plus the animations, effects and scripts it names) when merged. A new
 * compiled table would need its own schema, validator and loader beside the one `unit_type`
 * already has; the macro reuses all of them, and the fields only a renderer or a player of
 * sound reads (portrait, sprite, theme) have no consumer in the rules core anyway.
 *
 * @example
 * ```ts
 * import { parsePackageDocument } from '@datamoc/mw_games/mwl';
 *
 * const document = parsePackageDocument(
 *   "[{ tag: 'package', id: 'marta', version: '1.0.0' }, { tag: 'character', id: 'marta', hitpoints: 28 }]",
 * );
 * console.log(document.characters[0]?.stats.hitpoints); // 28
 * ```
 */
export function parsePackageDocument(
	source: string,
	options: MwlPreprocessOptions & { readonly files?: Readonly<Record<string, string>> } = {},
): PackageDocument {
	const sections = emptySections();
	readInto(sections, source, options, 0);
	if (!sections.meta) throw new PackageFormatError(`${options.file ?? 'package'}: needs a [package] tag`);
	return finish(sections, sections.meta);
}

function emptySections(): Sections {
	return {
		assets: [],
		characters: [],
		animations: [],
		soundEffects: [],
		music: [],
		scripts: [],
		imports: [],
		messages: new Set(),
	};
}

function finish(sections: Sections, meta: PackageMeta): PackageDocument {
	return {
		meta,
		assets: sections.assets,
		characters: sections.characters,
		animations: sections.animations,
		soundEffects: sections.soundEffects,
		music: sections.music,
		scripts: sections.scripts,
		imports: sections.imports,
		messages: [...sections.messages].sort(),
	};
}

/** parses one source into `sections`; a file `import` recurses with a prefix and a depth bound */
function readInto(
	sections: Sections,
	source: string,
	options: MwlPreprocessOptions & { readonly files?: Readonly<Record<string, string>> },
	depth: number,
	prefix = '',
): void {
	const file = options.file ?? 'package.mwl';
	const fail = (message: string): never => {
		throw new PackageFormatError(`${file}: ${message}`);
	};
	let value: unknown;
	try {
		value = JSON5.parse(preprocess(source, options));
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
	if (!Array.isArray(value)) return fail('a package document is a top-level array of nodes');

	const text = (raw: unknown, where: string): string => {
		if (typeof raw === 'string') return raw;
		const gettext = (raw as Raw | null)?.$gettext;
		if (typeof gettext === 'string' && Object.keys(raw as Raw).length === 1) {
			sections.messages.add(gettext);
			return gettext;
		}
		return fail(`${where} must be a string or _("...")`);
	};
	const plain = (raw: unknown, where: string): string => {
		if (typeof raw !== 'string') return fail(`${where} must be a string`);
		return raw;
	};
	const idOf = (raw: unknown, where: string): string => {
		if (typeof raw !== 'string' || !ID.test(raw)) return fail(`${where} must be an id (letters, digits, _ . -)`);
		return raw;
	};
	const finite = (raw: unknown, where: string): number => {
		if (typeof raw !== 'number' || !Number.isFinite(raw)) return fail(`${where} must be a number`);
		return raw;
	};
	const record = (raw: unknown, where: string): Raw => {
		if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail(`${where} must be an object`);
		return raw as Raw;
	};
	const only = (body: Raw, allowed: readonly string[], where: string): void => {
		for (const key of Object.keys(body)) if (!allowed.includes(key)) fail(`${where}: unknown field "${key}"`);
	};
	const unique = (list: readonly { id: string }[], id: string, where: string): void => {
		if (list.some((item) => item.id === id)) fail(`${where}: duplicate id "${id}"`);
	};
	const local = (id: string): string => (prefix ? `${prefix}.${id}` : id);
	const json = (raw: unknown, where: string, level = 0): PackageValue => {
		if (level > MAX_JSON_DEPTH) return fail(`${where} is nested too deep`);
		if (raw === null || typeof raw === 'boolean' || typeof raw === 'string') return raw;
		if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fail(`${where} must be finite`);
		if (Array.isArray(raw)) return raw.map((item) => json(item, where, level + 1));
		if (typeof raw === 'object') {
			const out: Record<string, PackageValue> = {};
			for (const [key, item] of Object.entries(raw as Raw)) {
				if (key === '__proto__') fail(`${where} has a forbidden key`);
				out[key] =
					key === '$gettext' && typeof item === 'string'
						? (sections.messages.add(item), item)
						: json(item, where, level + 1);
			}
			return out;
		}
		return fail(`${where} must be plain data`);
	};

	const animationOf = (id: string, body: Raw, where: string): PackageAnimation => {
		only(body, ['tag', 'id', 'frames', 'fps', 'loop', 'events'], where);
		const frames = body.frames;
		if (!Array.isArray(frames) || frames.length === 0 || frames.length > MAX_FRAMES)
			fail(`${where}: frames must be a list of 1 to ${MAX_FRAMES} frame numbers`);
		(frames as unknown[]).forEach((frame) => {
			if (!Number.isInteger(frame) || (frame as number) < 0) fail(`${where}: a frame is a non-negative integer`);
		});
		const events: Record<string, { sound: string }> = {};
		for (const [frame, event] of Object.entries(record(body.events ?? {}, `${where}.events`))) {
			if (!/^\d+$/.test(frame)) fail(`${where}: event keys are frame numbers`);
			const entry = record(event, `${where}.events.${frame}`);
			only(entry, ['sound'], `${where}.events.${frame}`);
			events[frame] = { sound: idOrRef(entry.sound, `${where}.events.${frame}.sound`) };
		}
		const fps = body.fps === undefined ? undefined : finite(body.fps, `${where}.fps`);
		if (fps !== undefined && (fps <= 0 || fps > 240)) fail(`${where}: fps must be between 0 and 240`);
		if (body.loop !== undefined && typeof body.loop !== 'boolean') fail(`${where}: loop must be true or false`);
		return {
			id,
			frames: frames as number[],
			...(fps === undefined ? {} : { fps }),
			...(body.loop === undefined ? {} : { loop: body.loop as boolean }),
			events,
		};
	};
	/** a reference is an id, optionally qualified `package:id` */
	const idOrRef = (raw: unknown, where: string): string => {
		if (typeof raw !== 'string' || !/^[A-Za-z_][\w.-]*(?:@[\w.+-]+)?(?::[A-Za-z_][\w.-]*)?$/.test(raw))
			return fail(`${where} must be an id or package:id`);
		return raw;
	};
	const scriptOf = (id: string, body: Raw, where: string): PackageScript => {
		only(body, ['tag', 'id', 'on', 'when', 'do', 'code'], where);
		const on = plain(body.on, `${where}.on`);
		if (!ID.test(on)) fail(`${where}: on must be an event name`);
		let when: string | undefined;
		if (body.when !== undefined) {
			when = plain(body.when, `${where}.when`);
			if (when.length > MAX_CONDITION) fail(`${where}: when is longer than ${MAX_CONDITION} characters`);
			try {
				checkConditionSyntax(when);
			} catch (error) {
				fail(`${where}: when: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const rawDo = body.do ?? [];
		if (!Array.isArray(rawDo) || rawDo.length > MAX_ACTIONS)
			fail(`${where}: do is a list of at most ${MAX_ACTIONS} actions`);
		const actions = (rawDo as unknown[]).map((item, index): PackageAction => {
			const action = record(item, `${where}.do[${index}]`);
			let tag = action.tag;
			let fields = action;
			if (typeof tag !== 'string') {
				// the named form `{ message: { text: ... } }`
				const keys = Object.keys(action);
				tag = keys.length === 1 ? keys[0] : undefined;
				fields = tag ? record(action[tag as string], `${where}.do[${index}]`) : action;
			}
			if (typeof tag !== 'string' || !PACKAGE_SCRIPT_ACTIONS.includes(tag))
				return fail(
					`${where}.do[${index}]: "${String(tag)}" is not an allowed action (${PACKAGE_SCRIPT_ACTIONS.join(', ')})`,
				);
			const attributes: Record<string, string | number | boolean> = {};
			for (const [key, raw] of Object.entries(fields)) {
				if (key === 'tag') continue;
				attributes[key] =
					typeof raw === 'number' || typeof raw === 'boolean'
						? raw
						: text(raw, `${where}.do[${index}].${key}`);
			}
			return { tag, attributes };
		});
		let code: string | undefined;
		if (body.code !== undefined) {
			code = plain(body.code, `${where}.code`);
			if (code.length > MAX_CODE) fail(`${where}: code is longer than ${MAX_CODE} characters`);
		}
		return {
			id,
			on,
			...(when === undefined ? {} : { when }),
			do: actions,
			...(code === undefined ? {} : { code }),
		};
	};

	const characterOf = (id: string, body: Raw): void => {
		const where = `[character] ${id}`;
		unique(sections.characters, id, where);
		const animations: Record<string, string> = {};
		for (const [name, item] of Object.entries(record(body.animations ?? {}, `${where}.animations`))) {
			if (typeof item === 'string') animations[name] = idOrRef(item, `${where}.animations.${name}`);
			else {
				// inline: becomes an animation of its own, named after the character
				const animationId = `${id}.${name}`;
				unique(sections.animations, animationId, where);
				sections.animations.push(
					animationOf(
						animationId,
						record(item, `${where}.animations.${name}`),
						`${where}.animations.${name}`,
					),
				);
				animations[name] = animationId;
			}
		}
		const sounds: Record<string, string> = {};
		for (const [name, item] of Object.entries(record(body.sounds ?? {}, `${where}.sounds`))) {
			if (typeof item === 'string') sounds[name] = idOrRef(item, `${where}.sounds.${name}`);
			else {
				const soundId = `${id}.${name}`;
				unique(sections.soundEffects, soundId, where);
				const definition = record(item, `${where}.sounds.${name}`);
				sections.soundEffects.push({
					id: soundId,
					definition: JSON.parse(JSON.stringify(definition)) as Record<string, PackageValue>,
				});
				sounds[name] = soundId;
			}
		}
		const scripts: string[] = [];
		const rawScripts = body.scripts ?? [];
		if (!Array.isArray(rawScripts)) fail(`${where}.scripts must be a list`);
		(rawScripts as unknown[]).forEach((item, index) => {
			if (typeof item === 'string') scripts.push(idOrRef(item, `${where}.scripts[${index}]`));
			else {
				const scriptId = `${id}.script${index}`;
				unique(sections.scripts, scriptId, where);
				sections.scripts.push(
					scriptOf(scriptId, record(item, `${where}.scripts[${index}]`), `${where}.scripts[${index}]`),
				);
				scripts.push(scriptId);
			}
		});
		let sprite: PackageCharacter['sprite'];
		if (body.sprite !== undefined) {
			const raw = record(body.sprite, `${where}.sprite`);
			only(raw, ['image', 'frame'], `${where}.sprite`);
			const frame = raw.frame;
			if (
				frame !== undefined &&
				(!Array.isArray(frame) || frame.length !== 2 || frame.some((n) => !Number.isInteger(n) || n <= 0))
			)
				fail(`${where}.sprite.frame is [width, height]`);
			sprite = {
				image: idOrRef(raw.image, `${where}.sprite.image`),
				...(frame === undefined ? {} : { frame: frame as [number, number] }),
			};
		}
		const stats: Record<string, string | number | boolean> = {};
		for (const [key, raw] of Object.entries(body)) {
			if (CHARACTER_FIELDS.includes(key)) continue;
			if (!ID.test(key)) fail(`${where}: bad field name "${key}"`);
			stats[key] = typeof raw === 'number' || typeof raw === 'boolean' ? raw : text(raw, `${where}.${key}`);
		}
		sections.characters.push({
			id,
			...(body.name === undefined ? {} : { name: text(body.name, `${where}.name`) }),
			...(body.description === undefined ? {} : { description: text(body.description, `${where}.description`) }),
			...(body.portrait === undefined ? {} : { portrait: idOrRef(body.portrait, `${where}.portrait`) }),
			...(sprite === undefined ? {} : { sprite }),
			...(body.theme === undefined ? {} : { theme: idOrRef(body.theme, `${where}.theme`) }),
			animations,
			sounds,
			scripts,
			stats,
		});
	};

	const entries: [string, Raw][] = [];
	for (const entry of value) {
		const body = record(entry, 'a node');
		if (typeof body.tag === 'string') entries.push([body.tag, body]);
		else {
			const keys = Object.keys(body);
			if (keys.length !== 1) fail('a node needs a tag');
			const items = Array.isArray(body[keys[0]]) ? (body[keys[0]] as unknown[]) : [body[keys[0]]];
			for (const item of items) entries.push([keys[0], record(item, keys[0])]);
		}
	}

	for (const [tag, body] of entries) {
		const where = `[${tag}]`;
		if (!(PACKAGE_TAGS as readonly string[]).includes(tag))
			fail(`${where} is not allowed in a package; use [character] and the other package tags`);
		if (tag === 'package') {
			if (depth > 0) fail('an imported file cannot hold a [package] tag');
			if (sections.meta) fail('a second [package] tag');
			only(body, ['tag', 'id', 'version', 'author', 'license', 'requires'], where);
			const version = plain(body.version, `${where}.version`);
			if (!VERSION.test(version)) fail(`${where}: version must look like 1.2.3`);
			const requires = record(body.requires ?? {}, `${where}.requires`);
			only(requires, ['mwg', 'retroAudio', 'capabilities'], `${where}.requires`);
			const capabilities = requires.capabilities ?? [];
			if (!Array.isArray(capabilities) || capabilities.some((item) => typeof item !== 'string' || !ID.test(item)))
				fail(`${where}: requires.capabilities is a list of names`);
			sections.meta = {
				id: idOf(body.id, `${where}.id`),
				version,
				...(body.author === undefined ? {} : { author: text(body.author, `${where}.author`) }),
				...(body.license === undefined ? {} : { license: plain(body.license, `${where}.license`) }),
				requires: {
					...(requires.mwg === undefined ? {} : { mwg: plain(requires.mwg, `${where}.requires.mwg`) }),
					...(requires.retroAudio === undefined
						? {}
						: { retroAudio: plain(requires.retroAudio, `${where}.requires.retroAudio`) }),
					capabilities: [...new Set(capabilities as string[])].sort(),
				},
			};
			continue;
		}
		if (tag === 'import') {
			only(body, ['tag', 'src', 'package', 'version', 'as'], where);
			if ((body.src === undefined) === (body.package === undefined))
				fail(`${where}: needs exactly one of src and package`);
			const imported: PackageImport = {
				...(body.src === undefined ? {} : { src: checkPackagePath(plain(body.src, `${where}.src`)) }),
				...(body.package === undefined ? {} : { package: idOf(body.package, `${where}.package`) }),
				...(body.version === undefined ? {} : { version: plain(body.version, `${where}.version`) }),
				...(body.as === undefined ? {} : { as: idOf(body.as, `${where}.as`) }),
			};
			sections.imports.push(imported);
			if (imported.src !== undefined) {
				if (depth + 1 > MAX_IMPORT_DEPTH)
					fail(`${where}: imports are nested more than ${MAX_IMPORT_DEPTH} deep`);
				const imported_source = options.files?.[imported.src];
				if (imported_source === undefined) fail(`${where}: "${imported.src}" is not in the package`);
				readInto(
					sections,
					imported_source as string,
					{ ...options, file: imported.src },
					depth + 1,
					imported.as ? local(imported.as) : prefix,
				);
			}
			continue;
		}
		const id = local(idOf(body.id, `${where}.id`));
		if (tag === 'asset') {
			only(body, ['tag', 'id', 'kind', 'path', 'mime', 'sha256', 'license', 'source'], where);
			const kind = plain(body.kind, `${where}.kind`) as PackageAssetKind;
			if (!PACKAGE_ASSET_KINDS.includes(kind))
				fail(`${where}: kind must be one of ${PACKAGE_ASSET_KINDS.join(', ')}`);
			unique(sections.assets, id, where);
			const sha256 = body.sha256 === undefined ? undefined : plain(body.sha256, `${where}.sha256`);
			if (sha256 !== undefined && !/^[0-9a-f]{64}$/.test(sha256))
				fail(`${where}: sha256 is 64 lower-case hex digits`);
			sections.assets.push({
				id,
				kind,
				path: checkPackagePath(plain(body.path, `${where}.path`)),
				...(body.mime === undefined ? {} : { mime: plain(body.mime, `${where}.mime`) }),
				...(sha256 === undefined ? {} : { sha256 }),
				...(body.license === undefined ? {} : { license: plain(body.license, `${where}.license`) }),
				...(body.source === undefined ? {} : { source: plain(body.source, `${where}.source`) }),
			});
		} else if (tag === 'animation') {
			unique(sections.animations, id, where);
			sections.animations.push(animationOf(id, body, `${where} ${id}`));
		} else if (tag === 'sound_effect') {
			unique(sections.soundEffects, id, where);
			const { tag: _tag, id: _id, ...rest } = body;
			void _tag;
			void _id;
			sections.soundEffects.push({
				id,
				definition: json(rest, `${where} ${id}`) as Record<string, PackageValue>,
			});
		} else if (tag === 'music') {
			only(body, ['tag', 'id', 'src', 'loop', 'region', 'fallback'], where);
			unique(sections.music, id, where);
			const region = body.region;
			if (
				region !== undefined &&
				(!Array.isArray(region) || region.length !== 2 || region.some((n) => typeof n !== 'number' || n < 0))
			)
				fail(`${where}: region is [start, end]`);
			sections.music.push({
				id,
				src: idOrRef(body.src, `${where}.src`),
				...(body.loop === undefined ? {} : { loop: body.loop === true }),
				...(region === undefined ? {} : { region: region as [number, number] }),
				...(body.fallback === undefined ? {} : { fallback: idOrRef(body.fallback, `${where}.fallback`) }),
			});
		} else if (tag === 'script') {
			unique(sections.scripts, id, where);
			sections.scripts.push(scriptOf(id, body, `${where} ${id}`));
		} else {
			characterOf(id, body);
		}
	}
}

const CHARACTER_FIELDS = [
	'tag',
	'id',
	'name',
	'description',
	'portrait',
	'sprite',
	'theme',
	'animations',
	'sounds',
	'scripts',
];

// ---------------------------------------------------------------- versions

interface Range {
	readonly low: readonly number[];
	/** exclusive upper bound, or none */
	readonly high?: readonly number[];
	readonly op: 'range' | 'gt' | 'lte';
}

function parseTriple(text: string, partial: boolean): number[] {
	const parts = text.split(/[-+]/)[0].split('.');
	if (parts.length > 3 || (!partial && parts.length !== 3)) throw new PackageFormatError(`bad version "${text}"`);
	return parts.map((part) => {
		if (!/^\d{1,9}$/.test(part)) throw new PackageFormatError(`bad version "${text}"`);
		return Number(part);
	});
}

function compareTriples(a: readonly number[], b: readonly number[]): number {
	for (let index = 0; index < 3; index++) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference) return difference;
	}
	return 0;
}

/** the first version a partial one does not cover: `1.2` -> `1.3.0`, `1` -> `2.0.0` */
function bump(parts: readonly number[]): number[] {
	if (parts.length === 1) return [parts[0] + 1, 0, 0];
	if (parts.length === 2) return [parts[0], parts[1] + 1, 0];
	return [parts[0], parts[1], parts[2] + 1];
}

function comparator(text: string): Range | undefined {
	const match = /^(>=|<=|>|<|\^|~|=)?\s*(.*)$/.exec(text.trim());
	const operator = match?.[1] ?? '=';
	const body = match?.[2] ?? '';
	if (body === '' || body === '*' || /^[xX*]$/.test(body)) return undefined;
	const parts = parseTriple(body.replace(/\.[xX*]/g, ''), true);
	const low = [parts[0], parts[1] ?? 0, parts[2] ?? 0];
	if (operator === '>=') return { low, op: 'range' };
	if (operator === '>') return parts.length === 3 ? { low, op: 'gt' } : { low: bump(parts), op: 'range' };
	if (operator === '<') return { low: [0, 0, 0], high: low, op: 'range' };
	if (operator === '<=')
		return parts.length === 3 ? { low, op: 'lte' } : { low: [0, 0, 0], high: bump(parts), op: 'range' };
	if (operator === '^') {
		// a caret allows changes right of the first non-zero part
		const significant = parts.findIndex((part) => part > 0);
		return { low, high: bump(parts.slice(0, significant < 0 ? parts.length : significant + 1)), op: 'range' };
	}
	if (operator === '~') return { low, high: bump(parts.slice(0, 2)), op: 'range' };
	return { low, high: bump(parts), op: 'range' };
}

/**
 * Checks a version against a small semver range: `>=`, `>`, `<=`, `<`, `^`, `~`, an exact
 * version or a partial one (`0.42` is `0.42.x`), several separated by spaces (all must hold) and
 * alternatives separated by `||`. A pre-release or build suffix on the version is ignored.
 * A malformed range throws a `PackageFormatError`.
 *
 * @example
 * ```ts
 * import { satisfiesVersionRange } from '@datamoc/mw_games/mwl';
 *
 * console.log(satisfiesVersionRange('0.43.0', '>=0.42 <1')); // true
 * console.log(satisfiesVersionRange('0.43.0', '^0.42.0')); // false
 * ```
 */
export function satisfiesVersionRange(version: string, range: string): boolean {
	const actual = parseTriple(version, false);
	return range.split('||').some((alternative) =>
		alternative
			.replace(/([<>=^~])\s+/g, '$1')
			.trim()
			.split(/\s+/)
			.every((part) => {
				const rule = comparator(part);
				if (!rule) return true;
				if (rule.op === 'gt') return compareTriples(actual, rule.low) > 0;
				if (rule.op === 'lte') return compareTriples(actual, rule.low) <= 0;
				return compareTriples(actual, rule.low) >= 0 && (!rule.high || compareTriples(actual, rule.high) < 0);
			}),
	);
}

/**
 * Orders two `x.y.z` versions: negative when `a` is older, positive when newer. It decides which
 * of two coexisting versions of a package owns the plain `packageId:id` name.
 *
 * @example
 * ```ts
 * import { compareVersions } from '@datamoc/mw_games/mwl';
 *
 * console.log(compareVersions('1.2.0', '1.10.0') < 0); // true
 * ```
 */
export function compareVersions(a: string, b: string): number {
	return compareTriples(parseTriple(a, false), parseTriple(b, false));
}
