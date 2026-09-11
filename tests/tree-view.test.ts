import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TreeView } from '../src/two-d/ui/TreeView.ts';

/**
 * The tree view (item 261): visible rows are derived from the roots and the expanded set, and two
 * consequences are pinned - a collapsed branch's children are unreachable by `move`, and closing a
 * branch the highlight was inside lands it on the branch rather than leaving it dangling.
 */

const roots = [
	{
		id: 'units',
		label: 'Units',
		children: [
			{ id: 'infantry', label: 'Infantry' },
			{ id: 'archers', label: 'Archers' },
		],
	},
	{ id: 'settings', label: 'Settings' },
];

test('a fresh tree shows the roots and hides their children', () => {
	const tree = new TreeView({ roots });
	assert.deepEqual(
		tree.rows.map((row) => row.node.id),
		['units', 'settings'],
	);
	assert.equal(tree.rows[0].depth, 0);
	assert.equal(tree.rows[0].hasChildren, true);
	assert.equal(tree.rows[0].expanded, false);
});

test('expanding a branch shows its children at a deeper depth', () => {
	const tree = new TreeView({ roots });
	tree.expand('units');
	assert.deepEqual(
		tree.rows.map((row) => row.node.id),
		['units', 'infantry', 'archers', 'settings'],
	);
	assert.equal(tree.rows[1].depth, 1);
	assert.equal(tree.isExpanded('units'), true);
});

test('the expanded option opens branches from the start', () => {
	const tree = new TreeView({ roots, expanded: ['units'] });
	assert.deepEqual(
		tree.rows.map((row) => row.node.id),
		['units', 'infantry', 'archers', 'settings'],
	);
});

test('move only walks the rows currently on screen', () => {
	const tree = new TreeView({ roots });
	tree.move(1);
	assert.equal(tree.selected?.id, 'settings', 'the hidden children are not between the roots');

	tree.expand('units');
	tree.select(0);
	tree.move(1);
	assert.equal(tree.selected?.id, 'infantry');
});

test('collapsing the branch the highlight is inside lands it on the branch', () => {
	const tree = new TreeView({ roots, expanded: ['units'] });
	tree.select(2);
	assert.equal(tree.selected?.id, 'archers');

	tree.collapse('units');
	assert.equal(tree.selected?.id, 'units', 'the selected child is gone, so the highlight is the branch');
});

test('toggle opens and closes a branch', () => {
	const tree = new TreeView({ roots });
	tree.toggle('units');
	assert.equal(tree.isExpanded('units'), true);
	tree.toggle('units');
	assert.equal(tree.isExpanded('units'), false);
});

test('expandAll opens every branch and collapseAll closes them and returns to the top', () => {
	const tree = new TreeView({ roots });
	tree.expandAll();
	assert.equal(tree.rows.length, 4);
	tree.select(3);

	tree.collapseAll();
	assert.deepEqual(
		tree.rows.map((row) => row.node.id),
		['units', 'settings'],
	);
	assert.equal(tree.selectedIndex, 0);
});

test('move skips a disabled row', () => {
	const tree = new TreeView({ roots, disabled: (node) => node.id === 'settings' });
	tree.move(1);
	assert.equal(tree.selectedIndex, 0, 'settings is disabled, so the highlight stays put');
});
