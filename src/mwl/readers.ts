import type { MwlCompiledNode } from './compiler.ts';
import type { MwlDiagnostic } from './grammar.ts';
import { isMwlId } from './schema.ts';

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

export type MwlTableKeyPart = string | number | boolean | null;

export type MwlTableKey<Row extends Record<string, unknown>> =
	keyof Row | readonly (keyof Row)[] | ((row: Row) => MwlTableKeyPart | readonly MwlTableKeyPart[]);

export interface MwlTableMapOptions<Row extends Record<string, unknown>, Value = Row> {
	/** one column, several columns for a composite key, or a complete key projection */
	readonly key: MwlTableKey<Row>;
	/** defaults to the complete row */
	readonly value?: (row: Row) => Value;
	/** duplicate keys fail by default; `last` is useful for deliberate override tables */
	readonly duplicate?: 'error' | 'last';
}

/**
 * Read a compiled node with one shared coercion and diagnostic policy.
 *
 * @example
 * ```ts
 * import { compile, readAttributes } from '@datamoc/mw_games/mwl';
 *
 * const game = compile("[{ tag: 'game', schema: 0.1 }]");
 * const { value } = readAttributes(game.roots[0]!, { schema: { type: 'string' } });
 * console.log(value.schema); // '0.1'
 * ```
 */
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

/**
 * Collect children without making every game adapter repeat this filter.
 *
 * @example
 * ```ts
 * import { compile, readAttributes, readChildren } from '@datamoc/mw_games/mwl';
 *
 * const game = compile("[{ tag: 'game', schema: 0.1, children: [{ tag: 'side', id: 1 }] }]");
 * const sides = readChildren(game.roots[0]!, 'side', (child) => readAttributes(child, { id: { type: 'id' } }));
 * console.log(sides.value.length); // 1
 * ```
 */
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

/**
 * Projects rows into a typed map. An array of column names is a native composite key and is
 * encoded without collisions between strings, numbers, booleans, and null.
 *
 * @example
 * ```ts
 * import { readTableMap, tableKey } from '@datamoc/mw_games/mwl';
 * const effects = [{ item: 'potion', effect: 'heal', amount: 5 }];
 * const byEffect = readTableMap(effects, { key: ['item', 'effect'], value: (row) => row.amount });
 * console.log(byEffect.get(tableKey('potion', 'heal'))); // 5
 * ```
 */
export function readTableMap<Row extends Record<string, unknown>, Value = Row>(
	rows: readonly Row[],
	options: MwlTableMapOptions<Row, Value>,
): Map<string, Value> {
	const result = new Map<string, Value>();
	for (const row of rows) {
		const key = tableKey(...resolveKey(row, options.key));
		if (result.has(key) && options.duplicate !== 'last') throw new Error(`duplicate table key: ${key}`);
		result.set(key, options.value ? options.value(row) : (row as unknown as Value));
	}
	return result;
}

/**
 * Builds an inverse index, retaining every row that shares a projected key.
 *
 * @example
 * ```ts
 * import { readTableIndex, tableKey } from '@datamoc/mw_games/mwl';
 * const rows = [{ item: 'potion', effect: 'heal' }, { item: 'herb', effect: 'heal' }];
 * const byEffect = readTableIndex(rows, { key: 'effect' });
 * console.log(byEffect.get(tableKey('heal'))?.length); // 2
 * ```
 */
export function readTableIndex<Row extends Record<string, unknown>>(
	rows: readonly Row[],
	options: Pick<MwlTableMapOptions<Row>, 'key'>,
): Map<string, Row[]> {
	const result = new Map<string, Row[]>();
	for (const row of rows) {
		const key = tableKey(...resolveKey(row, options.key));
		const bucket = result.get(key);
		if (bucket) bucket.push(row);
		else result.set(key, [row]);
	}
	return result;
}

/** Returns the stable, collision-free representation used by table maps and indexes. */
export function tableKey(...parts: MwlTableKeyPart[]): string {
	return JSON.stringify(parts);
}

function resolveKey<Row extends Record<string, unknown>>(row: Row, key: MwlTableKey<Row>): MwlTableKeyPart[] {
	if (typeof key === 'function') {
		const value = key(row);
		return isTableKeyParts(value) ? [...value] : [value];
	}
	if (isKeyColumns(key)) return key.map((column) => tablePart(row[column], String(column)));
	return [tablePart(row[key], String(key))];
}

function isTableKeyParts(value: MwlTableKeyPart | readonly MwlTableKeyPart[]): value is readonly MwlTableKeyPart[] {
	return Array.isArray(value);
}

function isKeyColumns<Row extends Record<string, unknown>>(key: MwlTableKey<Row>): key is readonly (keyof Row)[] {
	return Array.isArray(key);
}

function tablePart(value: unknown, column: string): MwlTableKeyPart {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		return value;
	throw new TypeError(`table key column "${column}" must be a string, number, boolean, or null`);
}

function coerce(raw: string, type: MwlReaderType): unknown {
	if (type === 'string') return raw;
	if (type === 'id') return isMwlId(raw) ? raw : undefined;
	if (type === 'number') return Number.isFinite(Number(raw)) ? Number(raw) : undefined;
	if (type === 'integer') return /^-?\d+$/.test(raw) ? Number(raw) : undefined;
	if (type === 'boolean')
		return raw === 'true' || raw === 'yes' ? true : raw === 'false' || raw === 'no' ? false : undefined;
	const parts = raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	if (type === 'id-list') return parts.every((part) => isMwlId(part)) ? parts : undefined;
	return parts.every((part) => Number.isFinite(Number(part))) ? parts.map(Number) : undefined;
}

function diagnostic(code: string, message: string, node: MwlCompiledNode): MwlDiagnostic {
	return { code, message, location: node.location ?? { file: '<mwl>', line: 1, column: 1 } };
}
