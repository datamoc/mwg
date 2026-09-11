import type { MwlCompiledNode } from './compiler.ts';
import type { MwlDiagnostic } from './grammar.ts';

export type MwlReaderType = 'string' | 'id' | 'number' | 'integer' | 'boolean' | 'id-list' | 'number-list';

export interface MwlFieldSpec {
	readonly type: MwlReaderType;
	readonly source?: string;
	readonly required?: boolean;
	readonly default?: unknown;
}

export interface MwlReadResult<T> {
	readonly value: T;
	readonly diagnostics: readonly MwlDiagnostic[];
}

/** Read a compiled node with one shared coercion and diagnostic policy. */
export function readAttributes<T extends Record<string, unknown>>(
	node: MwlCompiledNode,
	fields: Readonly<Record<keyof T & string, MwlFieldSpec>>,
): MwlReadResult<T> {
	const value: Record<string, unknown> = {};
	const diagnostics: MwlDiagnostic[] = [];
	for (const [name, spec] of Object.entries(fields)) {
		const source = spec.source ?? name;
		const raw = node.attributes[source];
		if (raw === undefined) {
			if (spec.required)
				diagnostics.push(diagnostic('MWL_REQUIRED_FIELD', `missing required attribute "${source}"`, node));
			else if (spec.default !== undefined) value[name] = spec.default;
			continue;
		}
		const converted = coerce(raw, spec.type);
		if (converted === undefined)
			diagnostics.push(
				diagnostic('MWL_FIELD_TYPE', `invalid ${spec.type} attribute "${source}": "${raw}"`, node),
			);
		else value[name] = converted;
	}
	return { value: value as T, diagnostics };
}

/** Collect children without making every game adapter repeat this filter. */
export function readChildren<T>(
	node: MwlCompiledNode,
	tag: string,
	read: (child: MwlCompiledNode) => MwlReadResult<T>,
): MwlReadResult<readonly T[]> {
	const values: T[] = [];
	const diagnostics: MwlDiagnostic[] = [];
	for (const child of node.children) {
		if (child.tag !== tag) continue;
		const result = read(child);
		values.push(result.value);
		diagnostics.push(...result.diagnostics);
	}
	return { value: values, diagnostics };
}

function coerce(raw: string, type: MwlReaderType): unknown {
	if (type === 'string') return raw;
	if (type === 'id') return /^[A-Za-z_][\w.-]*$/.test(raw) ? raw : undefined;
	if (type === 'number') return Number.isFinite(Number(raw)) ? Number(raw) : undefined;
	if (type === 'integer') return /^-?\d+$/.test(raw) ? Number(raw) : undefined;
	if (type === 'boolean')
		return raw === 'true' || raw === 'yes' ? true : raw === 'false' || raw === 'no' ? false : undefined;
	const parts = raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	if (type === 'id-list') return parts.every((part) => /^[A-Za-z_][\w.-]*$/.test(part)) ? parts : undefined;
	return parts.every((part) => Number.isFinite(Number(part))) ? parts.map(Number) : undefined;
}

function diagnostic(code: string, message: string, node: MwlCompiledNode): MwlDiagnostic {
	return { code, message, location: node.location ?? { file: '<mwl>', line: 1, column: 1 } };
}
