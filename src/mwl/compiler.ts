import { parse, preprocess, type MwlLocation, type MwlNode, type MwlPreprocessOptions } from './grammar.ts';
import { validate, type MwlTagSchema } from './schema.ts';

export interface MwlCompiledNode {
	readonly tag: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly children: readonly MwlCompiledNode[];
	/** source location, kept so the runtime and tools can report where a node came from */
	readonly location?: MwlLocation;
	/** attribute names that carried the gettext marker, when the node came from text */
	readonly gettext?: readonly string[];
}

export interface MwlCompiledGame {
	readonly schema: string;
	readonly roots: readonly MwlCompiledNode[];
	readonly assets: readonly string[];
	readonly messages: readonly string[];
}

export interface MwlCompileOptions extends MwlPreprocessOptions {
	readonly schemas?: Readonly<Record<string, MwlTagSchema>>;
}

export interface MwlArtifact {
	readonly name: string;
	readonly content: string;
}

export interface MwlEmitOptions {
	readonly variable?: string;
	/** additional game-owned generated files, kept in the same deterministic artifact set */
	readonly artifacts?: Readonly<Record<string, string>>;
	readonly onEmit?: (artifact: MwlArtifact) => void;
}

/**
 * Preprocesses, parses and validates MWL source into a compiled game.
 *
 * @example
 * ```ts
 * import { compile } from '@datamoc/mw_games/mwl';
 *
 * const game = compile('[game]\nschema=0.1\n[/game]');
 * console.log(game.schema); // '0.1'
 * ```
 */
export function compile(source: string, options: MwlCompileOptions = {}): MwlCompiledGame {
	const expanded = preprocess(source, options);
	return compileNodes(parse(expanded, options.file), options);
}

export interface MwlSourceFile {
	readonly file: string;
	readonly source: string;
}

/**
 * Compiles a deterministic set of content files as one catalog.
 *
 * @example
 * ```ts
 * import { compileSources } from '@datamoc/mw_games/mwl';
 *
 * const game = compileSources([{ file: 'a.mwl', source: '[game]\nschema=0.1\n[/game]' }]);
 * console.log(game.roots.length); // 1
 * ```
 */
export function compileSources(files: readonly MwlSourceFile[], options: MwlCompileOptions = {}): MwlCompiledGame {
	const nodes: MwlNode[] = [];
	for (const file of [...files].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))) {
		const expanded = preprocess(file.source, { ...options, file: file.file });
		nodes.push(...parse(expanded, file.file));
	}
	return compileNodes(nodes, options);
}

/**
 * Compile an already-parsed MWL node tree. A game that builds its nodes from
 * another format (the Wesnoth port converts its own parsed nodes this way) can
 * validate and compile through the same schema without going back to text.
 *
 * @example
 * ```ts
 * import { compileNodes, parse } from '@datamoc/mw_games/mwl';
 *
 * const game = compileNodes(parse('[game]\nschema=0.1\n[/game]'));
 * console.log(game.schema); // '0.1'
 * ```
 */
export function compileNodes(nodes: readonly MwlNode[], options: MwlCompileOptions = {}): MwlCompiledGame {
	const diagnostics = validate(nodes, options.schemas);
	if (diagnostics.length) {
		const first = diagnostics[0];
		throw new Error(`${first.location.file}:${first.location.line}:${first.location.column}: ${first.message}`);
	}
	const assets = new Set<string>();
	const messages = new Set<string>();
	const convert = (node: MwlNode): MwlCompiledNode => {
		for (const [key, value] of Object.entries(node.attributes)) {
			if (isAssetAttribute(key)) {
				for (const asset of splitAssetReferences(value)
					.map((part) => part.trim())
					.filter(isAssetReference))
					assets.add(stripAssetTransform(asset));
			}
		}
		// Text-parsed nodes carry the exact set of gettext-marked attributes, so
		// extraction is precise. Programmatically built nodes have no marker
		// information, so fall back to the conventional display attributes.
		const messageKeys = node.gettext ?? ['name', 'text', 'title'];
		for (const key of messageKeys) {
			const value = node.attributes[key];
			if (value !== undefined) messages.add(value);
		}
		const compiled: MwlCompiledNode = {
			tag: node.tag,
			attributes: { ...node.attributes },
			children: node.children.map(convert),
			location: node.location,
		};
		return node.gettext ? { ...compiled, gettext: [...node.gettext] } : compiled;
	};
	return {
		schema: nodes.find((node) => node.tag === 'game')?.attributes.schema ?? '0.1',
		roots: nodes.map(convert),
		assets: [...assets].sort(),
		messages: [...messages].sort(),
	};
}

/** Common WML asset attributes, including the sound/image aliases used by CFG macros. */
function isAssetAttribute(name: string): boolean {
	return (
		name === 'file' ||
		name === 'image' ||
		name === 'image_icon' ||
		name === 'icon' ||
		name === 'profile' ||
		name === 'sound' ||
		name.endsWith('_sound') ||
		name.endsWith('_image')
	);
}

