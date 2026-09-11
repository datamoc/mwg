import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Checkbox } from '../src/two-d/ui/Checkbox.ts';

/**
 * The checkbox (item 261): a two-state toggle whose only real rule is that `onChange` fires when
 * the state moves and not when it is set to what it already was. It draws a box and a tick, which
 * a headless test cannot see, so the state machine is what is pinned here.
 */

test('a checkbox starts at the state it was given', () => {
	assert.equal(new Checkbox().checked, false);
	assert.equal(new Checkbox({ checked: true }).checked, true);
});

test('toggle flips the state and fires onChange', () => {
	const box = new Checkbox();
	const seen: boolean[] = [];
	box.onChange.add((checked) => {
		seen.push(checked);
	});

	box.toggle();
	assert.equal(box.checked, true);
	box.toggle();
	assert.equal(box.checked, false);
	assert.deepEqual(seen, [true, false]);
});

test('setChecked fires only when the value actually moves', () => {
	const box = new Checkbox({ checked: true });
	const seen: boolean[] = [];
	box.onChange.add((checked) => {
		seen.push(checked);
	});

	box.setChecked(true); // already there
	assert.deepEqual(seen, []);
	box.setChecked(false);
	assert.deepEqual(seen, [false]);
});

test('a disabled checkbox reports its state but refuses the pointer', () => {
	const box = new Checkbox({ disabled: true, checked: false });
	assert.equal(box.disabled, true);

	box.emit('pointertap', {} as never);
	assert.equal(box.checked, false, 'a disabled box leaves state alone');

	box.setDisabled(false);
	box.emit('pointertap', {} as never);
	assert.equal(box.checked, true, 'enabled again, a tap toggles');
});
