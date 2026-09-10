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

export function compile(source: string, options: MwlCompileOptions = {}): MwlCompiledGame {
	const expanded = preprocess(source, options);
	return compileNodes(parse(expanded, options.file), options);
}

export interface MwlSourceFile {
	readonly file: string;
	readonly source: string;
}

/** Compiles a deterministic set of content files as one catalog. */
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
 */
export function extractCatalog(game: MwlCompiledGame, options: MwlCatalogOptions = {}): MwlCatalog {
	const messages: Record<string, string> = {};
	for (const id of game.messages) messages[id] = id;
	return { locale: options.locale ?? 'en', direction: options.direction ?? 'ltr', messages };
}

export function emitModule(game: MwlCompiledGame, variable = 'gameData'): string {
	return `export const ${variable} = ${JSON.stringify(game, null, '\t')} as const;\n`;
}
