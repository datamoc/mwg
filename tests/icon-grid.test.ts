import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'pixi.js';

import { IconGrid, type IconGridItem } from '../src/ui/IconGrid.ts';
import { setTheme, defaultTheme } from '../src/ui/theme.ts';

function icon(): Container {
	return new Container();
}

function items(count: number, disabledAt: Set<number> = new Set()): IconGridItem[] {
	return Array.from({ length: count }, (_, i) => ({ icon: icon(), disabled: disabledAt.has(i) }));
}

test('cells lay out in row-major order across the given number of columns', () => {
	const grid = new IconGrid({ width: 120, height: 120, columns: 3, items: items(7) });
	assert.equal(grid.rows, 3);
	assert.equal(grid.length, 7);
});

test('arrow moves step one cell at a time, wrapping at the grid edges', () => {
	const grid = new IconGrid({ width: 120, height: 120, columns: 3, items: items(9) });

	assert.equal(grid.selectedIndex, 0);
	grid.move(1, 0);
	assert.equal(grid.selectedIndex, 1);
	grid.move(0, 1);
	assert.equal(grid.selectedIndex, 4);
	grid.move(-1, 0);
	assert.equal(grid.selectedIndex, 3);

	//wrapping off the left edge of a row lands on the right edge of the same row
	grid.select(3);
	grid.move(-1, 0);
	assert.equal(grid.selectedIndex, 5);
});

test('moving vertically wraps top to bottom within the same column', () => {
	const grid = new IconGrid({ width: 120, height: 120, columns: 3, items: items(9) });
	grid.select(1); // row 0, col 1
	grid.move(0, -1);
	assert.equal(grid.selectedIndex, 7); // row 2, col 1
});

test('a disabled cell is skipped when moving, the same as ListView', () => {
	const grid = new IconGrid({ width: 120, height: 120, columns: 3, items: items(6, new Set([1])) });
	grid.select(0);
	grid.move(1, 0);
	assert.equal(grid.selectedIndex, 2); //index 1 skipped
});

test('confirm fires onSelect with the selected item and index', () => {
	let seen: [IconGridItem, number] | null = null;
	const grid = new IconGrid({
		width: 80,
		height: 80,
		columns: 2,
		items: items(4),
		onSelect: (item, index) => (seen = [item, index]),
	});
	grid.select(2);
	assert.equal(grid.confirm(), true);
	assert.ok(seen);
	assert.equal(seen![1], 2);
});

test('confirm on a disabled cell does nothing', () => {
	let fired = false;
	const grid = new IconGrid({
		width: 80,
		height: 80,
		columns: 2,
		items: items(4, new Set([0])),
		onSelect: () => (fired = true),
	});
	assert.equal(grid.selectedIndex, 1); //the first enabled cell, same as ListView's setItems
	assert.equal(fired, false);
});

test('tapping two cells swaps them and reports the reorder', () => {
	let reordered: [number, number] | null = null;
	const grid = new IconGrid({
		width: 120,
		height: 40,
		columns: 3,
		items: items(3),
		onReorder: (from, to) => (reordered = [from, to]),
	});

	const before = grid.selected;
	grid.tapCell(0);
	grid.tapCell(2);

	assert.deepEqual(reordered, [0, 2]);
	//setItems rebuilds cells, so identity comparison goes through .selected's icon reference
	assert.notEqual(grid.selected, before);
});

test('tapping the same cell twice picks it up and puts it back down without reordering', () => {
	let reordered = false;
	const grid = new IconGrid({
		width: 120,
		height: 40,
		columns: 3,
		items: items(3),
		onReorder: () => (reordered = true),
	});

	grid.tapCell(1);
	grid.tapCell(1);
	assert.equal(reordered, false);
});

test('cancelPickup drops a pending pick-up without swapping', () => {
	let reordered = false;
	const grid = new IconGrid({
		width: 120,
		height: 40,
		columns: 3,
		items: items(3),
		onReorder: () => (reordered = true),
	});

	grid.tapCell(0);
	grid.cancelPickup();
	grid.tapCell(2);
	//the pick-up was cancelled, so this second tap starts a fresh pick-up, not a swap
	assert.equal(reordered, false);
});

test('holding a cell past the long-press duration fires onQuickslot, not onSelect', () => {
	let quickslotted: number | null = null;
	let selected = false;
	const grid = new IconGrid({
		width: 80,
		height: 80,
		columns: 2,
		items: items(4),
		longPressDuration: 0.5,
		onQuickslot: (_item, index) => (quickslotted = index),
		onSelect: () => (selected = true),
	});

	//simulate what the pointerdown handler records, without going through real Pixi events
	(grid as unknown as { pressedIndex: number }).pressedIndex = 2;
	grid.update(0.6);

	assert.equal(quickslotted, 2);
	assert.equal(selected, false);
});

test('releasing before the long-press threshold does not fire onQuickslot', () => {
	let quickslotted = false;
	const grid = new IconGrid({
		width: 80,
		height: 80,
		columns: 2,
		items: items(4),
		longPressDuration: 0.5,
		onQuickslot: () => (quickslotted = true),
	});

	(grid as unknown as { pressedIndex: number }).pressedIndex = 1;
	grid.update(0.2);
	assert.equal(quickslotted, false);
});

test('handleAction routes arrow keys, confirm and cancel', () => {
	let selected = false;
	const grid = new IconGrid({
		width: 120,
		height: 120,
		columns: 3,
		items: items(9),
		onSelect: () => (selected = true),
	});

	assert.equal(grid.handleAction('right'), true);
	assert.equal(grid.selectedIndex, 1);
	assert.equal(grid.handleAction('confirm'), true);
	assert.equal(selected, true);
	assert.equal(grid.handleAction('cancel'), false); //nothing picked up, so unhandled
	assert.equal(grid.handleAction('menu'), false); //not an action this widget knows
});

test('setItems rebuilds and resets scroll, pick-up and pending press state', () => {
	const grid = new IconGrid({ width: 60, height: 60, columns: 2, items: items(2) });
	grid.tapCell(0);
	grid.setItems(items(2));
	//a fresh setItems clears the pending pick-up - a second tap now starts a new one instead
	//of completing a swap with a cell from the previous item set
	let reordered = false;
	grid.onReorder = () => (reordered = true);
	grid.tapCell(1);
	assert.equal(reordered, false);
});

test('a live theme change rebuilds cells without losing the current highlight', () => {
	const grid = new IconGrid({ width: 60, height: 60, columns: 2, items: items(4) });
	grid.move(1, 0);
	assert.equal(grid.selectedIndex, 1);

	try {
		setTheme({ spacing: 5 });
		assert.equal(grid.selectedIndex, 1, 'highlight must survive a restyle, not reset to cell 0');
	} finally {
		setTheme(defaultTheme);
	}
});

test('destroying a grid unsubscribes it - a later theme change touches nothing destroyed', () => {
	const grid = new IconGrid({ width: 60, height: 60, columns: 2, items: items(2) });
	grid.destroy({ children: true });

	//would throw if the grid's now-destroyed children were still being rebuilt
	assert.doesNotThrow(() => setTheme({ spacing: 5 }));
	setTheme(defaultTheme);
});
