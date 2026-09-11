import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Window } from '../src/two-d/ui/Window.ts';
import { WindowStack } from '../src/two-d/ui/WindowStack.ts';

/**
 * `Window.close()` frees the window and its contents through Pixi, so the instance a game
 * kept in a field is spent afterwards. That is fine when it is predictable: `closed` is the
 * guard, `close()` is idempotent, input and layout on a closed window are no-ops, and pushing
 * one again is a named error rather than a null-internal throw somewhere else.
 */

test('a window starts open and reports closed after close', () => {
	//no title: a Label measures text through a canvas, which node --test has no document for
	const window = new Window({ width: 100, height: 60 });
	assert.equal(window.closed, false);
	assert.equal(window.destroyed, false);

	window.close();

	assert.equal(window.closed, true);
	assert.equal(window.destroyed, true, 'and Pixi agrees it is destroyed');
});

test('close is idempotent, so a pop racing a cancel is not a second destroy', () => {
	const window = new Window({ width: 100, height: 60 });
	window.close();
	assert.doesNotThrow(() => window.close());
	assert.equal(window.closed, true);
});

test('a closed window ignores input and layout instead of throwing', () => {
	const window = new Window({ width: 100, height: 60 });
	window.close();

	assert.equal(window.handleAction('cancel'), false);
	assert.doesNotThrow(() => window.place(800, 600));
	assert.doesNotThrow(() => window.update(16));
});

test('destroy without close also marks the window spent', () => {
	const window = new Window({ width: 100, height: 60 });
	window.destroy({ children: true });
	assert.equal(window.closed, true);
});

test('a cancel action closes a closable window and reports that it handled it', () => {
	const window = new Window({ width: 100, height: 60 });
	let announced = 0;
	window.onClose.add(() => {
		announced++;
		return false;
	});

	assert.equal(window.handleAction('cancel'), true);
	assert.equal(announced, 1);
	assert.equal(window.closed, true);
});

test('a non-closable window ignores cancel', () => {
	const window = new Window({ width: 100, height: 60, closable: false });
	assert.equal(window.handleAction('cancel'), false);
	assert.equal(window.closed, false);
});

test('the stack forgets a closed window and does not offer it input', () => {
	const stack = new WindowStack();
	const window = stack.push(new Window({ width: 100, height: 60 }));

	assert.equal(stack.depth, 1);
	stack.pop();
	assert.equal(window.closed, true);
	assert.equal(stack.depth, 0);
	assert.equal(stack.top, null, 'a closed window is not the top any more');
	assert.doesNotThrow(() => stack.update(16), 'and the stack has nothing left to update');
});

test('a closed window cannot be opened again, and says so', () => {
	const stack = new WindowStack();
	const window = new Window({ width: 100, height: 60 });
	window.close();

	assert.throws(() => stack.push(window), /already closed/);
	assert.equal(stack.depth, 0);
});

test('closeAll closes every window once, newest first', () => {
	const stack = new WindowStack();
	const lower = stack.push(new Window({ width: 100, height: 60 }));
	const upper = stack.push(new Window({ width: 100, height: 60 }));
	const order: string[] = [];
	lower.onClose.add(() => {
		order.push('lower');
		return false;
	});
	upper.onClose.add(() => {
		order.push('upper');
		return false;
	});

	stack.closeAll();

	assert.deepEqual(order, ['upper', 'lower']);
	assert.equal(lower.closed, true);
	assert.equal(upper.closed, true);
	assert.equal(stack.depth, 0);
});
