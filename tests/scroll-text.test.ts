import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installFakeTextMetrics } from './helpers/fakeTextMetrics.ts';
import { setReducedMotion } from '../src/core/Motion.ts';
import { MarqueeLabel, ScrollText, ellipsize, marqueeOffset, truncateLines } from '../src/two-d/ui/ScrollText.ts';

installFakeTextMetrics(10);
const width = (text: string) => text.length * 10;

test('ellipsize leaves a fitting text alone and cuts a long one to fit with the ellipsis', () => {
	assert.equal(ellipsize('short', 100, width), 'short');
	const cut = ellipsize('3. Le Fleuve profond (verrouillé)', 150, width);
	assert.ok(width(cut) <= 150, cut);
	assert.ok(cut.endsWith('…'));
	assert.ok(cut.startsWith('3. Le'));
	assert.equal(ellipsize('wide', 5, width), '…', 'when not even one letter fits');
});

test('truncateLines wraps at the width and keeps the last line cut with an ellipsis', () => {
	const text = 'build a bridge across the river gorge';
	const lines = truncateLines(text, 120, 2, width);
	assert.equal(lines.length, 2);
	assert.ok(lines.every((line) => width(line) <= 120));
	assert.ok(lines[1].endsWith('…'));
	assert.deepEqual(truncateLines('a b', 120, 3, width), ['a b']);
	assert.deepEqual(truncateLines('', 120, 3, width), []);
});

test('marqueeOffset waits, slides to the end, waits, and slides back', () => {
	assert.equal(marqueeOffset(300, 200, 0), 0);
	assert.equal(marqueeOffset(300, 200, 0.99), 0, 'still in the first pause');
	assert.equal(marqueeOffset(300, 200, 2), 40, 'one second into the slide at 40 px/s');
	assert.equal(marqueeOffset(300, 200, 3.5), 100, 'at the far end');
	assert.equal(marqueeOffset(300, 200, 4.5), 100, 'pausing there');
	assert.equal(marqueeOffset(300, 200, 6), 40, 'on the way back');
	assert.equal(marqueeOffset(300, 200, 100), marqueeOffset(300, 200, 100 % 7), 'it repeats');
	assert.equal(marqueeOffset(150, 200, 3), 0, 'a text that fits never moves');
});

class FixedText extends ScrollText {
	//a subclass field is set after the base constructor has measured once, hence the default above
	lineCount = 3;
	protected override measureHeight(): number {
		return (this.lineCount ?? 3) * 18;
	}
}

test('ScrollText is as tall as its text up to maxHeight and scrolls beyond it', () => {
	const hint = new FixedText({ width: 200, maxHeight: 40 });
	assert.equal(hint.box.viewportHeight, 40);
	assert.equal(hint.box.scrollable, true);
	hint.box.scrollBy(10);
	hint.lineCount = 1;
	hint.setText('short');
	assert.equal(hint.box.viewportHeight, 18);
	assert.equal(hint.box.scrollable, false);
	assert.equal(hint.box.offset, 0, 'new text starts at the top');
});

class FixedMarquee extends MarqueeLabel {
	protected override measureWidth(text: string): number {
		return width(text);
	}
}

test('a MarqueeLabel slides a long line and keeps a short one still', () => {
	const long = new FixedMarquee({ width: 100, text: 'a long track title here' });
	assert.equal(long.shift, 0);
	long.update(1);
	long.update(1);
	assert.ok(long.shift > 0, 'it moves once the pause is over');
	const short = new FixedMarquee({ width: 300, text: 'short' });
	short.update(5);
	assert.equal(short.shift, 0);
});

test('under reduced motion a MarqueeLabel holds still, cut short', () => {
	setReducedMotion(true);
	try {
		const label = new FixedMarquee({ width: 100, text: 'a long track title here' });
		label.update(5);
		assert.equal(label.shift, 0);
	} finally {
		setReducedMotion(null);
	}
});

test('ScrollText.resize re-wraps and resizes its box in place', () => {
	const hint = new FixedText({ width: 200, maxHeight: 40 });
	hint.resize(90);
	assert.equal(hint.viewWidth, 90);
	assert.equal(hint.box.viewportWidth, 90);
	assert.equal((hint.box.hitArea as unknown as { width: number }).width, 90);
	hint.resize(320);
	assert.equal(hint.box.viewportWidth, 320);
});
