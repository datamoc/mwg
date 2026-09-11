import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TabbedList } from '../src/two-d/ui/TabbedList.ts';
import type { TabbedListOptions } from '../src/two-d/ui/TabbedList.ts';

interface Item {
	name: string;
	kind: string;
	locked?: boolean;
}

const ITEMS: Item[] = [
	{ name: 'Sword', kind: 'weapon' },
	{ name: 'Bread', kind: 'food' },
	{ name: 'Shield', kind: 'armor' },
	{ name: 'Apple', kind: 'food' },
	{ name: 'Dagger', kind: 'weapon' },
];

function list(options: Partial<TabbedListOptions<Item>> = {}): TabbedList<Item> {
	return new TabbedList<Item>({
		tabs: [
			{ id: 'all', label: 'All' },
			{ id: 'weapon', label: 'Weapons' },
			{ id: 'food', label: 'Food' },
		],
		rowsFor: (tab) => (tab === 'all' ? ITEMS : ITEMS.filter((item) => item.kind === tab)),
		label: (item) => item.name,
		...options,
	});
}

test('the first tab and its first row are selected at construction', () => {
	const model = list();
	assert.equal(model.tab.id, 'all');
	assert.equal(model.rows.length, 5);
	assert.equal(model.selected?.name, 'Sword');
	assert.equal(model.selectedIndex, 0);
	assert.equal(model.page, 0);
	assert.equal(model.query, '');
	assert.equal(model.detailOpen, false);
});

test('the tabs are exposed in order and the current one is a tab object', () => {
	const model = list();
	assert.deepEqual(
		model.tabs.map((tab) => tab.id),
		['all', 'weapon', 'food'],
	);
	assert.deepEqual(model.tab, { id: 'all', label: 'All' });
});

test('selecting a tab swaps the rows and resets the selection to its first row', () => {
	const model = list();
	model.move(2);
	assert.equal(model.selected?.name, 'Shield');

	model.selectTab('weapon');
	assert.equal(model.tab.id, 'weapon');
	assert.deepEqual(
		model.rows.map((item) => item.name),
		['Sword', 'Dagger'],
	);
	assert.equal(model.selected?.name, 'Sword');
});

test('an unknown or disabled tab is ignored', () => {
	const model = new TabbedList<Item>({
		tabs: [
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B', disabled: true },
		],
		rowsFor: () => ITEMS,
	});
	model.selectTab('nope');
	assert.equal(model.tab.id, 'a');
	model.selectTab('b');
	assert.equal(model.tab.id, 'a', 'a disabled tab cannot be opened');
});

test('nextTab wraps around and skips disabled tabs', () => {
	const model = new TabbedList<Item>({
		tabs: [
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B', disabled: true },
			{ id: 'c', label: 'C' },
		],
		rowsFor: () => ITEMS,
	});
	model.nextTab();
	assert.equal(model.tab.id, 'c', 'the disabled b was skipped');
	model.nextTab();
	assert.equal(model.tab.id, 'a', 'and it wrapped back');
	model.nextTab(-1);
	assert.equal(model.tab.id, 'c', 'backwards too');
});

test('the default filter is a case-insensitive substring of the label', () => {
	const model = list();
	model.setQuery('sh');
	assert.deepEqual(
		model.rows.map((item) => item.name),
		['Shield'],
	);
	model.setQuery('SH');
	assert.equal(model.rows.length, 1, 'case does not matter');
	model.setQuery('');
	assert.equal(model.rows.length, 5, 'an empty query keeps everything');
});

test('a custom filter replaces the default', () => {
	const model = list({ filter: (item, query) => item.kind === 'food' && item.name.startsWith(query) });
	model.setQuery('A');
	assert.deepEqual(
		model.rows.map((item) => item.name),
		['Apple'],
	);
});

test('setting a query resets the selection to the first surviving row', () => {
	const model = list();
	model.move(3);
	assert.equal(model.selected?.name, 'Apple');

	model.setQuery('d');
	assert.deepEqual(
		model.rows.map((item) => item.name),
		['Sword', 'Bread', 'Shield', 'Dagger'],
	);
	assert.equal(model.selected?.name, 'Sword');
	assert.equal(model.page, 0);
});

