import type { CsvColumnType } from '../core/Csv.ts';
import type { MwlTableDefinition } from './content.ts';
import type { MwlTableColumn } from './schema.ts';

/**
 * The TypeScript type one coerced table cell holds, mirroring `coerceTableValue`
 * exactly: `string` stays a string, `number`/`boolean` coerce to their namesakes,
 * `list` splits into a string array, and `map` splits into a string-to-string record.
 * Runtime coercion stays authoritative; this type only describes its results.
 *
 * @example
 * ```ts
 * import type { MwlColumnValueType } from '@datamoc/mw_games/mwl';
 *
 * const cost: MwlColumnValueType<'number'> = 3;
 * const kinds: MwlColumnValueType<'list'> = ['sharp', 'shiny'];
 * console.log(cost, kinds.length); // 3 2
 * ```
 */
export type MwlColumnValueType<Type extends CsvColumnType> = Type extends 'number'
	? number
	: Type extends 'boolean'
		? boolean
		: Type extends 'list'
			? string[]
			: Type extends 'map'
				? Record<string, string>
				: string;

/**
 * A table's rows with each declared column's name and coerced value type.
 *
 * Every field is optional because an absent cell omits the key: `MWL_TABLE`
 * validation reports the missing column, but `contentCatalog` still returns the
 * row without it, so readers must not assume presence. Deriving from the
 * declaration (rather than casting each access) is what turns a renamed column
 * type or a removed column into a compile error at every use.
 *
 * @example
 * ```ts
 * import { typedRows } from '@datamoc/mw_games/mwl';
 * import type { MwlTableColumn } from '@datamoc/mw_games/mwl';
 *
 * const columns = [
 * 	{ name: 'kind', type: 'string' },
 * 	{ name: 'cost', type: 'number' },
 * ] as const satisfies readonly MwlTableColumn[];
 * const rows = typedRows({ columns, rows: [{ kind: 'torch', cost: 3 }] });
 * console.log(rows[0]?.cost); // 3
 * ```
 */
export type MwlTypedRow<Columns extends readonly MwlTableColumn[]> = {
	[Column in Columns[number] as Column['name']]?: MwlColumnValueType<Column['type']>;
};

/**
 * Reads a table's rows through its declared columns, so consumer code names
 * fields instead of casting them. The columns need literal names and types for
 * inference (`as const`, or the output of `emitTableTypes`); a widened
 * `MwlTableColumn[]` (such as `contentCatalog` returns) yields a loose row.
 * The cast is sound because `coerceTableValue` and `MWL_TABLE` validation own
 * the values - this only names what they already guarantee.
 *
 * @example
 * ```ts
 * import { typedRows } from '@datamoc/mw_games/mwl';
 * import type { MwlTableColumn } from '@datamoc/mw_games/mwl';
 *
 * const columns = [{ name: 'cost', type: 'number' }] as const satisfies readonly MwlTableColumn[];
 * const rows = typedRows({ columns, rows: [{ cost: 3 }] });
 * console.log(rows[0]?.cost); // 3
 * ```
 */
export function typedRows<const Columns extends readonly MwlTableColumn[]>(table: {
	readonly columns: Columns;
	readonly rows: readonly Readonly<Record<string, unknown>>[];
}): MwlTypedRow<Columns>[] {
	return table.rows as MwlTypedRow<Columns>[];
}

/** Options for {@link emitTableTypes}. */
export interface EmitTableTypesOptions {
	/** comment lines opening the generated module; defaults to a do-not-edit note */
	readonly header?: string;
}

/**
 * Emits a TypeScript module with one named row interface and one typed row
 * accessor per table, for a game's own build script to write and import. The
 * declarations describe the same values `contentCatalog` returns - column type
 * for column type, every field optional for the absent-cell rule above - so
 * regenerating after an MWL edit turns a changed column type or a removed
 * column into a compile error wherever the old shape was used.
 *
 * @example
 * ```ts
 * import { compile, contentCatalog, emitTableTypes } from '@datamoc/mw_games/mwl';
 *
 * const catalog = contentCatalog(
 * 	compile(
 * 		"[{ tag: 'table', id: 'roster', columns: 'kind:string', children: [{ tag: 'row', kind: 'goblin' }] }]",
 * 	),
 * );
 * console.log(emitTableTypes(catalog.tables).includes('export interface RosterRow')); // true
 * ```
 */
export function emitTableTypes(tables: readonly MwlTableDefinition[], options: EmitTableTypesOptions = {}): string {
	const header = options.header ?? 'Generated from MWL tables - do not edit by hand.';
	const lines = [`// ${header}`];
	if (tables.length > 0)
		lines.push(
			`import { typedRows } from '@datamoc/mw_games/mwl';`,
			`import type { MwlContentCatalog } from '@datamoc/mw_games/mwl';`,
		);
	const taken = new Set<string>();
	for (const table of tables) {
		const base = typeName(table.id, taken);
		lines.push(
			'',
			`const ${base}Columns = [${table.columns.map((column) => `{ name: ${JSON.stringify(column.name)}, type: ${JSON.stringify(column.type)} }`).join(', ')}] as const;`,
		);
		lines.push(`export interface ${base}Row {`);
		for (const column of table.columns) lines.push(`\t${fieldName(column.name)}?: ${fieldType(column.type)};`);
		lines.push('}', '', `/** Typed rows of the \`${table.id}\` table. */`);
		const accessor = `${base[0].toLowerCase()}${base.slice(1)}Rows`;
		lines.push(
			`export function ${accessor}(catalog: Pick<MwlContentCatalog, 'tables'>): ${base}Row[] {`,
			`\tconst table = catalog.tables.find((entry) => entry.id === ${JSON.stringify(table.id)});`,
			`\treturn typedRows({ columns: ${base}Columns, rows: table?.rows ?? [] });`,
			'}',
		);
	}
	return `${lines.join('\n')}\n`;
}

function typeName(id: string, taken: Set<string>): string {
	const words = id.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
	const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join('') || 'Table';
	const safe = /^[A-Za-z_$]/.test(pascal) ? pascal : `_${pascal}`;
	let name = safe;
	for (let suffix = 2; taken.has(name); suffix++) name = `${safe}${suffix}`;
	taken.add(name);
	return name;
}

function fieldName(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function fieldType(type: CsvColumnType): string {
	switch (type) {
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'list':
			return 'string[]';
		case 'map':
			return 'Record<string, string>';
		default:
			return 'string';
	}
}
