import type { MwlCompiledGame, MwlCompiledNode } from './compiler.ts';
import type { MwlDiagnostic, MwlLocation, MwlNode } from './grammar.ts';
import { collectHookReferences, parseHookReference, validateHookAttributes, type MwlHookDeclaration } from './hooks.ts';
import { parseTableColumns, type MwlTableColumn } from './schema.ts';
import { flattenNodes } from './utils.ts';

/**
 * One declarative cross-table reference: a column of one `[table]` whose every cell must
 * resolve, either against a column of another `[table]` or against a closed value set.
 * The declaration names the shape; the *contents* (which column points where, which set is
 * legal) stay game data in the consuming repository.
 *
 * @example
 * ```ts
 * import { compile, validateCatalog } from '@datamoc/mw_games/mwl';
 *
 * const game = compile(
 * 	"[{ tag: 'table', id: 'items', columns: 'id:string', children: [{ tag: 'row', id: 'sword' }] }, { tag: 'table', id: 'recipes', columns: 'ingredient:string', children: [{ tag: 'row', ingredient: 'sword' }] }]",
 * );
 * const declarations = [{ table: 'recipes', column: 'ingredient', references: { table: 'items', column: 'id' } }];
 * console.log(validateCatalog(game, { tableReferences: declarations })); // []
 * ```
 */
export type MwlTableReference =
	| {
			/** id of the `[table]` holding the referencing column */
			readonly table: string;
			/** column whose cells must resolve */
			readonly column: string;
			/** the referenced table and the column its values are drawn from */
			readonly references: { readonly table: string; readonly column: string };
	  }
	| {
			/** id of the `[table]` holding the referencing column */
			readonly table: string;
			/** column whose cells must resolve */
			readonly column: string;
			/** the exact closed set the column's cells must belong to */
			readonly oneOf: readonly string[];
	  };

export interface MwlValidationOptions {
	/** Slots are game-defined. Supplying them enables unknown-slot diagnostics. */
	readonly slots?: readonly string[];
	/**
	 * Hooks exported by the game's adapter, by `type:name`. A bare id declares the hook exists;
	 * `MwlHookDeclaration` additionally declares the attributes its `[hook]` calls carry, which
	 * is what turns a typo in one of them into a compile-time diagnostic.
	 */
	readonly hooks?: readonly (string | MwlHookDeclaration)[];
	/** Additional game-owned attributes whose values are domain hook references. */
	readonly hookAttributes?: readonly string[];
	/** Optional map dimensions used to reject authored coordinates outside the map. */
	readonly mapBounds?: { readonly width: number; readonly height: number };
	/**
	 * Declarative cross-table references (item 362): each entry names a `[table]` column whose
	 * cells must resolve against another table's column or a closed value set. A failure reports
	 * the table, the row, and the offending value. Purely additive and optional: saves, replays
	 * and every existing check are untouched when it is absent.
	 */
	readonly tableReferences?: readonly MwlTableReference[];

	/**
	 * What `MWL_DUPLICATE_ID`'s `tag:id` key is scoped to.
	 *
	 * Defaults to `'global'`: the whole compiled catalog, every source file combined, so the
	 * same `[item] id=sword` in two different files is one real duplicate. A game whose own id
	 * convention is meaningful only within one file - a domain- or table-scoped id, reused on
	 * purpose across files the way a database's own per-table primary key is - wants `'file'`
	 * instead, which folds each node's source file into the key so that reuse across files no
	 * longer reports a false `MWL_DUPLICATE_ID`; a real duplicate *within* one file still does.
	 */
	readonly rowIdScope?: 'global' | 'file';
}

