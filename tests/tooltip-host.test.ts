import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Graphics } from 'pixi.js';

import { installFakeTextMetrics } from './helpers/fakeTextMetrics.ts';
import { Signal } from '../src/core/Signal.ts';
import type { PointerPoint, PointerTracker } from '../src/core/Input.ts';
import { Button } from '../src/two-d/ui/Button.ts';
import { Tooltip, TooltipHost } from '../src/two-d/ui/Tooltip.ts';

installFakeTextMetrics();

class SizedTooltip extends Tooltip {
	protected override measureBody(): { width: number; height: number } {
		return { width: 60, height: 20 };
	}
}

const host = (longPress = 0.5) => new TooltipHost({ tooltip: new SizedTooltip({ delay: 0.4 }), longPress });
const rect = (x: number, y: number, text: string | undefined, active = true) => ({
	bounds: () => ({ x, y, width: 40, height: 20 }),
	text: () => text,
	active: () => active,
});

test('hovering a target shows its text after the hover delay, leaving hides it', () => {
	const h = host();
	h.add(rect(10, 10, 'Run the test'));
	h.pointerMove(20, 15);
	assert.equal(h.update(0.3), false);
	assert.equal(h.update(0.2), true);
	assert.equal(h.tooltip.text, 'Run the test');
	h.pointerMove(200, 200);
	assert.equal(h.tooltip.isShowing, false);
});

test('a press shows the text only after the long-press time and releasing hides it', () => {
	const h = host(0.5);
	h.add(rect(10, 10, 'Cables only pull'));
	h.pointerDown(20, 15);
	assert.equal(h.update(0.45), false, 'the hover delay alone is not enough on a press');
	assert.equal(h.update(0.1), true);
	h.pointerUp();
	assert.equal(h.tooltip.isShowing, false);
});

test('targets with no text, hidden targets and the empty space explain nothing; the top one wins', () => {
	const h = host();
	h.add(rect(10, 10, 'below'));
	h.add(rect(10, 10, 'above'));
	h.add(rect(100, 10, undefined));
	h.add(rect(200, 10, 'hidden', false));
	h.pointerMove(20, 15);
	assert.equal(h.tooltip.text, 'above');
	h.pointerMove(110, 15);
	assert.equal(h.tooltip.text, null);
	h.pointerMove(210, 15);
	assert.equal(h.tooltip.text, null);
});

test('a target can be removed again', () => {
	const h = host();
	const remove = h.add(rect(10, 10, 'gone soon'));
	remove();
	h.pointerMove(20, 15);
	assert.equal(h.tooltip.text, null);
});

test('a disabled button is still explained, with text asked for at that moment', () => {
	const stage = new Container();
	const h = host();
	let reason = 'Build a road first';
	const test_ = new Button({ width: 80, height: 28, text: 'Test', disabled: true, tooltip: () => reason });
	stage.addChild(test_, h);
	test_.position.set(100, 50);
	h.addButton(test_);
	assert.equal(test_.eventMode, 'none', 'it gets no pointer events of its own');
	h.pointerMove(120, 60);
	assert.equal(h.tooltip.text, 'Build a road first');
	h.pointerMove(0, 0);
	reason = 'Add a vehicle';
	h.pointerMove(120, 60);
	assert.equal(h.tooltip.text, 'Add a vehicle');
	test_.visible = false;
	h.pointerMove(0, 0);
	h.pointerMove(120, 60);
	assert.equal(h.tooltip.text, null, 'a hidden button explains nothing');
});

test('a button without a tooltip explains nothing', () => {
	const h = host();
	const plain = new Button({ width: 80, height: 28, text: 'Plain' });
	new Container().addChild(plain);
	h.addButton(plain);
	h.pointerMove(5, 5);
	assert.equal(h.tooltip.text, null);
});

test('attach wires a pointer tracker and detaches again', () => {
	const h = host(0.2);
	h.add(rect(10, 10, 'wired'));
	const point = (x: number, y: number, pressed: boolean): PointerPoint => ({
		x,
		y,
		worldX: x,
		worldY: y,
		dx: 0,
		dy: 0,
		pointerId: 1,
		pressed,
	});
	const tracker = {
		down: new Signal<PointerPoint>(),
		move: new Signal<PointerPoint>(),
		drag: new Signal<PointerPoint>(),
		up: new Signal<PointerPoint & { dragged: boolean }>(),
		current: null,
		detach() {},
	} satisfies PointerTracker;
	const detach = h.attach(tracker);
	tracker.down.dispatch(point(20, 15, true));
	h.update(0.25);
	assert.equal(h.tooltip.isShowing, true);
	tracker.up.dispatch({ ...point(20, 15, false), dragged: false });
	assert.equal(h.tooltip.isShowing, false);
	detach();
	tracker.move.dispatch(point(20, 15, false));
	assert.equal(h.tooltip.text, null);
});

test('a button swaps its icon at run time and shows a second icon while selected', () => {
	const off = new Graphics();
	const on = new Graphics();
	const other = new Graphics();
	const button = new Button({ width: 32, height: 32, icon: off, iconSelected: on });
	assert.ok(button.children.includes(off) && !button.children.includes(on));
	button.setSelected(true);
	assert.ok(button.children.includes(on) && !button.children.includes(off));
	button.setSelected(false);
	assert.ok(button.children.includes(off));

	button.setIcon(other);
	assert.ok(button.children.includes(other) && !button.children.includes(off));
	button.setSelected(true);
	assert.ok(button.children.includes(on), 'the selected icon still wins while selected');
	button.setSelected(false);
	assert.ok(button.children.includes(other));

	button.setIcon(null);
	assert.ok(!button.children.includes(other));
	assert.equal(off.destroyed, false, 'icons belong to the caller');
});

test('setTooltip changes what the button explains', () => {
	const button = new Button({ width: 32, height: 32, tooltip: 'first' });
	assert.equal(button.tooltip, 'first');
	button.setTooltip(() => 'second');
	assert.equal(button.tooltip, 'second');
	button.setTooltip(undefined);
	assert.equal(button.tooltip, undefined);
});
