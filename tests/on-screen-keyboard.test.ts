import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchAction, onAction, onText } from '../src/core/Input.ts';
import { UPPERCASE_KEYBOARD, layoutKeys, pressKey, type KeyboardLayout } from '../src/two-d/ui/OnScreenKeyboard.ts';

/**
 * P37's touch half (roadmap 402): rows of keys as data, each tap feeding the same
 * `core.Input` path a physical key travels. The dispatch semantics (`pressKey`) and the
 * rows-to-buttons arithmetic (`layoutKeys`) are pure and tested here; the Button shell
 * that draws them cannot be constructed under `node --test` (a captioned Button measures
 * its text, which needs a canvas), so its rendering is verified in the interface example
 * and the browser smoke, per this repo's own rule for anything that draws.
 */

test('dispatchAction fires onAction without holding anything', () => {
	const seen: string[] = [];
	const listener = (action: string): void => {
		seen.push(action);
	};
	onAction.add(listener);
	try {
		dispatchAction('confirm');
		assert.deepEqual(seen, ['confirm']);
	} finally {
		onAction.remove(listener);
	}
});

test('a typing key taps through onText; an action key fires onAction and types nothing', () => {
	const typed: string[] = [];
	const actions: string[] = [];
	const textListener = (text: string): boolean => {
		typed.push(text);
		return true;
	};
	const actionListener = (action: string): void => {
		actions.push(action);
	};
	onText.add(textListener);
	onAction.add(actionListener);
	try {
		pressKey({ label: 'A' });
		pressKey({ label: 'a-acute', text: 'á' });
		pressKey({ label: 'OK', action: 'confirm' });
		assert.deepEqual(typed, ['A', 'á'], 'label types itself, text overrides the label');
		assert.deepEqual(actions, ['confirm'], 'an action key fires the action');
	} finally {
		onText.remove(textListener);
		onAction.remove(actionListener);
	}
});

test('UPPERCASE_KEYBOARD is plain data with the editing tail a text field needs', () => {
	assert.ok(UPPERCASE_KEYBOARD.rows.length >= 2);
	for (const row of UPPERCASE_KEYBOARD.rows) {
		assert.ok(row.length > 0);
		for (const key of row) assert.ok(key.label.length > 0, 'every key has a caption');
	}
	const tail = UPPERCASE_KEYBOARD.rows[UPPERCASE_KEYBOARD.rows.length - 1];
	const actions = tail.map((key) => key.action);
	for (const action of ['backspace', 'left', 'right', 'confirm', 'cancel']) {
		assert.ok(actions.includes(action), `${action} key present`);
	}
	const space = tail.find((key) => key.label === 'Space');
	assert.equal(space?.text, ' ');
	assert.ok((space?.span ?? 1) > 1, 'the space bar spans several units');
});

test('layoutKeys divides a row across its span units and stacks ragged rows', () => {
	const layout: KeyboardLayout = {
		rows: [[{ label: 'A' }, { label: 'wide', span: 3 }], [{ label: 'B' }]],
	};
	const laid = layoutKeys(layout, { width: 300, keyHeight: 20, gap: 2 });
	assert.equal(laid.length, 3, 'three keys total');
	const [a, wide, b] = laid;
	assert.ok(a && wide && b);
	assert.equal(a.x, 0);
	assert.ok(wide.width > a.width, 'the wide key is wider than the single-unit key');
	assert.equal(wide.x, a.x + a.width + 2, 'the next key starts one gap over');
	//300 width, gap 2, 4 unit slots: unit = (300 - 3*2) / 4 = 73.5; the span-3 key covers
	//3 slots plus its 2 internal gaps: 73.5*3 + 2*2 = 224.5
	assert.ok(Math.abs(a.width - 73.5) < 1e-9);
	assert.ok(Math.abs(wide.width - 224.5) < 1e-9);
	assert.equal(b.y, 22, 'the second row sits one key-plus-gap below the first');
	assert.equal(b.height, 20);
	//the whole row consumes the width exactly
	const rowWidth = a.width + 2 + wide.width;
	assert.ok(Math.abs(rowWidth - 300) < 1e-9);
});

test('layoutKeys leaves no gaps when a row is one wide key', () => {
	const laid = layoutKeys({ rows: [[{ label: 'space', span: 5 }]] }, { width: 100, keyHeight: 10, gap: 3 });
	assert.equal(laid.length, 1);
	assert.ok(Math.abs(laid[0]!.width - 100) < 1e-9, 'a lone key takes the whole row');
	assert.equal(laid[0]!.x, 0);
});
