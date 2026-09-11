import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newlyRevealed, minimapCellCenter } from '../src/two-d/render/Minimap.ts';
import { hexToPixel } from '../src/core/Hex.ts';

test('reports every explored cell not already drawn', () => {
	const explored = new Set([1, 2, 3, 5]);
	const drawn = new Set([2, 5]);
	assert.deepEqual(newlyRevealed(explored, drawn), [1, 3]);
});

test('reports nothing once every explored cell has been drawn', () => {
	const explored = new Set([1, 2]);
	const drawn = new Set([1, 2]);
	assert.deepEqual(newlyRevealed(explored, drawn), []);
});

test('an empty explored set reports nothing regardless of what is drawn', () => {
	assert.deepEqual(newlyRevealed(new Set(), new Set([1, 2])), []);
});

test('hex minimap cell centres use the shared odd-q projection', () => {
	assert.deepEqual(minimapCellCenter(3, 2, 8, 'hex'), hexToPixel(3, 2, 8, 8));
	assert.notDeepEqual(minimapCellCenter(3, 2, 8, 'hex'), minimapCellCenter(3, 2, 8, 'square'));
});
