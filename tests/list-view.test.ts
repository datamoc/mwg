import assert from 'node:assert/strict';
import test from 'node:test';

//pixi.js's canvas Text (which Label wraps) measures through `document.createElement('canvas')`
//unconditionally, with no headless fallback; a minimal stub is enough since these tests never
//assert on pixel layout, only on selection/confirm behaviour
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
	const context = {
		font: '',
		letterSpacing: '0px',
		textLetterSpacing: '0px',
		measureText: (text: string) => ({ width: text.length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
	};
	const canvas = { getContext: () => context, width: 0, height: 0, style: {} };
	(globalThis as { document?: unknown }).document = { createElement: () => canvas };
	(globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
}

import { ListView } from '../src/two-d/ui/ListView.ts';

function items() {
	return [{ text: 'Attack' }, { text: 'Item' }, { text: 'Flee', disabled: true }, { text: 'Run' }];
}

test('tapRow selects and confirms in one step', () => {
	const chosen: number[] = [];
	const list = new ListView({ width: 160, height: 96, items: items(), onSelect: (_item, index) => chosen.push(index) });

	list.tapRow(1);

	assert.equal(list.selectedIndex, 1);
	assert.deepEqual(chosen, [1]);
});

test('tapRow on a disabled row is a no-op', () => {
	const chosen: number[] = [];
	const list = new ListView({ width: 160, height: 96, items: items(), onSelect: (_item, index) => chosen.push(index) });

	list.tapRow(2);

	assert.equal(list.selectedIndex, 0);
	assert.deepEqual(chosen, []);
});

test('tapRow out of range is a no-op', () => {
	const list = new ListView({ width: 160, height: 96, items: items() });

	assert.doesNotThrow(() => list.tapRow(99));
	assert.equal(list.selectedIndex, 0);
});

test('move skips disabled rows and wraps', () => {
	const list = new ListView({ width: 160, height: 96, items: items() });

	list.move(1);
	assert.equal(list.selectedIndex, 1);
	list.move(1); // Flee (index 2) is disabled, skip to Run
	assert.equal(list.selectedIndex, 3);
	list.move(1); // wraps back to Attack
	assert.equal(list.selectedIndex, 0);
});
