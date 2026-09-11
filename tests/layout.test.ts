import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Grid, anchorAlign, resolveAnchor } from '../src/two-d/ui/Layout.ts';

/**
 * Data-driven layout (item 263): named anchors and size-or-grow grids, the shell half of what GUI2
 * keeps in `data/gui/*.cfg`. It is pure geometry, so every rule - the alignment a name implies, the
 * margin, the fill, and how grow tracks split what is left - is pinned as arithmetic.
 */

const bounds = { x: 0, y: 0, width: 800, height: 600 };

test('a named anchor implies a horizontal and vertical alignment', () => {
	assert.deepEqual(anchorAlign('top-left'), { x: 0, y: 0 });
	assert.deepEqual(anchorAlign('center'), { x: 0.5, y: 0.5 });
	assert.deepEqual(anchorAlign('bottom-right'), { x: 1, y: 1 });
	assert.deepEqual(anchorAlign('top'), { x: 0.5, y: 0 });
	assert.deepEqual(anchorAlign('left'), { x: 0, y: 0.5 });
});

test('an omitted anchor centres the child', () => {
	const rect = resolveAnchor({ width: 100, height: 40 }, bounds);
	assert.deepEqual(rect, { x: 350, y: 280, width: 100, height: 40 });
});

test('a bottom-right anchor with a margin and an offset sits where it says', () => {
	const rect = resolveAnchor({ anchor: 'bottom-right', width: 100, height: 30, margin: 10 }, bounds);
	assert.deepEqual(rect, { x: 690, y: 560, width: 100, height: 30 });

	const nudge = resolveAnchor({ anchor: 'bottom-right', width: 100, height: 30, offsetX: -8, offsetY: -4 }, bounds);
	assert.deepEqual(nudge, { x: 692, y: 566, width: 100, height: 30 });
});

test('a fill anchor takes the usable bounds whole', () => {
	const rect = resolveAnchor({ anchor: 'fill', margin: 10 }, bounds);
	assert.deepEqual(rect, { x: 10, y: 10, width: 780, height: 580 });

	const inset = resolveAnchor({ anchor: 'fill', offsetX: 20, offsetY: 20 }, bounds);
	assert.deepEqual(inset, { x: 20, y: 20, width: 780, height: 580 });
});

test('explicit alignment overrides the named anchor', () => {
	const rect = resolveAnchor({ anchor: 'top-left', alignX: 1, alignY: 1, width: 10, height: 10 }, bounds);
	assert.deepEqual(rect, { x: 790, y: 590, width: 10, height: 10 });
});

test('a grid with equal grow columns fills the width and gives the last one the rounding', () => {
	const grid = new Grid({ columns: [{ grow: 1 }, { grow: 1 }, { grow: 1 }], rows: [{ grow: 1 }] });
	const sizes = grid.columnSizes(800);
	assert.equal(
		sizes.reduce((sum, size) => sum + size, 0),
		800,
	);
	assert.deepEqual(sizes, [266, 266, 268]);
});

test('a fixed column takes its size and the grow column takes the rest, gap included', () => {
	const grid = new Grid({ columns: [{ size: 200 }, { grow: 1 }], rows: [{ grow: 1 }], gap: 8 });
	assert.deepEqual(grid.columnSizes(800), [200, 592]);

	const cell = grid.rect(0, 1, bounds);
	assert.deepEqual(cell, { x: 208, y: 0, width: 592, height: 600 });
});

test('a span covers the tracks it crosses plus the gaps between them', () => {
	const grid = new Grid({
		columns: [{ size: 100 }, { size: 100 }, { size: 100 }],
		rows: [{ size: 50 }, { size: 70 }],
		gap: 10,
	});
	assert.deepEqual(grid.rect(0, 0, bounds, { columnSpan: 2 }), { x: 0, y: 0, width: 210, height: 50 });
	assert.deepEqual(grid.rect(0, 1, bounds, { rowSpan: 2 }), { x: 110, y: 0, width: 100, height: 130 });
});

test('a cell out of range is a zero-sized rect, not a throw', () => {
	const grid = new Grid({ columns: [{ grow: 1 }], rows: [{ grow: 1 }] });
	const cell = grid.rect(4, 4, bounds);
	assert.equal(cell.width, 0);
	assert.equal(cell.height, 0);
});
