import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ScrollBox, scrollOffset } from '../src/two-d/ui/ScrollBox.ts';

/**
 * The scroll box (item 261): `scrollOffset` is the clamping rule every path shares, tested at both
 * ends and against content that fits; the widget's own state - what scrolls it, and how it reacts
 * when the content or the viewport changes under it - is the rest.
 */

test('scrollOffset clamps to the content and never goes above the top', () => {
	assert.equal(scrollOffset(-5, 500, 200), 0);
	assert.equal(scrollOffset(100, 500, 200), 100);
	assert.equal(scrollOffset(900, 500, 200), 300);
});

test('content shorter than the viewport can only sit at 0', () => {
	assert.equal(scrollOffset(50, 100, 200), 0);
	assert.equal(scrollOffset(0, 100, 200), 0);
});

test('the widget reports what it can scroll', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 200 });
	assert.equal(box.maxOffset, 150);
	assert.equal(box.scrollable, true);

	const short = new ScrollBox({ width: 100, height: 50, contentHeight: 30 });
	assert.equal(short.maxOffset, 0);
	assert.equal(short.scrollable, false);
});

test('scrollBy and scrollTo clamp to the same range', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 200 });

	box.scrollBy(1000);
	assert.equal(box.offset, 150);
	box.scrollBy(-1000);
	assert.equal(box.offset, 0);
	box.scrollTo(75);
	assert.equal(box.offset, 75);
});

test('a wheel event scrolls, and onChange fires only when the offset moves', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 200 });
	const seen: number[] = [];
	box.onChange.add((offset) => {
		seen.push(offset);
	});

	box.emit('wheel', { deltaY: 30 } as never);
	assert.equal(box.offset, 30);
	box.emit('wheel', { deltaY: 0 } as never);
	assert.deepEqual(seen, [30], 'a zero move is not a change');
});

test('scrollIntoView scrolls the least it can to show an item', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 500 });

	box.scrollIntoView(120, 20);
	assert.equal(box.offset, 90, 'the bottom of the item meets the bottom of the viewport');
	box.scrollIntoView(10, 20);
	assert.equal(box.offset, 10, 'an item above the view scrolls up to meet it');
	box.scrollIntoView(40, 10);
	assert.equal(box.offset, 10, 'an item already fully visible does not move the view');
	box.scrollIntoView(60, 20);
	assert.equal(box.offset, 30, 'an item below the view scrolls down to meet it');
});

test('growing the viewport and shrinking the content both pull the offset back in range', () => {
	const box = new ScrollBox({ width: 100, height: 50, contentHeight: 200 });
	box.scrollTo(150);

	box.setContentHeight(60);
	assert.equal(box.offset, 10, 'the content shrank, so the far end moved up');

	box.resize(100, 100);
	assert.equal(box.offset, 0, 'the viewport now fits all of it');
});