test('move skips disabled rows and clamps at both ends', () => {
	const rows: Item[] = [
		{ name: 'one', kind: 'all' },
		{ name: 'two', kind: 'all', locked: true },
		{ name: 'three', kind: 'all' },
	];
	const model = new TabbedList<Item>({
		tabs: [{ id: 'all', label: 'All' }],
		rowsFor: () => rows,
		label: (item) => item.name,
		disabled: (item) => item.locked === true,
	});

	model.move(1);
	assert.equal(model.selected?.name, 'three', 'the locked row was skipped');
	model.move(1);
	assert.equal(model.selected?.name, 'three', 'already at the end');
	model.move(-1);
	assert.equal(model.selected?.name, 'one');
	model.move(-1);
	assert.equal(model.selected?.name, 'one', 'already at the start');
});

test('a list whose every row is disabled cannot move', () => {
	const model = new TabbedList<Item>({
		tabs: [{ id: 'all', label: 'All' }],
		rowsFor: () => [{ name: 'only', kind: 'all', locked: true }],
		disabled: (item) => item.locked === true,
	});
	model.move(1);
	assert.equal(model.selectedIndex, 0);
});

test('the page is derived from the selection, so they cannot disagree', () => {
	const model = list({ pageSize: 2 });
	assert.equal(model.pageCount, 3);
	assert.equal(model.page, 0);
	assert.deepEqual(
		model.pageRows.map((item) => item.name),
		['Sword', 'Bread'],
	);

	model.move(2);
	assert.equal(model.selected?.name, 'Shield');
	assert.equal(model.page, 1, 'the selection moved the page with it');
	assert.deepEqual(
		model.pageRows.map((item) => item.name),
		['Shield', 'Apple'],
	);
});

test('setPage and nextPage land on the target page first selectable row', () => {
	const model = list({ pageSize: 2 });
	model.setPage(2);
	assert.equal(model.page, 2);
	assert.deepEqual(
		model.pageRows.map((item) => item.name),
		['Dagger'],
	);
	assert.equal(model.selected?.name, 'Dagger');

	model.nextPage(-1);
	assert.equal(model.page, 1);
	assert.equal(model.selected?.name, 'Shield');

	model.setPage(99);
	assert.equal(model.page, 2, 'clamped to the last page');
	model.setPage(-5);
	assert.equal(model.page, 0, 'clamped to the first page');
});

test('without a page size every row is one page', () => {
	const model = list();
	assert.equal(model.pageCount, 1);
	model.setPage(3);
	assert.equal(model.page, 0);
	assert.equal(model.pageRows.length, 5);
});

test('an empty result set has no selection but still one empty page', () => {
	const model = list();
	model.setQuery('nothing matches this');
	assert.equal(model.rows.length, 0);
	assert.equal(model.selected, null);
	assert.equal(model.page, 0);
	assert.equal(model.pageCount, 1);
	model.move(1);
	assert.equal(model.selectedIndex, 0);
});

test('openDetail opens the selected row and closeDetail closes it', () => {
	const model = list();
	assert.equal(model.openDetail(), true);
	assert.equal(model.detailOpen, true);

	model.closeDetail();
	assert.equal(model.detailOpen, false);
});

test('openDetail refuses a disabled or absent row', () => {
	const locked: Item[] = [{ name: 'sealed', kind: 'all', locked: true }];
	const model = new TabbedList<Item>({
		tabs: [{ id: 'all', label: 'All' }],
		rowsFor: () => locked,
		disabled: (item) => item.locked === true,
	});
	assert.equal(model.openDetail(), false);
	assert.equal(model.detailOpen, false);

	const empty = list();
	empty.setQuery('no such row');
	assert.equal(empty.openDetail(), false);
});

test('onChange fires on real changes and stays quiet on no-ops', () => {
	const model = list();
	let changes = 0;
	model.onChange.add(() => {
		changes++;
	});

	model.move(1);
	assert.equal(changes, 1);
	model.move(0);
	assert.equal(changes, 1, 'no move, no event');
	model.setQuery('sword');
	assert.equal(changes, 2);
	model.setQuery('sword');
	assert.equal(changes, 2, 'the same query again is a no-op');
	model.selectTab('weapon');
	assert.equal(changes, 3);
	model.selectTab('weapon');
	assert.equal(changes, 3, 'already on that tab');
	model.openDetail();
	model.closeDetail();
	assert.equal(changes, 5);
	model.closeDetail();
	assert.equal(changes, 5, 'already closed');
});

test('rowsFor receives the open tab id, so the caller owns the taxonomy', () => {
	const seen: string[] = [];
	const model = new TabbedList<Item>({
		tabs: [
			{ id: 'x', label: 'X' },
			{ id: 'y', label: 'Y' },
		],
		rowsFor: (tab) => {
			seen.push(tab);
			return ITEMS;
		},
	});
	model.selectTab('y');
	assert.deepEqual(seen, ['x', 'y']);
});
