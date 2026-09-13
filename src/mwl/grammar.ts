import JSON5 from 'json5';

export interface MwlLocation {
	readonly file: string;
	readonly line: number;
	readonly column: number;
}

export interface MwlNode {
	readonly tag: string;
	readonly attributes: Readonly<Record<string, string>>;
	readonly children: readonly MwlNode[];
	readonly location: MwlLocation;
	/**
	 * Names of the attributes that carried the gettext marker `_("...")`.
	 * Present (possibly empty) on nodes parsed from text, so the compiler can
	 * extract exactly the author-marked display strings; absent on nodes built
	 * programmatically by a converter.
	 */
	readonly gettext?: readonly string[];
}

export interface MwlDiagnostic {
	readonly code: string;
	readonly message: string;
	readonly location: MwlLocation;
	readonly lineText?: string;
}

/**
 * The error a malformed MWL document throws, carrying the diagnostic that describes it.
 *
 * @example
 * ```ts
 * import { parse, MwlSyntaxError } from '@datamoc/mw_games/mwl';
 *
 * try {
 *   parse('[{ tag: "game" }]', 'broken.mwl');
 * } catch (error) {
 *   if (error instanceof MwlSyntaxError) console.log(error.diagnostic.code);
 * }
 * ```
 */
export class MwlSyntaxError extends Error {
	readonly diagnostic: MwlDiagnostic;

	constructor(diagnostic: MwlDiagnostic) {
		super(
			`${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column}: ${diagnostic.message}`,
		);
		this.name = 'MwlSyntaxError';
		this.diagnostic = diagnostic;
	}
}

export interface MwlPreprocessOptions {
	readonly file?: string;
	readonly defines?: readonly string[];
	readonly includes?: Readonly<Record<string, string>>;
}

interface Macro {
	readonly name: string;
	readonly parameters: readonly string[];
	readonly body: string;
}

const directiveNames = new Set(['define', 'enddef', 'arg', 'ifdef', 'ifndef', 'else', 'endif', 'include']);

/**
 * Expands MWL macros, `#ifdef` blocks and `#include`s into flat source text,
 * then rewrites the `_("...")` gettext marker into a form the JSON5 parser
 * accepts. The marker keeps working because this pass already runs before
 * structural parsing, the same reason macros survive a change of grammar.
 *
 * @example
 * ```ts
 * import { preprocess } from '@datamoc/mw_games/mwl';
 *
 * console.log(preprocess("[{ tag: 'game', schema: 0.1 }]"));
 * ```
 */
export function preprocess(source: string, options: MwlPreprocessOptions = {}): string {
	const macros = new Map<string, Macro>();
	const defines = new Set(options.defines ?? []);
	const lines = source.split(/\r?\n/);
	const output: string[] = [];
	const active: boolean[] = [true];
	let macro: { name: string; parameters: string[]; body: string[] } | null = null;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const directive = /^\s*#([A-Za-z_][\w-]*)(?:\s+(.*))?$/.exec(line);
		if (directive && directiveNames.has(directive[1])) {
			const word = directive[1];
			const argument = directive[2]?.trim() ?? '';
			if (word === 'define') {
				if (!active.at(-1) || macro) continue;
				const parts = splitWords(argument);
				if (parts.length === 0) throw syntax('MWL_DEFINE', 'macro name is required', options.file, index, line);
				macro = { name: parts[0], parameters: parts.slice(1), body: [] };
				defines.add(parts[0]);
				continue;
			}
			if (word === 'arg') {
				if (macro && argument) macro.parameters.push(argument.split(/\s+/)[0]);
				continue;
			}
			if (word === 'enddef') {
				if (!macro) throw syntax('MWL_ENDDEF', 'unexpected #enddef', options.file, index, line);
				macros.set(macro.name, { name: macro.name, parameters: macro.parameters, body: macro.body.join('\n') });
				macro = null;
				continue;
			}
			if (word === 'ifdef' || word === 'ifndef') {
				const present = defines.has(argument);
				active.push(active.at(-1) === true && (word === 'ifdef' ? present : !present));
				continue;
			}
			if (word === 'else') {
				if (active.length < 2) throw syntax('MWL_ELSE', 'unexpected #else', options.file, index, line);
				active[active.length - 1] = active[active.length - 2] && !active.at(-1);
				continue;
			}
			if (word === 'endif') {
				if (active.length < 2) throw syntax('MWL_ENDIF', 'unexpected #endif', options.file, index, line);
				active.pop();
				continue;
			}
			if (word === 'include') {
				if (active.at(-1)) {
					const included = options.includes?.[unquote(argument)];
					if (included === undefined)
						throw syntax('MWL_INCLUDE', `include not supplied: ${argument}`, options.file, index, line);
					output.push(preprocess(included, options));
				}
				continue;
			}
		}
		if (macro) {
			if (active.at(-1)) macro.body.push(line);
			continue;
		}
		if (active.at(-1) && !/^\s*#/.test(line)) output.push(line);
	}
	if (macro)
		throw syntax(
			'MWL_ENDDEF',
			`macro ${macro.name} is missing #enddef`,
			options.file,
			lines.length - 1,
			lines.at(-1) ?? '',
		);
	if (active.length !== 1)
		throw syntax('MWL_ENDIF', 'conditional is missing #endif', options.file, lines.length - 1, lines.at(-1) ?? '');
	return rewriteGettextMarkers(expandMacros(output.join('\n'), macros, options));
}