function isAssetReference(value: string): boolean {
	return (
		value.includes('/') ||
		/\.(?:png|jpg|jpeg|gif|svg|webp|wav|ogg|mp3|flac|glb|gltf|vox|map|cfg)$/i.test(value) ||
		value.startsWith('data:')
	);
}

function splitAssetReferences(value: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let parenDepth = 0;
	let bracketDepth = 0;
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] === '(') parenDepth += 1;
		else if (value[index] === ')' && parenDepth > 0) parenDepth -= 1;
		else if (value[index] === '[') bracketDepth += 1;
		else if (value[index] === ']' && bracketDepth > 0) bracketDepth -= 1;
		else if (value[index] === ',' && parenDepth === 0 && bracketDepth === 0) {
			parts.push(value.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(value.slice(start));
	return parts;
}

/** Remove a renderer transform, but keep Wesnoth sound ranges such as [1~4]. */
function stripAssetTransform(value: string): string {
	const match = value.match(/~[A-Za-z][A-Za-z0-9_-]*(?:\(|$)/);
	return match ? value.slice(0, match.index).trim() : value;
}

export interface MwlCatalogOptions {
	/** BCP-47 tag for the extracted catalog; the message ids are the source text */
	readonly locale?: string;
	readonly direction?: 'ltr' | 'rtl';
}

export interface MwlCatalog {
	readonly locale: string;
	readonly direction: 'ltr' | 'rtl';
	readonly messages: Record<string, string>;
}

/**
 * Extract a translation catalog compatible with `mwg/i18n` from a compiled
 * game. MWL keeps the source text as the message id, so the base-language
 * catalog maps each id to itself and translators fill in the other locales.
 *
 * @example
 * ```ts
 * import { compile, extractCatalog } from '@datamoc/mw_games/mwl';
 *
 * const game = compile('[game]\nschema=0.1\n[/game]');
 * console.log(extractCatalog(game, { locale: 'fr' }).locale); // 'fr'
 * ```
 */
export function extractCatalog(game: MwlCompiledGame, options: MwlCatalogOptions = {}): MwlCatalog {
	const messages: Record<string, string> = {};
	for (const id of game.messages) messages[id] = id;
	return { locale: options.locale ?? 'en', direction: options.direction ?? 'ltr', messages };
}

/**
 * Emits the compiled game as an ES module that assigns it to `variable`.
 *
 * @example
 * ```ts
 * import { compile, emitModule } from '@datamoc/mw_games/mwl';
 *
 * console.log(emitModule(compile('[game]\nschema=0.1\n[/game]')).startsWith('export const gameData')); // true
 * ```
 */
export function emitModule(game: MwlCompiledGame, variable = 'gameData'): string {
	return `export const ${variable} = ${JSON.stringify(game, null, '\t')} as const;\n`;
}

/**
 * Emits the standard MWL outputs plus game-owned artifacts in stable name order.
 *
 * @example
 * ```ts
 * import { compile, emitArtifacts } from '@datamoc/mw_games/mwl';
 *
 * const artifacts = emitArtifacts(compile('[game]\nschema=0.1\n[/game]'));
 * console.log(artifacts.map((artifact) => artifact.name)); // ['game-data.ts', 'i18n.json', 'assets.json']
 * ```
 */
export function emitArtifacts(game: MwlCompiledGame, options: MwlEmitOptions = {}): readonly MwlArtifact[] {
	const artifacts: MwlArtifact[] = [
		{ name: 'game-data.ts', content: emitModule(game, options.variable ?? 'gameData') },
		{ name: 'i18n.json', content: `${JSON.stringify(extractCatalog(game), null, '\t')}\n` },
		{ name: 'assets.json', content: `${JSON.stringify({ assets: game.assets }, null, '\t')}\n` },
		...Object.entries(options.artifacts ?? {})
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([name, content]) => ({ name, content })),
	];
	for (const artifact of artifacts) options.onEmit?.(artifact);
	return artifacts;
}

/**
 * Compiles the same source set twice and fails if any generated artifact differs.
 *
 * @example
 * ```ts
 * import { compileAndEmitSources } from '@datamoc/mw_games/mwl';
 *
 * const artifacts = compileAndEmitSources([{ file: 'a.mwl', source: '[game]\nschema=0.1\n[/game]' }]);
 * console.log(artifacts.length); // 3
 * ```
 */
export function compileAndEmitSources(
	files: readonly MwlSourceFile[],
	options: MwlCompileOptions = {},
	emitOptions: Omit<MwlEmitOptions, 'onEmit'> = {},
): readonly MwlArtifact[] {
	const first = emitArtifacts(compileSources(files, options), emitOptions);
	const second = emitArtifacts(compileSources(files, options), emitOptions);
	if (
		first.length !== second.length ||
		first.some(
			(artifact, index) => artifact.name !== second[index]?.name || artifact.content !== second[index]?.content,
		)
	)
		throw new Error('MWL generated artifacts are not deterministic');
	return first;
}
