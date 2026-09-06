import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tooltip, type TooltipOptions } from '../src/two-d/ui/Tooltip.ts';

/**
 * Pixi measures text through a canvas, so a real `Label` cannot size itself without a DOM.
 * `measureBody` exists to be overridden for exactly this, the same way `StageScript`'s own
 * tests drive a subclass rather than stubbing Pixi.
 */
class SizedTooltip extends Tooltip {
	//a plain field, not a constructor parameter property: node's type-stripping test runner
	//rejects those outright
	private measured: { width: number; height: number };

	constructor(measured: { width: number; height: number }, options: TooltipOptions = {}) {
		super(options);
		this.measured = measured;
	}

	protected override measureBody(): { width: number; height: number } {
		return this.measured;
	}
}

const tip = (options: TooltipOptions = {}, size = { width: 60, height: 20 }) => new SizedTooltip(size, options);

test('a new tooltip is hidden with nothing hovered', () => {
	const tooltip = tip();
	assert.equal(tooltip.isShowing, false);
	assert.equal(tooltip.text, null);
});

test('nothing appears until the delay has elapsed', () => {
	const tooltip = tip({ delay: 0.5 });
	tooltip.hover('a potion of healing', 10, 10);

	assert.equal(tooltip.update(0.2), false);
	assert.equal(tooltip.isShowing, false);

	assert.equal(tooltip.update(0.2), false);
	assert.equal(tooltip.isShowing, false);

	assert.equal(tooltip.update(0.2), true, 'true on the frame it appears');
	assert.equal(tooltip.isShowing, true);

	assert.equal(tooltip.update(0.2), false, 'and never true again while it stays up');
});

test('hovering the same text keeps counting rather than restarting', () => {
	const tooltip = tip({ delay: 0.5 });
	for (let i = 0; i < 5; i++) {
		tooltip.hover('same', 10, 10);
		tooltip.update(0.2);
	}
	assert.equal(tooltip.isShowing, true, 'a per-frame hover call must not reset the wait forever');
});

test('hovering different text restarts the wait', () => {
	const tooltip = tip({ delay: 0.5 });
	tooltip.hover('first', 10, 10);
	tooltip.update(0.4);

	tooltip.hover('second', 10, 10);
	assert.equal(tooltip.text, 'second');

	tooltip.update(0.4);
	assert.equal(tooltip.isShowing, false, 'the second text waits its own full delay');

	tooltip.update(0.2);
	assert.equal(tooltip.isShowing, true);
});

test('leave cancels a pending tooltip', () => {
	const tooltip = tip({ delay: 0.5 });
	tooltip.hover('pending', 10, 10);
	tooltip.update(0.4);
	tooltip.leave();

	tooltip.update(1);
	assert.equal(tooltip.isShowing, false);
	assert.equal(tooltip.text, null);
});

test('leave hides a shown tooltip', () => {
	const tooltip = tip({ delay: 0 });
	tooltip.hover('shown', 10, 10);
	tooltip.update(0.01);
	assert.equal(tooltip.isShowing, true);

	tooltip.leave();
	assert.equal(tooltip.isShowing, false);
});

test('the panel sits at the anchor plus the offset when there is room', () => {
	const tooltip = tip({ delay: 0, offset: { x: 12, y: 16 } });
	tooltip.setViewport(400, 400);
	tooltip.hover('roomy', 100, 100);
	tooltip.update(0.01);

	assert.deepEqual(tooltip.panelPosition, { x: 112, y: 116 });
});

test('near the right edge it flips to the other side of the pointer instead of covering it', () => {
	const tooltip = tip({ delay: 0, offset: { x: 12, y: 16 }, margin: 4 }, { width: 60, height: 20 });
	tooltip.setViewport(200, 400);
	//panel is 60 wide plus padding; at x=180 it would overflow 200
	tooltip.hover('edge', 180, 100);
	tooltip.update(0.01);

	assert.ok(tooltip.panelPosition.x < 180, 'flipped to the left of the pointer');
	assert.ok(tooltip.panelPosition.x >= 4, 'still inside the margin');
	assert.ok(tooltip.panelPosition.x + tooltip.size.width <= 200 - 4 + 1e-9, 'and fully on screen');
});

test('near the bottom edge it flips upward', () => {
	const tooltip = tip({ delay: 0, offset: { x: 12, y: 16 }, margin: 4 });
	tooltip.setViewport(400, 200);
	tooltip.hover('low', 100, 185);
	tooltip.update(0.01);

	assert.ok(tooltip.panelPosition.y < 185, 'flipped above the pointer');
	assert.ok(tooltip.panelPosition.y + tooltip.size.height <= 200 - 4 + 1e-9);
});

test('with no viewport set it does not clamp at all', () => {
	const tooltip = tip({ delay: 0, offset: { x: 12, y: 16 } });
	tooltip.hover('unclamped', 5000, 5000);
	tooltip.update(0.01);
	assert.deepEqual(tooltip.panelPosition, { x: 5012, y: 5016 });
});

test('moving the pointer while shown repositions without re-waiting', () => {
	const tooltip = tip({ delay: 0.2 });
	tooltip.setViewport(400, 400);
	tooltip.hover('follow', 50, 50);
	tooltip.update(0.25);
	const first = tooltip.panelPosition;

	tooltip.hover('follow', 120, 60);
	assert.equal(tooltip.isShowing, true, 'stays up while the same thing is hovered');
	assert.notDeepEqual(tooltip.panelPosition, first, 'and follows the pointer');
});

test('setViewport re-clamps an already-shown tooltip', () => {
	const tooltip = tip({ delay: 0, offset: { x: 12, y: 16 }, margin: 4 });
	tooltip.setViewport(400, 400);
	tooltip.hover('shrink', 300, 100);
	tooltip.update(0.01);
	assert.equal(tooltip.panelPosition.x, 312);

	//the window shrinks under it: it must come back inside rather than stay off-screen
	tooltip.setViewport(320, 400);
	assert.ok(tooltip.panelPosition.x + tooltip.size.width <= 320 - 4 + 1e-9);
});
