import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ScrollBox, ScrollDrag } from '../src/two-d/ui/ScrollBox.ts';

/**
 * Touch, keyboard and scrollbar scrolling, and the viewport that sizes itself to its content: the
 * parts of a scrolling list a phone or a keyboard user reaches that the wheel alone does not.
 */

test('a drag moves the content with the finger and coasts on after release', () => {
	const drag = new ScrollDrag();
	drag.start(300, 0);
	assert.equal(drag.move(270, 0.05), 30);
	assert.equal(drag.move(240, 0.1), 30);
	drag.end();
	assert.ok(drag.velocity > 0, 'it was moving, so it keeps moving');
	const first = drag.step(1 / 60);
	let last = first;
	for (let i = 0; i < 600 && drag.velocity !== 0; i++) last = drag.step(1 / 60);
	assert.ok(first > 0 && last >= 0);
	assert.equal(drag.velocity, 0, 'friction brings it to rest');
	assert.equal(drag.step(1 / 60), 0);
});

test('a slow release does not coast and a new touch stops a coast', () => {
	const slow = new ScrollDrag();
	slow.start(100, 0);
	slow.move(99.9, 1);
	slow.end();
	assert.equal(slow.velocity, 0);

	const fast = new ScrollDrag();
	fast.start(300, 0);
	fast.move(200, 0.05);
	fast.end();
	assert.ok(fast.velocity !== 0);
	fast.start(200, 1);
	assert.equal(fast.velocity, 0);
});

test('the box scrolls by a drag only after the pointer has travelled a few pixels', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 300, touch: true });
	box.dragStart(100, 0);
	box.dragMove(98, 0.01);
	assert.equal(box.offset, 0, 'a tap with a little jitter does not scroll');
	assert.equal(box.dragged, false);
	box.dragMove(60, 0.05);
	assert.ok(box.offset > 0);
	assert.equal(box.dragged, true);
	box.dragEnd();
	const stopped = box.offset;
	box.update(0.1);
	assert.ok(box.offset >= stopped, 'it coasts the same way it was dragged');
});

test('a box without touch ignores drags', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 300 });
	box.dragStart(100, 0);
	box.dragMove(0, 0.1);
	assert.equal(box.offset, 0);
});

test('coasting stops at the end of the content', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 80, touch: true });
	box.dragStart(300, 0);
	box.dragMove(0, 0.05);
	box.dragEnd();
	for (let i = 0; i < 20; i++) box.update(1 / 60);
	assert.equal(box.offset, 30);
	box.update(1 / 60);
	assert.equal(box.offset, 30);
});

test('keys scroll by line, by page and to either end', () => {
	const box = new ScrollBox({ width: 100, height: 100, contentHeight: 1000, keyboard: true, lineHeight: 20 });
	assert.equal(box.handleKey('ArrowDown'), true);
	assert.equal(box.offset, 20);
	assert.equal(box.handleKey('PageDown'), true);
	assert.equal(box.offset, 100, 'a page is the viewport less one line');
	box.handleKey('ArrowUp');
	assert.equal(box.offset, 80);
	box.handleKey('End');
	assert.equal(box.offset, 900);
	box.handleKey('PageUp');
	assert.equal(box.offset, 820);
	box.handleKey('Home');
	assert.equal(box.offset, 0);
	assert.equal(box.handleKey('a'), false);
});

test('dragging the thumb scrolls in proportion to its travel, and the track jumps', () => {
	const box = new ScrollBox({ width: 100, height: 100, contentHeight: 400 });
	const { height } = box.thumbMetrics;
	assert.equal(height, 25);
	box.thumbDragStart(0);
	box.thumbDragMove(75);
	assert.equal(box.offset, 300, 'the thumb at the bottom is the content at its end');
	box.thumbDragMove(37.5);
	assert.equal(box.offset, 150);

	box.scrollToThumbCentre(12.5);
	assert.equal(box.offset, 0);
	box.scrollToThumbCentre(87.5);
	assert.equal(box.offset, 300);
});

test('autoHeight sizes the viewport to the content up to the largest height', () => {
	const box = new ScrollBox({ width: 100, height: 120, autoHeight: true, contentHeight: 40 });
	assert.equal(box.viewportHeight, 40);
	assert.equal(box.scrollable, false);
	box.setContentHeight(500);
	assert.equal(box.viewportHeight, 120);
	assert.equal(box.maxOffset, 380);
	box.setContentHeight(90);
	assert.equal(box.viewportHeight, 90);
	box.resize(100, 60);
	assert.equal(box.viewportHeight, 60);
});
