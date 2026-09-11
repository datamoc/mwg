import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Dropdown } from '../src/two-d/ui/Dropdown.ts';

/**
 * The dropdown / option button (item 261): a closed button with an open list. The rules pinned
 * here are the ones a caller would notice - the highlight starts on the selection when opened,
 * disabled options are skipped, and confirming fires only when the choice actually changed.
 */

const options = [
	{ id: 'easy', label: 'Easy' },
	{ id: 'hard', label: 'Hard', disabled: true },
	{ id: 'insane', label: 'Insane' },
];

test('a dropdown starts on the first enabled option unless another is named', () => {
	assert.equal(new Dropdown({ options }).selected?.id, 'easy');
	assert.equal(new Dropdown({ options, selectedIndex: 2 }).selected?.id, 'insane');
});

test('naming a disabled option falls back to the first enabled one', () => {
	assert.equal(new Dropdown({ options, selectedIndex: 1 }).selected?.id, 'easy');
});

test('an empty dropdown selects nothing rather than throwing', () => {
	const dropdown = new Dropdown({ options: [] });
	assert.equal(dropdown.selected, null);
	dropdown.open();
	dropdown.move(1);
	assert.equal(dropdown.confirm(), false);
});

test('opening shows the list and puts the highlight on the current selection', () => {
	const dropdown = new Dropdown({ options, selectedIndex: 2 });
	assert.equal(dropdown.isOpen, false);

	dropdown.open();
	assert.equal(dropdown.isOpen, true);
	assert.equal(dropdown.highlight, 2, 'the selection, not row 0');
});

test('move skips disabled rows and wraps at both ends', () => {
	const dropdown = new Dropdown({ options });
	dropdown.open();

	dropdown.move(1); //easy -> hard is disabled, so insane
	assert.equal(dropdown.highlight, 2);
	dropdown.move(1); //wraps to easy
	assert.equal(dropdown.highlight, 0);
	dropdown.move(-1); //wraps back to insane
	assert.equal(dropdown.highlight, 2);
});

test('confirm takes the highlighted row, closes, and fires only when it changed', () => {
	const dropdown = new Dropdown({ options });
	const seen: string[] = [];
	dropdown.onChange.add(({ option }) => {
		seen.push(option.id ?? option.label);
	});

	dropdown.open();
	dropdown.move(1); // insane
	assert.equal(dropdown.confirm(), true);
	assert.equal(dropdown.isOpen, false);
	assert.equal(dropdown.selected?.id, 'insane');
	assert.deepEqual(seen, ['insane']);

	dropdown.open();
	dropdown.confirm(); //same row again
	assert.deepEqual(seen, ['insane'], 'confirming the current choice is not a change');
});

test('cancel closes without taking anything and restores the highlight', () => {
	const dropdown = new Dropdown({ options });
	dropdown.open();
	dropdown.move(1);
	dropdown.cancel();

	assert.equal(dropdown.isOpen, false);
	assert.equal(dropdown.selected?.id, 'easy');
	assert.equal(dropdown.highlight, 0);
});

test('confirm outside an open list does nothing', () => {
	const dropdown = new Dropdown({ options });
	assert.equal(dropdown.confirm(), false);
});

test('disabling a dropdown closes it, and it will not open again', () => {
	const dropdown = new Dropdown({ options });
	dropdown.open();
	dropdown.setDisabled(true);
	assert.equal(dropdown.isOpen, false);

	dropdown.open();
	assert.equal(dropdown.isOpen, false);
});
