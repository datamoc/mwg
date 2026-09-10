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
	 * Names of the attributes that carried the gettext marker `_ "..."`.
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
	return expandMacros(output.join('\n'), macros, options);
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

export function parse(source: string, file = '<mwl>'): MwlNode[] {
	const roots: MwlNode[] = [];
	const stack: Array<{
		tag: string;
		attributes: Record<string, string>;
		children: MwlNode[];
		location: MwlLocation;
		gettext: string[];
	}> = [];
	const lines = source.split(/\r?\n/);
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const raw = lines[lineIndex];
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const location = { file, line: lineIndex + 1, column: Math.max(1, raw.indexOf(line) + 1) };
		const opening = /^\[([A-Za-z_][\w-]*)\]$/.exec(line);
		if (opening) {
			const node = { tag: opening[1], attributes: {}, children: [], location, gettext: [] as string[] };
			if (stack.length) stack.at(-1)!.children.push(node);
			else roots.push(node);
			stack.push(node);
			continue;
		}
		const closing = /^\[\/([A-Za-z_][\w-]*)\]$/.exec(line);
		if (closing) {
			const node = stack.pop();
			if (!node || node.tag !== closing[1])
				throw new MwlSyntaxError({
					code: 'MWL_TAG',
					message: `mismatched closing tag ${closing[1]}`,
					location,
					lineText: raw,
				});
			continue;
		}
		const attribute = /^([A-Za-z_][\w-]*)\s*=\s*(.*)$/.exec(line);
		if (attribute && stack.length) {
			const node = stack.at(-1)!;
			if (isGettext(attribute[2])) node.gettext.push(attribute[1]);
			node.attributes[attribute[1]] = parseValue(attribute[2], location, raw);
			continue;
		}
		throw new MwlSyntaxError({
			code: 'MWL_TOKEN',
			message: 'expected a tag or key=value attribute',
			location,
			lineText: raw,
		});
	}
	if (stack.length) {
		const node = stack.at(-1)!;
		throw new MwlSyntaxError({ code: 'MWL_TAG', message: `unclosed tag ${node.tag}`, location: node.location });
	}
	return roots;
}

export function parseValue(raw: string, location: MwlLocation, lineText = raw): string {
	// The gettext marker is `_` followed by a quoted string. Requiring the
	// quote is deliberate: values such as `aliasof=_bas` start with an
	// underscore and must survive unchanged.
	let value = raw.trim();
	const marker = /^_\s*"/.exec(value);
	if (marker) value = value.slice(marker[0].length - 1);
	if (value.startsWith('"')) {
		if (!value.endsWith('"') || value.length < 2)
			throw new MwlSyntaxError({ code: 'MWL_STRING', message: 'unterminated quoted value', location, lineText });
		return value.slice(1, -1).replaceAll('""', '"');
	}
	return value;
}

/** True when a raw attribute value carries the gettext marker `_ "..."`. */
export function isGettext(raw: string): boolean {
	return /^_\s*"/.test(raw.trim());
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