function expandMacros(source: string, macros: ReadonlyMap<string, Macro>, options: MwlPreprocessOptions): string {
	return source.replace(/\{([^{}]*)\}/g, (whole, inner: string) => {
		const parts = splitWords(inner);
		const definition = macros.get(parts[0]);
		if (!definition) return whole;
		let body = definition.body;
		for (let i = 0; i < definition.parameters.length; i++) {
			const parameter = definition.parameters[i];
			const keyword = parts.find((part) => part.startsWith(`${parameter}=`));
			const value = keyword ? keyword.slice(parameter.length + 1) : (parts[i + 1] ?? '');
			body = body.replaceAll(`{${parameter}}`, value);
		}
		return expandMacros(body, macros, options);
	});
}

/**
 * Rewrites `_("text")` to `{"$gettext": "text"}` before the JSON5 parser runs.
 * The scan skips string literals and `//`/`block` comments, so prose that merely
 * mentions the marker (a dialogue line about the syntax itself) survives intact.
 * An `_("...")` the rewrite does not match, such as one with an unquoted string,
 * is left for the JSON5 parser to reject with its own line and column.
 */
function rewriteGettextMarkers(source: string): string {
	const marker = /^_\(\s*("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')\s*\)/;
	let out = '';
	let index = 0;
	while (index < source.length) {
		const character = source[index];
		const comment = source[index + 1];
		if (character === '/' && (comment === '/' || comment === '*')) {
			const end = comment === '/' ? source.indexOf('\n', index) : source.indexOf('*/', index + 2);
			const stop = end < 0 ? source.length : comment === '/' ? end : end + 2;
			out += source.slice(index, stop);
			index = stop;
			continue;
		}
		if (character === '"' || character === "'") {
			const stop = copyJson5String(source, index);
			out += source.slice(index, stop);
			index = stop;
			continue;
		}
		if (character === '_') {
			const match = marker.exec(source.slice(index));
			if (match) {
				out += `{"$gettext": ${match[1]}}`;
				index += match[0].length;
				continue;
			}
		}
		out += character;
		index++;
	}
	return out;
}

/** Copies one JSON5 string literal verbatim, escapes included, so the rewrite never edits inside it. */
function copyJson5String(source: string, from: number): number {
	const quote = source[from];
	let index = from + 1;
	while (index < source.length) {
		const character = source[index];
		if (character === '\\') {
			index += 2;
			continue;
		}
		if (character === quote) return index + 1;
		// A raw newline ends the literal here; the JSON5 parser reports it.
		if (character === '\n') return index;
		index++;
	}
	return index;
}

/**
 * Parses MWL source (a top-level array of `{ tag, ...attrs, children }` objects)
 * into nodes. Numbers and booleans become their string form on the node, so the
 * schema, compiler, and runtime see exactly the strings they always have; the
 * JSON5 literal only decides what an author types and what a JSON5-aware tool
 * can check before validation runs.
 */
export function parse(source: string, file = '<mwl>'): MwlNode[] {
	// The marker rewrite is idempotent, so parsing already-preprocessed source
	// (the `compile` path) is a no-op while a direct `parse` of authored source
	// keeps working, the way the old tag parser read `_ "..."` inline.
	const rewritten = rewriteGettextMarkers(source);
	if (rewritten.trim() === '') return [];
	let value: unknown;
	try {
		value = JSON5.parse(rewritten);
	} catch (error) {
		throw json5SyntaxError(error, rewritten, file);
	}
	if (value === undefined) return [];
	if (!Array.isArray(value))
		throw new MwlSyntaxError({
			code: 'MWL_DOCUMENT',
			message: 'MWL document must be a top-level array of nodes',
			location: { file, line: 1, column: 1 },
			lineText: rewritten.split(/\r?\n/)[0] ?? '',
		});
	const context: NodeContext = {
		file,
		sites: collectTagSites(rewritten, file),
		cursor: { index: 0 },
		parent: undefined,
	};
	return value.map((entry) => toNode(entry, context));
}

interface NodeContext {
	readonly file: string;
	readonly sites: readonly TagSite[];
	readonly cursor: { index: number };
	readonly parent: MwlLocation | undefined;
}

function toNode(entry: unknown, context: NodeContext): MwlNode {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
		throw new MwlSyntaxError({
			code: 'MWL_TAG',
			message: 'MWL node must be an object with a tag',
			location: context.parent ?? { file: context.file, line: 1, column: 1 },
		});
	const record = entry as Record<string, unknown>;
	if (typeof record.tag !== 'string' || !namePattern.test(record.tag))
		throw new MwlSyntaxError({
			code: 'MWL_TAG',
			message: 'MWL node needs a tag name',
			location: context.parent ?? { file: context.file, line: 1, column: 1 },
		});
	const tag = record.tag;
	const location = locate(context, tag);
	const rawChildren = record.children ?? [];
	if (!Array.isArray(rawChildren))
		throw new MwlSyntaxError({
			code: 'MWL_TAG',
			message: `children of [${tag}] must be an array`,
			location,
		});
	const attributes: Record<string, string> = {};
	const gettext: string[] = [];
	for (const [name, raw] of Object.entries(record)) {
		if (name === 'tag' || name === 'children') continue;
		attributes[name] = toAttribute(tag, name, raw, location, gettext);
	}
	const childContext: NodeContext = { ...context, parent: location };
	return {
		tag,
		attributes,
		children: rawChildren.map((child) => toNode(child, childContext)),
		location,
		gettext,
	};
}

function toAttribute(tag: string, name: string, raw: unknown, location: MwlLocation, gettext: string[]): string {
	if (!namePattern.test(name) || name.startsWith('$') || name.startsWith('_'))
		throw new MwlSyntaxError({
			code: 'MWL_ATTRIBUTE',
			message: `unknown attribute "${name}" on [${tag}]`,
			location,
		});
	if (typeof raw === 'string') return raw;
	if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
	if (typeof raw === 'boolean') return raw ? 'true' : 'false';
	if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
		const keys = Object.keys(raw);
		const text = (raw as Record<string, unknown>).$gettext;
		if (keys.length === 1 && keys[0] === '$gettext' && typeof text === 'string') {
			gettext.push(name);
			return text;
		}
	}
	throw new MwlSyntaxError({
		code: 'MWL_ATTRIBUTE',
		message: `attribute "${name}" on [${tag}] must be a string, number, boolean, or _("...")`,
		location,
	});
}

interface TagSite {
	readonly tag: string;
	readonly location: MwlLocation;
}

const namePattern = /^[A-Za-z_][\w-]*$/;

/**
 * Every `tag: 'name'` occurrence in source order. Pre-order node traversal visits
 * tags in that same order (a parent literal opens before its children), so `locate`
 * can zip the two sequences and recover a useful line and column per node without
 * a schema-aware parser. A `tag: '...'` string inside prose can shift a location,
 * never a value, which is why this stays best-effort rather than load-bearing.
 */
function collectTagSites(source: string, file: string): TagSite[] {
	const sites: TagSite[] = [];
	const pattern = /\btag\s*:\s*(['"])([A-Za-z_][\w-]*)\1/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) !== null) {
		sites.push({ tag: match[2], location: offsetToLocation(source, file, match.index) });
	}
	return sites;
}

function locate(context: NodeContext, tag: string): MwlLocation {
	for (let index = context.cursor.index; index < context.sites.length; index++) {
		if (context.sites[index].tag === tag) {
			context.cursor.index = index + 1;
			return context.sites[index].location;
		}
	}
	return context.parent ?? { file: context.file, line: 1, column: 1 };
}

function offsetToLocation(source: string, file: string, offset: number): MwlLocation {
	let line = 1;
	let column = 1;
	for (let index = 0; index < offset; index++) {
		if (source[index] === '\n') {
			line++;
			column = 1;
		} else column++;
	}
	return { file, line, column };
}

function json5SyntaxError(error: unknown, source: string, file: string): MwlSyntaxError {
	const lines = source.split(/\r?\n/);
	const detail = error as { lineNumber?: unknown; columnNumber?: unknown };
	const line = typeof detail?.lineNumber === 'number' ? detail.lineNumber : 1;
	const column = typeof detail?.columnNumber === 'number' ? detail.columnNumber : 1;
	let message = error instanceof Error ? error.message : String(error);
	if (message.includes("'_'")) message += ' (write translatable text as _("..."))';
	return new MwlSyntaxError({
		code: 'MWL_SYNTAX',
		message,
		location: { file, line: Math.max(1, line), column: Math.max(1, column) },
		lineText: lines[Math.max(1, line) - 1],
	});
}

/**
 * Unquotes one raw attribute value and strips the `_("...")` gettext marker.
 *
 * @example
 * ```ts
 * import { parseValue } from '@datamoc/mw_games/mwl';
 *
 * console.log(parseValue('_("Hold the line")', { file: 'a.mwl', line: 1, column: 1 })); // 'Hold the line'
 * ```
 */
export function parseValue(raw: string, location: MwlLocation, lineText = raw): string {
	const value = raw.trim();
	const marker = /^_\(\s*([\s\S]*?)\s*\)$/.exec(value);
	const literal = marker ? marker[1] : value;
	if (literal.startsWith('"') || literal.startsWith("'")) {
		try {
			const parsed: unknown = JSON5.parse(literal);
			if (typeof parsed === 'string') return parsed;
		} catch {
			// Fall through to the syntax error below.
		}
		throw new MwlSyntaxError({ code: 'MWL_STRING', message: 'unterminated string value', location, lineText });
	}
	if (marker)
		throw new MwlSyntaxError({ code: 'MWL_STRING', message: '_("...") needs a quoted string', location, lineText });
	return value;
}

/**
 * True when a raw attribute value carries the gettext marker `_("...")`.
 *
 * @example
 * ```ts
 * import { isGettext } from '@datamoc/mw_games/mwl';
 *
 * console.log(isGettext('_("Hello")')); // true
 * console.log(isGettext('Hello')); // false
 * ```
 */
export function isGettext(raw: string): boolean {
	return /^_\(\s*["']/.test(raw.trim());
}

function splitWords(value: string): string[] {
	const result: string[] = [];
	let current = '';
	let quoted = false;
	for (let i = 0; i < value.length; i++) {
		const character = value[i];
		if (character === '"') quoted = !quoted;
		if (/\s/.test(character) && !quoted) {
			if (current) result.push(current);
			current = '';
		} else current += character;
	}
	if (current) result.push(current);
	return result;
}

function unquote(value: string): string {
	return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function syntax(
	code: string,
	message: string,
	file: string | undefined,
	index: number,
	lineText: string,
): MwlSyntaxError {
	return new MwlSyntaxError({
		code,
		message,
		location: { file: file ?? '<mwl>', line: index + 1, column: 1 },
		lineText,
	});
}