/** Semantic checks shared by all games. Domain rules remain in the game adapter. */
export function validateCatalog(game: MwlCompiledGame, options: MwlValidationOptions = {}): MwlDiagnostic[] {
	const diagnostics: MwlDiagnostic[] = [];
	const ids = new Map<string, MwlCompiledNode>();
	const nodes = flattenNodes(game.roots);
	for (const node of nodes) {
		const id = node.attributes.id;
		if (id) {
			const scope = options.rowIdScope === 'file' ? (node.location?.file ?? '<mwl>') : '';
			const key = `${scope}\0${node.tag}:${id}`;
			const previous = ids.get(key);
			if (previous)
				diagnostics.push(
					diagnostic(
						'MWL_DUPLICATE_ID',
						`duplicate ${node.tag} id "${id}"`,
						node.location ?? previous.location,
					),
				);
			else ids.set(key, node);
		}
		if (
			node.tag === 'item' &&
			options.slots &&
			node.attributes.slot &&
			!options.slots.includes(node.attributes.slot)
		)
			diagnostics.push(
				diagnostic('MWL_UNKNOWN_SLOT', `unknown equipment slot "${node.attributes.slot}"`, node.location),
			);
		if (node.tag === 'effect') {
			const operations = [
				'add',
				'sub',
				'multiply',
				'divide',
				'set',
				'increase',
				'increase_total',
				'increase_damage',
			].filter((key) => node.attributes[key] !== undefined);
			if (!node.attributes.apply_to || operations.length !== 1)
				diagnostics.push(
					diagnostic(
						'MWL_INCOMPLETE_EFFECT',
						'an effect needs apply_to and exactly one operation',
						node.location,
					),
				);
		}
		validateCoordinateBounds(node, options.mapBounds, diagnostics);
	}
	validateAliasCycles(nodes, diagnostics);
	validateTableReferences(nodes, options.tableReferences, diagnostics);
	const references = collectHookReferences(game, ['hook', 'migration', ...(options.hookAttributes ?? [])]);
	const declarations = new Map<string, MwlHookDeclaration>();
	for (const hook of options.hooks ?? [])
		declarations.set(typeof hook === 'string' ? hook : hook.id, typeof hook === 'string' ? { id: hook } : hook);
	for (const node of nodes) {
		const raw = node.attributes.hook ?? (node.tag === 'hook' ? node.attributes.name : undefined);
		if (raw !== undefined && !parseHookReference(raw))
			diagnostics.push(diagnostic('MWL_INVALID_HOOK', `invalid hook reference "${raw}"`, node.location));
		const declaration =
			node.tag === 'hook' && node.attributes.name ? declarations.get(node.attributes.name) : undefined;
		if (declaration) diagnostics.push(...validateHookAttributes(node, declaration));
	}
	if (options.hooks)
		for (const reference of references)
			if (!declarations.has(`${reference.type}:${reference.name}`))
				diagnostics.push(
					diagnostic(
						'MWL_UNKNOWN_HOOK',
						`hook ${reference.type}:${reference.name} is not declared by the game`,
						reference.location,
					),
				);
	return diagnostics;
}

/** Reports cycles in the conventional comma-separated `aliasof` graph without imposing
 * domain meaning on aliases that point outside the catalog (for example Wesnoth's `_bas`). */
function validateAliasCycles(nodes: readonly MwlCompiledNode[], diagnostics: MwlDiagnostic[]): void {
	const byTagAndId = new Map<string, MwlCompiledNode>();
	for (const node of nodes) {
		const id = node.attributes.id;
		if (id) byTagAndId.set(`${node.tag}\0${id}`, node);
	}
	const visiting = new Set<MwlCompiledNode>();
	const visited = new Set<MwlCompiledNode>();
	const reported = new Set<string>();
	const walk = (node: MwlCompiledNode, trail: MwlCompiledNode[]): void => {
		if (visiting.has(node)) {
			const start = trail.indexOf(node);
			const cycle = trail
				.slice(start)
				.map((entry) => `${entry.tag}:${entry.attributes.id ?? '<anonymous>'}`)
				.sort()
				.join('|');
			if (reported.has(cycle)) return;
			reported.add(cycle);
			diagnostics.push({
				code: 'MWL_ALIAS_CYCLE',
				message: `alias cycle through ${trail
					.slice(start)
					.map((entry) => entry.attributes.id ?? entry.tag)
					.join(' -> ')}`,
				location:
					node.valueLocations?.aliasof ??
					node.attributeLocations?.aliasof ??
					node.location ??
					fallbackLocation(),
			});
			return;
		}
		if (visited.has(node)) return;
		visiting.add(node);
		for (const alias of (node.attributes.aliasof ?? '')
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)) {
			const target = byTagAndId.get(`${node.tag}\0${alias}`);
			if (target) walk(target, [...trail, node]);
		}
		visiting.delete(node);
		visited.add(node);
	};
	for (const node of nodes) if (node.attributes.aliasof !== undefined) walk(node, []);
}

/**
 * Checks every declared cross-table reference: each cell of the source column must resolve
 * against the target table's column or the closed set. A failure reports the table, the row
 * and the offending value. Absent or empty cells are skipped (a missing column's shape stays
 * the schema's `MWL_TABLE` job), and a `list` cell checks each entry the way `coerceTableValue`
 * splits one. A declaration naming a table or column that is not there is itself a diagnostic,
 * so a typo in the declaration cannot pass silently.
 */
