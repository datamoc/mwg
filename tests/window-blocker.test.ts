import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Window } from '../src/two-d/ui/Window.ts';

/**
 * A window that has to be answered stops clicks reaching the map behind it, and a click that
 * lands outside it dismisses it the way `cancel` would. That needs a real layer, because a
 * window's own frame draws without being clickable: the blocker is a full-viewport child under
 * the window's chrome, and `handleOutsideClick` is the whole decision it makes - which is what
 * these tests ask, headless, without a renderer to dispatch pointer events through.
 */

//no title anywhere: a Label measures text through a canvas, which node --test has no document for
function windowWith(blocker: boolean, closable = true): Window {
	return new Window({ width: 100, height: 60, blocker, closable });
}

test('a window without a blocker has no click-catching layer at all', () => {
	const window = windowWith(false);
	window.place(800, 600);

	for (const child of window.children) assert.equal(child.hitArea, undefined, 'nothing swallows a click');
});

test('a blocker covers the whole viewport and draws nothing', () => {
	const window = windowWith(true);
	window.place(800, 600);
	const blocker = window.children[0];

	assert.equal(blocker.eventMode, 'static', 'hit-testable, or Pixi would ignore it entirely');
	assert.equal(blocker.children.length, 0, 'a bare container: nothing to draw');
	assert.ok(blocker.hitArea, 'and a hit area, or a container is not hit-tested at all');

	//the hit area is in the window's own coordinates, so the viewport starts at -x, -y
	assert.equal(blocker.hitArea.contains(1 - window.x, 1 - window.y), true, 'the far corner is caught');
	assert.equal(blocker.hitArea.contains(5, 5), true, 'and so is the window itself, so nothing passes through');
	assert.equal(blocker.hitArea.contains(800 - window.x, 5), false, 'but not past the viewport edge');
});

test('the blocker sits under the window, so the window own widgets are hit first', () => {
	const window = windowWith(true);
	const blocker = window.children[0];

	assert.equal(window.getChildIndex(blocker), 0, 'added first, and Pixi hit-tests children back to front');
});

test('a click outside a closable window closes it, the pointer answer to cancel', () => {
	const window = windowWith(true);
	let announced = 0;
	window.onClose.add(() => {
		announced++;
		return false;
	});

	assert.equal(window.handleOutsideClick(150, 30), true, 'past the right edge');
	assert.equal(window.closed, true);
	assert.equal(announced, 1);
});

test('a click on the window itself is swallowed but does not dismiss it', () => {
	const window = windowWith(true);
	window.place(800, 600);

	assert.equal(window.handleOutsideClick(5, 5), false, 'the top-left corner of the frame');
	assert.equal(window.handleOutsideClick(99, 59), false, 'and the last cell inside the bounds, 100 by 60');
	assert.equal(window.handleOutsideClick(-40, -40), true, 'while one outside the window does dismiss it');
	assert.equal(window.closed, true);
});

test('a non-closable window swallows a click outside without dismissing', () => {
	const window = windowWith(true, false);
	assert.equal(window.handleOutsideClick(150, 30), false);
	assert.equal(window.closed, false);
});

test('a click on the blocker of a closed window is ignored rather than an error', () => {
	const window = windowWith(true);
	window.close();
	assert.equal(window.handleOutsideClick(150, 30), false);
});
