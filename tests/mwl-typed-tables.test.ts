import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileSources } from '../src/mwl/compiler.ts';
import { publicPathMap } from './helpers/publicPaths.ts';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
import { contentCatalog } from '../src/mwl/content.ts';
import { emitTableTypes, typedRows } from '../src/mwl/tables.ts';
import type { MwlTableColumn } from '../src/mwl/schema.ts';
import type { MwlColumnValueType } from '../src/mwl/tables.ts';

const gearColumns = [
	{ name: 'name', type: 'string' },
	{ name: 'cost', type: 'number' },
	{ name: 'cursed', type: 'boolean' },
	{ name: 'kinds', type: 'list' },
	{ name: 'mods', type: 'map' },
] as const satisfies readonly MwlTableColumn[];

const gearSource = `{ tag: 'table', id: 'gear', columns: 'name:string|cost:number|cursed:boolean|kinds:list|mods:map', children: [
	{ tag: 'row', name: 'sword', cost: '3', cursed: 'yes', kinds: 'sharp;shiny', mods: 'atk=2;def=1' },
] }`;

function gearTable() {
	const game = compileSources([{ file: 'content.mwl', source: `[${gearSource}]` }]);
	const table = contentCatalog(game).tables.find((entry) => entry.id === 'gear');
	assert.ok(table);
	return table;
}

test('typed rows carry every coerced column type and omit absent cells', () => {
	const rows = typedRows({ columns: gearColumns, rows: gearTable().rows });
	assert.deepEqual(rows[0], {
		name: 'sword',
		cost: 3,
		cursed: true,
		kinds: ['sharp', 'shiny'],
		mods: { atk: '2', def: '1' },
	});
	//each field infers its declared type with no cast at the use
	const cost: number | undefined = rows[0]?.cost;
	const cursed: boolean | undefined = rows[0]?.cursed;
	const kinds: string[] | undefined = rows[0]?.kinds;
	const mods: Record<string, string> | undefined = rows[0]?.mods;
	assert.deepEqual([cost, cursed, kinds, mods], [3, true, ['sharp', 'shiny'], { atk: '2', def: '1' }]);
});

test('absent cells stay absent and read as undefined', () => {
	//contentCatalog omits a missing cell instead of coercing a default, so a row
	//built without validation (or from a partially authored table) still reads safely
	const rows = typedRows({ columns: gearColumns, rows: [{ name: 'torch' }] });
	assert.equal(rows[0]?.name, 'torch');
	assert.equal(rows[0]?.cost, undefined);
});

test('the mapped row matches a hand-written interface field for field', () => {
	interface GearRow {
		name?: string;
		cost?: number;
		cursed?: boolean;
		kinds?: string[];
		mods?: Record<string, string>;
	}
	//compiles only when MwlTypedRow produces exactly the shape emitTableTypes writes
	const named: GearRow[] = typedRows({ columns: gearColumns, rows: gearTable().rows });
	assert.equal(named[0]?.cost, 3);
});

test('uses of a column break when its declared type changes', () => {
	const rows = typedRows({ columns: gearColumns, rows: gearTable().rows });
	const total = (rows[0]?.cost ?? 0) + 1;
	assert.equal(total, 4);
	// @ts-expect-error - cost as declared here is a number, not a string
	const label: string = rows[0]?.cost;
	assert.equal(typeof label, 'number');
});

test('uses of a column break when it is removed from the declaration', () => {
	const slim = typedRows({
		columns: [{ name: 'cost', type: 'number' }] as const satisfies readonly MwlTableColumn[],
		rows: gearTable().rows,
	});
	assert.equal(slim[0]?.cost, 3);
	// @ts-expect-error - kind is not declared on this table
	const kind: string | undefined = slim[0]?.kind;
	assert.equal(kind, undefined);
});

test('column value types describe the coerced values exactly', () => {
	const cost: MwlColumnValueType<'number'> = 3;
	const cursed: MwlColumnValueType<'boolean'> = false;
	const kinds: MwlColumnValueType<'list'> = ['sharp'];
	const mods: MwlColumnValueType<'map'> = { atk: '2' };
	const name: MwlColumnValueType<'string'> = 'sword';
	assert.deepEqual([cost, cursed, kinds, mods, name], [3, false, ['sharp'], { atk: '2' }, 'sword']);
});

