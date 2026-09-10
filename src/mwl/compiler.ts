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
				for (const asset of value.split(',').map((part) => part.trim()).filter(Boolean))
					assets.add(asset.split('~', 1)[0].trim());
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
	return name === 'file' || name === 'image' || name === 'image_icon' || name === 'icon' || name === 'profile' || name === 'sound' || name.endsWith('_sound') || name.endsWith('_image');
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