function validateTableReferences(
	nodes: readonly MwlCompiledNode[],
	declarations: readonly MwlTableReference[] | undefined,
	diagnostics: MwlDiagnostic[],
): void {
	if (!declarations) return;
	const tables = new Map<string, MwlCompiledNode>();
	for (const node of nodes) {
		const id = node.tag === 'table' ? node.attributes.id : undefined;
		if (id && !tables.has(id)) tables.set(id, node);
	}
	const columnsOf = (table: MwlCompiledNode): MwlTableColumn[] | undefined => {
		try {
			return parseTableColumns(table.attributes.columns ?? '');
		} catch {
			return undefined;
		}
	};
	const rowsOf = (table: MwlCompiledNode): MwlCompiledNode[] => table.children.filter((child) => child.tag === 'row');
	for (const declaration of declarations) {
		const source = tables.get(declaration.table);
		if (!source) {
			diagnostics.push(
				diagnostic(
					'MWL_TABLE_REFERENCE',
					`unknown table "${declaration.table}" in tableReferences`,
					fallbackLocation(),
				),
			);
			continue;
		}
		const sourceColumn = columnsOf(source)?.find((column) => column.name === declaration.column);
		if (!sourceColumn) {
			diagnostics.push(
				diagnostic(
					'MWL_TABLE_REFERENCE',
					`unknown column "${declaration.column}" in table "${declaration.table}"`,
					source.location,
				),
			);
			continue;
		}
		let allowed: ReadonlySet<string> | undefined;
		let expectation: string | undefined;
		if ('oneOf' in declaration) {
			allowed = new Set(declaration.oneOf);
			expectation = 'one of the declared values';
		} else {
			const target = tables.get(declaration.references.table);
			const targetColumn = target
				? columnsOf(target)?.find((column) => column.name === declaration.references.column)
				: undefined;
			if (!target || !targetColumn) {
				diagnostics.push(
					diagnostic(
						'MWL_TABLE_REFERENCE',
						`unknown reference target "${declaration.references.table}.${declaration.references.column}" for table "${declaration.table}" column "${declaration.column}"`,
						source.location,
					),
				);
				continue;
			}
			const values = new Set<string>();
			for (const row of rowsOf(target))
				for (const value of cellsOf(row, targetColumn, target.attributes.list_delimiter)) values.add(value);
			allowed = values;
			expectation = `${declaration.references.table}.${declaration.references.column}`;
		}
		const delimiter = source.attributes.list_delimiter;
		rowsOf(source).forEach((row, index) => {
			for (const value of cellsOf(row, sourceColumn, delimiter))
				if (!allowed.has(value))
					diagnostics.push({
						code: 'MWL_TABLE_REFERENCE',
						message: `table "${declaration.table}" row ${index + 1} column "${declaration.column}": unknown value "${value}" (expected ${expectation})`,
						location:
							row.valueLocations?.[declaration.column] ??
							row.attributeLocations?.[declaration.column] ??
							row.location ??
							fallbackLocation(),
					});
		});
	}
}

/** The authored values one row contributes for a reference check: every `list` entry, else the cell. */
function cellsOf(row: MwlCompiledNode, column: MwlTableColumn, listDelimiter: string | undefined): string[] {
	const raw = row.attributes[column.name];
	if (raw === undefined || raw === '') return [];
	if (column.type !== 'list') return [raw];
	return raw
		.split(listDelimiter ?? ';')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

function diagnostic(code: string, message: string, location: MwlLocation | undefined): MwlDiagnostic {
	return { code, message, location: location ?? fallbackLocation() };
}

function fallbackLocation(): MwlLocation {
	return { file: '<mwl>', line: 1, column: 1 };
}

function validateCoordinateBounds(
	node: MwlCompiledNode,
	bounds: MwlValidationOptions['mapBounds'],
	diagnostics: MwlDiagnostic[],
): void {
	if (!bounds) return;
	for (const axis of ['x', 'y'] as const) {
		const raw = node.attributes[axis];
		if (raw === undefined) continue;
		const limit = axis === 'x' ? bounds.width : bounds.height;
		if (!Number.isInteger(limit) || limit <= 0) continue;
		const values = raw.split(',').flatMap((part) => {
			const value = part.trim();
			const range = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(value);
			return range ? [Number(range[1]), Number(range[2])] : /^-?\d+$/.test(value) ? [Number(value)] : [];
		});
		if (values.length > 0 && values.some((value) => value < 0 || value >= limit))
			diagnostics.push({
				code: 'MWL_COORDINATE',
				message: `${axis} coordinate is outside the ${limit}-cell map bound`,
				location: node.valueLocations?.[axis] ??
					node.attributeLocations?.[axis] ??
					node.location ?? {
						file: '<mwl>',
						line: 1,
						column: 1,
					},
			});
	}
}

/**
 * Convenience for adapters that keep parsed nodes rather than compiled games.
 *
 * @example
 * ```ts
 * import { parse, validateCatalogNodes } from '@datamoc/mw_games/mwl';
 *
 * console.log(validateCatalogNodes(parse('[game]\nschema=0.1\n[/game]'))); // []
 * ```
 */
export function validateCatalogNodes(nodes: readonly MwlNode[], options: MwlValidationOptions = {}): MwlDiagnostic[] {
	const fake = { schema: '0.1', roots: nodes as readonly MwlCompiledNode[], assets: [], messages: [] };
	return validateCatalog(fake, options);
}
