import assert from 'node:assert/strict';
import test from 'node:test';

import { SelectionModel } from '../src/two-d/ui/SelectionModel.ts';

/**
 * The selection contract `ListView` and `IconGrid` share, tested directly instead of only
 * through the widgets that embed it: the guards (bounds, disabled, nothing selectable) and
 * the notification order (redraw, then the game's highlight hook) are the parts the widgets
 * rely on but never exercise on purpose.
 */

interface Item {
	text: string;
	disabled?: boolean;
}

function rig(items: Item[]) {
	const events: string[] = [];
	const model = new SelectionModel<Item>({
		onChange: () => events.push('change'),
		onHighlight: (item, index) => events.push(`highlight:${item.text}@${index}`),
	});
	model.reset(items);
	return { model, events };
}

test('reset points at the first enabled entry without notifying', () => {
	const { model, events } = rig([{ text: 'a', disabled: true }, { text: 'b' }]);

	assert.equal(model.selectedIndex, 1);
	assert.equal(model.selected?.text, 'b');
	assert.deepEqual(events, []);
});

test('reset on an all-disabled list falls back to index 0', () => {
	const { model } = rig([{ text: 'a', disabled: true }]);

	assert.equal(model.selectedIndex, 0);
	assert.equal(model.selected?.text, 'a');
});

test('reset on an empty list points at index 0 with no selection', () => {
	const { model } = rig([]);

	assert.equal(model.length, 0);
	assert.equal(model.selectedIndex, 0);
	assert.equal(model.selected, null);
});

test('select lands on the named index and redraws before the highlight hook', () => {
	const { model, events } = rig([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);

	model.select(2);

	assert.equal(model.selectedIndex, 2);
	assert.deepEqual(events, ['change', 'highlight:c@2']);
});

test('select refuses out-of-range and disabled entries without notifying', () => {
	const { model, events } = rig([{ text: 'a' }, { text: 'b', disabled: true }]);

	model.select(-1);
	model.select(2);
	model.select(1);

	assert.equal(model.selectedIndex, 0);
	assert.deepEqual(events, []);
});

test('confirm hands the highlighted item to the callback and reports success', () => {
	const { model } = rig([{ text: 'a' }, { text: 'b' }]);
	model.select(1);

	let got: { text: string; index: number } | null = null;
	assert.equal(
		model.confirm((item, index) => (got = { text: item.text, index })),
		true,
	);
	assert.deepEqual(got, { text: 'b', index: 1 });
});

test('confirm reports failure when nothing is selectable', () => {
	const allDisabled = rig([{ text: 'a', disabled: true }]);
	let called = 0;
	assert.equal(
		allDisabled.model.confirm(() => called++),
		false,
	);
	assert.equal(called, 0);

	const empty = rig([]);
	assert.equal(empty.model.confirm(null), false);
});

test('confirm with no callback still answers whether anything is selectable', () => {
	const { model } = rig([{ text: 'a' }]);

	assert.equal(model.confirm(null), true);
});

test('step skips disabled entries, wraps, and notifies per landing', () => {
	const { model, events } = rig([{ text: 'a' }, { text: 'b', disabled: true }, { text: 'c' }]);
	const wrap = (from: number) => (from + 1) % 3;

	assert.equal(model.step(wrap, 4), true);
	assert.equal(model.selectedIndex, 2);
	assert.equal(model.step(wrap, 4), true);
	assert.equal(model.selectedIndex, 0);
	assert.equal(model.step(wrap, 4), true);
	assert.equal(model.selectedIndex, 2);

	assert.deepEqual(events, ['change', 'highlight:c@2', 'change', 'highlight:a@0', 'change', 'highlight:c@2']);
});

test('step threads through a blocked neighbour instead of retrying it', () => {
	const { model } = rig([{ text: 'a' }, { text: 'b', disabled: true }, { text: 'c' }]);
	const down = (from: number) => from + 1;

	assert.equal(model.step(down, 3), true);
	assert.equal(model.selectedIndex, 2);
});

test('step walks past out-of-range candidates at both ends', () => {
	const forward = rig([{ text: 'a' }, { text: 'b' }]);
	forward.model.select(1);
	assert.equal(
		forward.model.step((from) => from + 1, 3),
		false,
	);
	assert.equal(forward.model.selectedIndex, 1);
	assert.deepEqual(forward.events, ['change', 'highlight:b@1']);

	const backward = rig([{ text: 'a' }, { text: 'b' }]);
	assert.equal(
		backward.model.step((from) => from - 1, 3),
		false,
	);
	assert.equal(backward.model.selectedIndex, 0);
	assert.deepEqual(backward.events, []);
});

test('step terminates on an all-disabled list without landing', () => {
	const { model, events } = rig([
		{ text: 'a', disabled: true },
		{ text: 'b', disabled: true },
	]);

	assert.equal(
		model.step((from) => (from + 1) % 2, 8),
		false,
	);
	assert.equal(model.selectedIndex, 0);
	assert.deepEqual(events, []);
});

test('step on an empty list reports failure', () => {
	const { model } = rig([]);

	assert.equal(
		model.step((from) => from + 1, 3),
		false,
	);
});

test('swap exchanges two entries in place without moving the highlight', () => {
	const { model } = rig([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
	model.select(0);

	model.swap(0, 2);

	assert.equal(model.selectedIndex, 0);
	assert.equal(model.selected?.text, 'c');
	assert.deepEqual(
		model.items.map((item) => item.text),
		['c', 'b', 'a'],
	);
});
