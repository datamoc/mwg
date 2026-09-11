import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DataTable } from '../src/two-d/ui/DataTable.ts';

/**
 * The data table (item 261): a columned, sortable, paged roster. The two rules worth pinning are
 * that the page is derived from the highlight (so they cannot disagree) and that a sort resets the
 * highlight, since the row it pointed at has moved.
 */

interface Unit {
	name: string;
	level: number;
}

const rows: Unit[] = [
	{ name: 'Ash', level: 3 },
	{ name: 'Bo', level: 1 },
	{ name: 'Cy', level: 2 },
];

test('a table highlights the first row unless told otherwise', () => {
	const table = new DataTable<Unit>({ columns: [{ key: 'name' }], rows });
	assert.equal(table.selected?.name, 'Ash');
	assert.equal(table.selectedIndex, 0);
});

test('the page is derived from the highlighted row', () => {
	const table = new DataTable<Unit>({ columns: [{ key: 'name' }], rows, pageSize: 2 });
	assert.equal(table.pageCount, 2);
	assert.equal(table.page, 0);

	table.move(1);
	assert.equal(table.page, 0);
	table.move(1);
	assert.equal(table.page, 1, 'row 2 is on the second page of two');
	assert.deepEqual(
		table.pageRows.map((row) => row.name),
		['Cy'],
	);
});

test('setPage lands on the first selectable row of that page', () => {
	const table = new DataTable<Unit>({
		columns: [{ key: 'name' }],
		rows,
		pageSize: 2,
		disabled: (row) => row.name === 'Cy',
	});
	table.setPage(1);
	assert.equal(table.selected?.name, 'Ash', 'Cy is disabled, so the highlight does not move into it');
});

test('sortBy sorts ascending, then toggles on a repeat of the same key', () => {
	const table = new DataTable<Unit>({ columns: [{ key: 'level' }], rows });

	table.sortBy('level');
	assert.deepEqual(
		table.rows.map((row) => row.level),
		[1, 2, 3],
	);
	assert.equal(table.sortAscending, true);

	table.sortBy('level');
	assert.deepEqual(
		table.rows.map((row) => row.level),
		[3, 2, 1],
	);
	assert.equal(table.sortAscending, false);
});

test('a sort resets the highlight and fires onChange', () => {
	const table = new DataTable<Unit>({ columns: [{ key: 'level' }], rows });
	table.move(2);
	assert.equal(table.selectedIndex, 2);

	let changes = 0;
	table.onChange.add(() => {
		changes++;
	});
	table.sortBy('level');
	assert.equal(table.selectedIndex, 0);
	assert.equal(changes, 1);
});

test('a column with its own compare sorts by that, not by the field', () => {
	const table = new DataTable<Unit>({
		columns: [{ key: 'name', compare: (a, b) => b.name.localeCompare(a.name) }],
		rows,
	});
	table.sortBy('name');
	assert.deepEqual(
		table.rows.map((row) => row.name),
		['Cy', 'Bo', 'Ash'],
	);
});

test('move skips disabled rows and stops at the ends', () => {
	const table = new DataTable<Unit>({
		columns: [{ key: 'name' }],
		rows,
		disabled: (row) => row.name === 'Bo',
	});
	table.move(1);
	assert.equal(table.selected?.name, 'Cy', 'Bo is skipped');
	table.move(1);
	assert.equal(table.selected?.name, 'Cy', 'the end stops the highlight');
});

test('sorting by a column that is removed drops the sort key', () => {
	const table = new DataTable<Unit>({ columns: [{ key: 'level' }], rows });
	table.sortBy('level');
	assert.equal(table.sortKey, 'level');

	table.setColumns([{ key: 'name' }]);
	assert.equal(table.sortKey, null);
	assert.equal(table.sortBy('missing'), undefined, 'an unknown key is ignored');
});
