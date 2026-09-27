import { test } from 'node:test';
import assert from 'node:assert/strict';

//pixi.js's canvas Text (which Label wraps) measures through `document.createElement('canvas')`
//unconditionally, with no headless fallback; a minimal stub is enough since these tests never
//assert on pixel layout, only on selection behaviour
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
	const context = {
		font: '',
		letterSpacing: '0px',
		textLetterSpacing: '0px',
		measureText: (text: string) => ({
			width: text.length * 6,
			actualBoundingBoxAscent: 8,
			actualBoundingBoxDescent: 2,
		}),
	};
	const canvas = { getContext: () => context, width: 0, height: 0, style: {} };
	(globalThis as { document?: unknown }).document = { createElement: () => canvas };
	(globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
}

import { RadioGroup } from '../src/two-d/ui/RadioGroup.ts';

/**
 * The radio group (item 391): exactly one choice among several, where a checkbox
 * would allow many. Arrows move the selection and select at once, a tap selects
 * directly, and `onChange` fires only when the choice actually moves. Drawing is
 * not asserted here, only the state machine, the way checkbox.test.ts does it.
 */

function options() {
	return [{ text: 'White' }, { text: 'Black', disabled: true }, { text: 'Random' }];
}

test('a group starts at the requested option, else the first enabled one', () => {
	assert.equal(new RadioGroup({ options: options() }).selected, 0);
	assert.equal(new RadioGroup({ options: options(), selected: 2 }).selected, 2);
	assert.equal(
		new RadioGroup({ options: options(), selected: 1 }).selected,
		0,
		'a disabled request falls back to the first enabled option',
	);
	assert.equal(new RadioGroup({ options: [{ text: 'No' }, { text: 'Way', disabled: true }] }).selected, 0);
	assert.equal(new RadioGroup({ options: [] }).selected, -1);
	assert.equal(
		new RadioGroup({ options: [{ text: 'Off', disabled: true }] }).selected,
		-1,
		'nothing enabled means nothing selected',
	);
});

test('select fires onChange only when the choice actually moves', () => {
	const group = new RadioGroup({ options: options() });
	const seen: number[] = [];
	group.onChange.add((index) => {
		seen.push(index);
	});

	group.select(2);
	assert.equal(group.selected, 2);
	assert.equal(group.selectedOption?.text, 'Random');

	group.select(2);
	assert.deepEqual(seen, [2], 're-selecting is silent');

	group.select(1);
	assert.equal(group.selected, 2, 'a disabled option refuses');
	assert.deepEqual(seen, [2]);

	group.select(99);
	assert.equal(group.selected, 2, 'out of range refuses');
	assert.deepEqual(seen, [2]);
});

test('move wraps and skips disabled options', () => {
	const group = new RadioGroup({ options: options() });

	group.move(1);
	assert.equal(group.selected, 2, 'index 1 is disabled, so it is skipped');

	group.move(1);
	assert.equal(group.selected, 0, 'wraps past the end');

	group.move(-1);
	assert.equal(group.selected, 2, 'wraps past the start');
});

test('move on an empty or all-disabled group reports false', () => {
	assert.equal(new RadioGroup({ options: [] }).move(1), false);

	const group = new RadioGroup({ options: [{ text: 'Off', disabled: true }] });
	assert.equal(group.move(1), false);
	assert.equal(group.selected, -1);
});

test('tapRow selects directly and ignores disabled rows', () => {
	const group = new RadioGroup({ options: options() });
	const seen: number[] = [];
	group.onChange.add((index) => {
		seen.push(index);
	});

	group.tapRow(2);
	assert.equal(group.selected, 2);

	group.tapRow(1);
	assert.equal(group.selected, 2, 'a disabled tap changes nothing');
	assert.deepEqual(seen, [2]);
});

test('handleAction moves on arrows and has no confirm step', () => {
	const group = new RadioGroup({ options: options() });

	assert.equal(group.handleAction('down'), true);
	assert.equal(group.selected, 2);

	assert.equal(group.handleAction('confirm'), false);
	assert.equal(group.selected, 2, 'confirm neither moves nor fires');

	assert.equal(group.handleAction('cancel'), false);
});

test('setOptions rebuilds and reselects from the new list', () => {
	const group = new RadioGroup({ options: options() });
	group.select(2);

	group.setOptions([{ text: 'Yes' }, { text: 'No' }]);
	assert.equal(group.length, 2);
	assert.equal(group.selected, 0, 'a new list starts at its first enabled option');

	group.setOptions([{ text: 'A', disabled: true }, { text: 'B' }], 0);
	assert.equal(group.selected, 1, 'a disabled request falls back again');
});
