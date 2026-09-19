import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSources } from '../src/mwl/compiler.ts';
import { parse } from '../src/mwl/grammar.ts';
import { validateCatalog, validateCatalogNodes, type MwlTableReference } from '../src/mwl/catalog.ts';

const items = `{ tag: 'table', id: 'items', columns: 'id:string', children: [
	{ tag: 'row', id: 'sword' },
	{ tag: 'row', id: 'torch' },
] }`;

const recipes = (...rows: string[]): string =>
	`{ tag: 'table', id: 'recipes', columns: 'ingredient:string', children: [${rows.join(', ')}] }`;

const ingredientPointsAtItems: MwlTableReference[] = [
	{ table: 'recipes', column: 'ingredient', references: { table: 'items', column: 'id' } },
];

test('a declared cross-table reference passes when every cell resolves', () => {
	const game = compileSources([
		{ file: 'content.mwl', source: `[${items}, ${recipes(`{ tag: 'row', ingredient: 'sword' }`)}]` },
	]);
	assert.deepEqual(validateCatalog(game, { tableReferences: ingredientPointsAtItems }), []);
});

test('an unresolvable cell reports the table, the row, and the offending value', () => {
	const game = compileSources([
		{
			file: 'content.mwl',
			source: `[${items}, ${recipes(`{ tag: 'row', ingredient: 'sword' }`, `{ tag: 'row', ingredient: 'adamant' }`)}]`,
		},
	]);
	const diagnostics = validateCatalog(game, { tableReferences: ingredientPointsAtItems });
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, 'MWL_TABLE_REFERENCE');
	assert.equal(
		diagnostics[0].message,
		'table "recipes" row 2 column "ingredient": unknown value "adamant" (expected items.id)',
	);
});

test('the oneOf form checks a closed set without a second table', () => {
	const game = compileSources([
		{
			file: 'content.mwl',
			source: `[{ tag: 'table', id: 'gear', columns: 'slot:string', children: [
				{ tag: 'row', slot: 'weapon' },
				{ tag: 'row', slot: 'helm' },
			] }]`,
		},
	]);
	const declarations: MwlTableReference[] = [{ table: 'gear', column: 'slot', oneOf: ['weapon', 'armor'] }];
	const diagnostics = validateCatalog(game, { tableReferences: declarations });
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, 'MWL_TABLE_REFERENCE');
	assert.match(diagnostics[0].message, /table "gear" row 2 column "slot": unknown value "helm"/);
});

test('a list cell checks each entry, honoring the table list delimiter', () => {
	const game = compileSources([
		{
			file: 'content.mwl',
			source: `[${items}, { tag: 'table', id: 'kits', columns: 'contents:list', list_delimiter: ',', children: [
				{ tag: 'row', contents: 'sword,torch' },
				{ tag: 'row', contents: 'sword,adamant' },
			] }]`,
		},
	]);
	const declarations: MwlTableReference[] = [
		{ table: 'kits', column: 'contents', references: { table: 'items', column: 'id' } },
	];
	const diagnostics = validateCatalog(game, { tableReferences: declarations });
	assert.equal(diagnostics.length, 1);
	assert.match(diagnostics[0].message, /table "kits" row 2 column "contents": unknown value "adamant"/);
});

test('absent and empty cells are skipped: shape stays the schema job', () => {
	const game = compileSources([
		{ file: 'content.mwl', source: `[${items}, ${recipes(`{ tag: 'row', ingredient: '' }`)}]` },
	]);
	assert.deepEqual(validateCatalog(game, { tableReferences: ingredientPointsAtItems }), []);
});

test('a declaration naming a missing table, column, or target is itself a diagnostic', () => {
	const game = compileSources([{ file: 'content.mwl', source: `[${items}, ${recipes()}]` }]);
	const missingTable: MwlTableReference[] = [
		{ table: 'absent', column: 'ingredient', references: { table: 'items', column: 'id' } },
	];
	assert.match(
		validateCatalog(game, { tableReferences: missingTable })[0].message,
		/unknown table "absent" in tableReferences/,
	);
	const missingColumn: MwlTableReference[] = [
		{ table: 'recipes', column: 'absent', references: { table: 'items', column: 'id' } },
	];
	assert.match(
		validateCatalog(game, { tableReferences: missingColumn })[0].message,
		/unknown column "absent" in table "recipes"/,
	);
	const missingTarget: MwlTableReference[] = [
		{ table: 'recipes', column: 'ingredient', references: { table: 'items', column: 'absent' } },
	];
	assert.match(
		validateCatalog(game, { tableReferences: missingTarget })[0].message,
		/unknown reference target "items\.absent"/,
	);
	for (const declarations of [missingTable, missingColumn, missingTarget])
		assert.equal(validateCatalog(game, { tableReferences: declarations })[0].code, 'MWL_TABLE_REFERENCE');
});

test('a table-reference failure points at the offending row', () => {
	const game = compileSources([
		{
			file: 'content.mwl',
			source: `[${items}, { tag: 'table', id: 'recipes', columns: 'ingredient:string', children: [
				{ tag: 'row', ingredient: 'sword' },
				{ tag: 'row', ingredient: 'adamant' },
			] }]`,
		},
	]);
	const diagnostics = validateCatalog(game, { tableReferences: ingredientPointsAtItems });
	assert.equal(diagnostics[0].location.file, 'content.mwl');
	assert.equal(diagnostics[0].location.line, 6);
});

test('table references also run over parsed nodes without a compiled game', () => {
	const nodes = parse(`[${items}, ${recipes(`{ tag: 'row', ingredient: 'torch' }`)}]`, 'content.mwl');
	assert.deepEqual(validateCatalogNodes(nodes, { tableReferences: ingredientPointsAtItems }), []);
	const bad = parse(`[${items}, ${recipes(`{ tag: 'row', ingredient: 'adamant' }`)}]`, 'content.mwl');
	assert.equal(
		validateCatalogNodes(bad, { tableReferences: ingredientPointsAtItems })[0].code,
		'MWL_TABLE_REFERENCE',
	);
});
