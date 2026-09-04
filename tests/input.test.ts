import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	bind,
	unbind,
	keysFor,
	resetBindings,
	exportBindings,
	importBindings,
	DEFAULT_BINDINGS,
	actionsForKey,
	bindButton,
	bindAxis,
	gamepadButtonCode,
	gamepadAxisCode,
	pollGamepads,
	isDown,
	justPressed,
	justReleased,
	endFrame,
	rumble,
} from '../src/core/Input.ts';

function fakePad(index: number, buttons: number[] = [], axes: number[] = []): Gamepad {
	return {
		index,
		buttons: buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0.5, value: v })),
		axes,
	} as unknown as Gamepad;
}

/**
 * Key bindings, tested without a browser.
 *
 * The event plumbing needs a DOM and is not tested here. The binding table does not, and
 * it is where the interesting mistake lived: defaults that quietly vanished as soon as a
 * game defined a key of its own.
 */

test('the defaults are in place without anything having to ask for them', () => {
	//the regression this exists for: defaults used to be installed by attach(), and only
	//when the table was empty, so a game that bound one action before starting lost the lot
	assert.ok(keysFor('up').length > 0);
	assert.ok(keysFor('confirm').includes('Enter'));
});

test('binding a new action leaves the defaults alone', () => {
	resetBindings();
	bind('descend', ['Period']);

	assert.deepEqual(keysFor('descend'), ['Period']);
	assert.ok(keysFor('left').includes('ArrowLeft'), 'a default was lost');
	assert.ok(keysFor('confirm').includes('Enter'), 'a default was lost');
});

test('rebinding an action replaces only that action', () => {
	resetBindings();
	bind('up', ['KeyK']);

	assert.deepEqual(keysFor('up'), ['KeyK']);
	assert.ok(!keysFor('up').includes('ArrowUp'), 'the old key should be gone');
	assert.ok(keysFor('down').includes('ArrowDown'), 'a neighbouring action was disturbed');
});

test('unbinding removes just that action', () => {
	resetBindings();
	unbind('menu');

	assert.deepEqual(keysFor('menu'), []);
	assert.ok(keysFor('confirm').length > 0);
});

test('bindings survive a round trip through a settings file', () => {
	resetBindings();
	bind('descend', ['Period', 'NumpadDecimal']);
	bind('up', ['KeyK']);

	const saved = JSON.parse(JSON.stringify(exportBindings()));

	resetBindings();
	assert.ok(keysFor('descend').length === 0, 'reset should have cleared the custom action');

	importBindings(saved);
	assert.deepEqual(keysFor('descend'), ['Period', 'NumpadDecimal']);
	assert.deepEqual(keysFor('up'), ['KeyK']);
});

test('resetting restores exactly the defaults', () => {
	bind('up', ['KeyK']);
	bind('nonsense', ['KeyQ']);
	resetBindings();

	assert.deepEqual(keysFor('nonsense'), []);
	for (const [action, keys] of Object.entries(DEFAULT_BINDINGS)) {
		assert.deepEqual(keysFor(action), [...keys], `default for "${action}" was not restored`);
	}
});

test('one key may drive several actions', () => {
	resetBindings();
	//numpad 5 is both "wait" and, in some games, "confirm"; nothing should forbid that
	bind('wait', ['Numpad5']);
	bind('confirm', ['Numpad5', 'Enter']);

	assert.ok(keysFor('wait').includes('Numpad5'));
	assert.ok(keysFor('confirm').includes('Numpad5'));
});

test('actionsForKey reports every action currently bound to a key', () => {
	resetBindings();
	assert.deepEqual(actionsForKey('ArrowUp'), ['up']);
	assert.deepEqual(actionsForKey('KeyQ'), []);

	bind('wait', ['Numpad5']);
	bind('confirm', ['Numpad5', 'Enter']);
	assert.deepEqual(new Set(actionsForKey('Numpad5')), new Set(['wait', 'confirm']));
});

test('bindButton adds a gamepad button to an action without disturbing its keyboard keys', () => {
	resetBindings();
	bindButton('confirm', 0, [0]);

	assert.ok(keysFor('confirm').includes('Enter'), 'the existing keyboard binding must survive');
	assert.ok(keysFor('confirm').includes(gamepadButtonCode(0, 0)));
});

test('pollGamepads treats a held button as isDown, firing justPressed once and justReleased on release', () => {
	resetBindings();
	bindButton('jump', 0, [0]);

	pollGamepads([fakePad(0, [1])]);
	assert.equal(isDown('jump'), true);
	assert.equal(justPressed('jump'), true);

	endFrame();
	pollGamepads([fakePad(0, [1])]); // still held
	assert.equal(isDown('jump'), true);
	assert.equal(justPressed('jump'), false, 'should not re-fire while still held');

	endFrame();
	pollGamepads([fakePad(0)]); // released
	assert.equal(isDown('jump'), false);
	assert.equal(justReleased('jump'), true);
});

test('bindAxis maps a stick direction past its deadzone to a digital action', () => {
	resetBindings();
	bindAxis('right', 0, 0, 1);
	bindAxis('left', 0, 0, -1);

	pollGamepads([fakePad(0, [], [0.9])]);
	assert.equal(isDown('right'), true);
	assert.equal(isDown('left'), false);

	endFrame();
	pollGamepads([fakePad(0, [], [-0.9])]);
	assert.equal(isDown('left'), true);
	assert.equal(isDown('right'), false);

	endFrame();
	pollGamepads([fakePad(0, [], [0.1])]); // inside the deadzone
	assert.equal(isDown('left'), false);
	assert.equal(isDown('right'), false);
});

test('gamepadButtonCode/gamepadAxisCode never collide with a real KeyboardEvent.code', () => {
	assert.ok(gamepadButtonCode(0, 0).startsWith('Gamepad'));
	assert.ok(gamepadAxisCode(0, 0, 1).startsWith('Gamepad'));
});

test('rumble plays a dual-rumble effect on a pad with a vibration actuator', () => {
	let seen: [string, Record<string, number>] | null = null;
	const pad = {
		...fakePad(0),
		vibrationActuator: { playEffect: (type: string, params: Record<string, number>) => (seen = [type, params]) },
	} as unknown as Gamepad;

	rumble(0, { duration: 200, weakMagnitude: 0.5, strongMagnitude: 1 }, [pad]);

	assert.ok(seen);
	assert.equal(seen![0], 'dual-rumble');
	assert.deepEqual(seen![1], { duration: 200, weakMagnitude: 0.5, strongMagnitude: 1 });
});

test('rumble defaults both magnitudes to 1', () => {
	let seen: Record<string, number> | null = null;
	const pad = {
		...fakePad(0),
		vibrationActuator: { playEffect: (_type: string, params: Record<string, number>) => (seen = params) },
	} as unknown as Gamepad;

	rumble(0, { duration: 50 }, [pad]);
	assert.deepEqual(seen, { duration: 50, weakMagnitude: 1, strongMagnitude: 1 });
});

test('rumble is a no-op, not a throw, on a pad with no vibration actuator', () => {
	assert.doesNotThrow(() => rumble(0, { duration: 100 }, [fakePad(0)]));
});

test('rumble is a no-op on an out-of-range pad index', () => {
	assert.doesNotThrow(() => rumble(5, { duration: 100 }, [fakePad(0)]));
});