test('emitTableTypes names one interface and one accessor per table', () => {
	const game = compileSources([
		{
			file: 'content.mwl',
			source: `[{ tag: 'monster', id: 'goblin' }, { tag: 'table', id: 'roster', columns: 'kind:string', children: [{ tag: 'row', kind: 'goblin' }] }]`,
		},
	]);
	const output = emitTableTypes(contentCatalog(game).tables);
	assert.equal(
		output,
		[
			'// Generated from MWL tables - do not edit by hand.',
			`import { typedRows } from '@datamoc/mw_games/mwl';`,
			`import type { MwlContentCatalog } from '@datamoc/mw_games/mwl';`,
			'',
			'const RosterColumns = [{ name: "kind", type: "string" }] as const;',
			'export interface RosterRow {',
			'\tkind?: string;',
			'}',
			'',
			'/** Typed rows of the `roster` table. */',
			`export function rosterRows(catalog: Pick<MwlContentCatalog, 'tables'>): RosterRow[] {`,
			'\tconst table = catalog.tables.find((entry) => entry.id === "roster");',
			'\treturn typedRows({ columns: RosterColumns, rows: table?.rows ?? [] });',
			'}',
		].join('\n') + '\n',
	);
});

test('emitTableTypes sanitizes odd ids, escapes literals, and dedupes names', () => {
	const output = emitTableTypes([
		{
			id: 'boss-loot',
			columns: [{ name: 'kind-name', type: 'string' }],
			rows: [],
		},
		{
			id: 'boss loot',
			columns: [{ name: 'cost', type: 'number' }],
			rows: [],
		},
		{
			id: 'weird"id',
			columns: [{ name: 'mods', type: 'map' }],
			rows: [],
		},
	]);
	assert.ok(output.includes('export interface BossLootRow {'));
	assert.ok(output.includes(`"kind-name"?: string;`));
	assert.ok(output.includes('export interface BossLoot2Row {'));
	assert.ok(output.includes('export function bossLoot2Rows('));
	assert.ok(output.includes('export interface WeirdIdRow {'));
	assert.ok(output.includes('entry.id === "weird\\"id"'));
	assert.ok(output.includes('mods?: Record<string, string>;'));
});

test('emitTableTypes with no tables emits the header alone', () => {
	assert.equal(emitTableTypes([]), '// Generated from MWL tables - do not edit by hand.\n');
	assert.equal(emitTableTypes([], { header: 'custom' }), '// custom\n');
});

test('emitted modules compile against the real public import paths', () => {
	const game = compileSources([{ file: 'content.mwl', source: `[${gearSource}]` }]);
	const output = emitTableTypes(contentCatalog(game).tables);
	const scratch = join(ROOT, '.example-check');
	mkdirSync(scratch, { recursive: true });
	const dir = mkdtempSync(join(scratch, 'table-types-'));
	try {
		const generated = join(dir, 'tables.gen.ts');
		const use = join(dir, 'use.ts');
		writeFileSync(generated, output, 'utf8');
		writeFileSync(
			use,
			`import { gearRows } from './tables.gen.ts';\nimport type { GearRow } from './tables.gen.ts';\ndeclare const catalog: Parameters<typeof gearRows>[0];\nconst rows: GearRow[] = gearRows(catalog);\nconst cost: number | undefined = rows[0]?.cost;\nconsole.log(cost);\n`,
			'utf8',
		);
		const pathMap = publicPathMap();
		const tsconfigPath = join(dir, 'tsconfig.json');
		writeFileSync(
			tsconfigPath,
			JSON.stringify(
				{
					compilerOptions: {
						module: 'esnext',
						moduleResolution: 'bundler',
						target: 'es2022',
						strict: true,
						skipLibCheck: true,
						noEmit: true,
						types: [],
						allowImportingTsExtensions: true,
						paths: Object.fromEntries(
							Object.entries(pathMap).map(([specifier, path]) => [specifier, [path]]),
						),
					},
					include: [generated, use],
				},
				null,
				2,
			),
			'utf8',
		);
		try {
			execFileSync('npx', ['tsc', '--noEmit', '-p', tsconfigPath], { cwd: ROOT, stdio: 'pipe', shell: true });
		} catch (error) {
			const detail = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
			assert.fail(`emitted table types fail to compile:\n\n${detail}`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
