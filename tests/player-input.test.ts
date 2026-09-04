import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as Input from '../src/core/Input.ts';
import { PlayerInput } from '../src/core/PlayerInput.ts';

function fakePad(index: number, buttons: number[] = [], axes: number[] = []): Gamepad {
	return {
		index,
		buttons: buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0.5, value: v })),
		axes,
	} as unknown as Gamepad;
}

test('bind/isDown work through a PlayerInput exactly like the underlying Input action', () => {
	const p1 = new PlayerInput('p1-basic', { padIndex: 5 });
	p1.bindButton('confirm', [0]);

	Input.pollGamepads([fakePad(5, [1])]);
	assert.equal(p1.isDown('confirm'), true);
	assert.equal(p1.justPressed('confirm'), true);

	Input.pollGamepads([fakePad(5, [0])]);
	Input.endFrame();
	assert.equal(p1.isDown('confirm'), false);
});

test('two players bound to the same action name on different pads never collide', () => {
	const p1 = new PlayerInput('p1-collide', { padIndex: 10 });
	const p2 = new PlayerInput('p2-collide', { padIndex: 11 });
	p1.bindButton('confirm', [0]);
	p2.bindButton('confirm', [0]);

	//only player 1's pad is pressed
	Input.pollGamepads([fakePad(10, [1]), fakePad(11, [0])]);
	assert.equal(p1.isDown('confirm'), true);
	assert.equal(p2.isDown('confirm'), false, "player 2's own action must not fire from player 1's pad");

	Input.endFrame();

	//now only player 2's pad is pressed
	Input.pollGamepads([fakePad(10, [0]), fakePad(11, [1])]);
	assert.equal(p1.isDown('confirm'), false);
	assert.equal(p2.isDown('confirm'), true);
});

test('this is the collision PlayerInput exists to avoid: binding the bare action name directly to two pads folds into one shared action', () => {
	Input.bindButton('shared-confirm', 20, [0]);
	Input.bindButton('shared-confirm', 21, [0]);

	Input.pollGamepads([fakePad(20, [1]), fakePad(21, [0])]);
	//either pad fires the SAME action - there is no way to tell which one did
	assert.equal(Input.isDown('shared-confirm'), true);
	Input.unbind('shared-confirm');
});

test('bind() scopes a keyboard binding the same way bindButton scopes a gamepad one', () => {
	const p1 = new PlayerInput('p1-keys');
	p1.bind('jump', ['Space']);
	assert.deepEqual(p1.keysFor('jump'), ['Space']);
	assert.deepEqual(Input.keysFor('jump'), [], "the bare, unscoped action must be untouched");
});

test('bindButton/bindAxis without a padIndex throw rather than binding nothing silently', () => {
	const p1 = new PlayerInput('p1-no-pad');
	assert.throws(() => p1.bindButton('confirm', [0]), /no padIndex/);
	assert.throws(() => p1.bindAxis('confirm', 0, 1), /no padIndex/);
});

test('a player needs a non-empty id', () => {
	assert.throws(() => new PlayerInput(''), /non-empty id/);
});

test('justReleased reports through the scoped action too', () => {
	const p1 = new PlayerInput('p1-release', { padIndex: 30 });
	p1.bindButton('confirm', [0]);

	Input.pollGamepads([fakePad(30, [1])]);
	Input.endFrame();
	Input.pollGamepads([fakePad(30, [0])]);
	assert.equal(p1.justReleased('confirm'), true);
});
