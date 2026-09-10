/**
 * A header-row CSV into an array of typed row objects - so a content designer edits a
 * spreadsheet instead of a `.ts` object literal for a table shaped like `actors.AffixTable`,
 * `actors.LootTable`, or any other array-of-records a game defines. The same precedent
 * `i18n`'s `parseFTL` already set: this takes a raw string and has no opinion on how that
 * string reached the game (a small table can sit in a `.ts` template literal; a larger one
 * loads through a bundler's raw-text import - Vite resolves a `?raw`-suffixed path to its
 * file's contents as a plain string - or through a game's own asset pipeline) - `mwg`
 * supplies the parsing, not the loading.
 *
 * Every cell is a string until a column says otherwise: `columns` names which fields are
 * `'number'`/`'boolean'`/`'list'` (semicolon-separated by default, for a field shaped like
 * `AffixDef.kinds`) /`'map'` (semicolon-separated `key=value` pairs, for a per-row property
 * bag such as `{ str: '2', dex: '-1' }` a game reads its own way) - and an undeclared column
 * stays a plain string. An **empty cell omits that field from the row entirely**, the same as
 * never setting an optional property - so a blank `curse` column reads exactly like the
 * `curse?: boolean` it fills never being set.
 *
 * Follows RFC 4180 far enough for real game-data text: a quoted field may contain the
 * delimiter, a newline, or an escaped `""` for a literal quote, which a naive `split(',')`
 * cannot survive the moment a description contains a comma.
 *
 * What this cannot hold: a `core.ReactionTable` rule's `when`/`action` are executable code,
 * not data, so no cell format expresses them - the same boundary `AffixDef.id` already draws
 * (a string the game interprets, `mwg` never does). A CSV row can drive *which* reactions a
 * game builds at startup (an id, a comparison string like `'hp<=0.25'`, a threshold number a
 * `'number'` column already coerces) with the game's own code turning each row into a real
 * `ReactionRule`; it cannot hold the rule's logic itself.
 *
 * @example
 * ```ts
 * import { parseCSV } from '@datamoc/mw_games/core';
 * import type { AffixDef, AffixTable } from '@datamoc/mw_games/actors';
 *
 * const csv = `id,trigger,weight,curse,description
 * blazing,strike,3,,Ignites the victim
 * wayward,strike,1,true,"Cursed: -3 accuracy"`;
 *
 * const table: AffixTable = {
 *   entries: parseCSV<AffixDef>(csv, { columns: { weight: 'number', curse: 'boolean' } }),
 * };
 * console.log(table.entries[1]); // { id: 'wayward', trigger: 'strike', weight: 1, curse: true, description: 'Cursed: -3 accuracy' }
 * ```
 */

export type CsvColumnType = 'string' | 'number' | 'boolean' | 'list' | 'map';

export interface CsvOptions {
	/** how to interpret each named column beyond a plain string; an undeclared column stays one */
	columns?: Record<string, CsvColumnType>;

	/** splits a `'list'`/`'map'` column's cell into individual entries; default `;` */
	listDelimiter?: string;

	/** splits a `'map'` entry into its key and value; default `=` */
	mapDelimiter?: string;
}

/**
 * @example
 * ```ts
 * import { parseCSV } from '@datamoc/mw_games/core';
 *
 * const rows = parseCSV('id,weight\nblazing,3\nchilling,3', { columns: { weight: 'number' } });
 * console.log(rows); // [{ id: 'blazing', weight: 3 }, { id: 'chilling', weight: 3 }]
 * ```
 */
export function parseCSV<T = Record<string, string>>(source: string, options: CsvOptions = {}): T[] {
	const rows = tokenizeCsv(source);
	if (rows.length === 0) return [];

	const [header, ...body] = rows;
	const listDelimiter = options.listDelimiter ?? ';';
	const mapDelimiter = options.mapDelimiter ?? '=';

	return body.map((cells, rowIndex) => {
		const row: Record<string, unknown> = {};
		header.forEach((name, columnIndex) => {
			const raw = cells[columnIndex] ?? '';
			if (raw === '') return; //an empty cell omits the field, the same as an optional property never set
			row[name] = coerceCsvCell(
				raw,
				options.columns?.[name] ?? 'string',
				name,
				rowIndex,
				listDelimiter,
				mapDelimiter,
			);
		});
		return row as T;
	});
}

function coerceCsvCell(
	raw: string,
	type: CsvColumnType,
	column: string,
	rowIndex: number,
	listDelimiter: string,
	mapDelimiter: string,
): unknown {
	switch (type) {
		case 'string':
			return raw;
		case 'number': {
			const value = Number(raw);
			if (!Number.isFinite(value))
				throw new Error(`CSV row ${rowIndex + 1}, column "${column}": "${raw}" is not a number`);
			return value;
		}
		case 'boolean': {
			const lower = raw.toLowerCase();
			if (lower === 'true') return true;
			if (lower === 'false') return false;
			throw new Error(`CSV row ${rowIndex + 1}, column "${column}": "${raw}" is not "true" or "false"`);
		}
		case 'list':
			return raw
				.split(listDelimiter)
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0);
		case 'map': {
			const map: Record<string, string> = {};
			for (const entry of raw
				.split(listDelimiter)
				.map((piece) => piece.trim())
				.filter((piece) => piece.length > 0)) {
				const at = entry.indexOf(mapDelimiter);
				if (at === -1)
					throw new Error(
						`CSV row ${rowIndex + 1}, column "${column}": "${entry}" has no "${mapDelimiter}" to split a key from its value`,
					);
				map[entry.slice(0, at).trim()] = entry.slice(at + mapDelimiter.length).trim();
			}
			return map;
		}
	}
}

//RFC 4180-shaped tokenizer, char by char rather than split(',')/split('\n'): a quoted field may
//itself contain the delimiter, a bare newline, or an escaped `""` for a literal quote, none of
//which a naive split survives the moment a description column contains a comma
function tokenizeCsv(source: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	while (i < source.length) {
		const char = source[i];
		if (inQuotes) {
			if (char === '"') {
				if (source[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += char;
			i++;
			continue;
		}
		if (char === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (char === ',') {
			row.push(field);
			field = '';
			i++;
			continue;
		}
		if (char === '\r') {
			i++;
			continue;
		} //normalize CRLF, and swallow a bare CR too
		if (char === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i++;
			continue;
		}
		field += char;
		i++;
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	//a trailing newline (the common case for a hand-edited file) would otherwise flush one
	//more, entirely blank row after the real data
	return rows.filter((cells) => !(cells.length === 1 && cells[0] === ''));
}
