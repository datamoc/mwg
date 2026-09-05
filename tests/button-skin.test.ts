import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture, FederatedPointerEvent, EventBoundary } from 'pixi.js';
import { Button } from '../src/ui/Button.ts';
import { Label } from '../src/ui/Label.ts';
import { NinePatch } from '../src/ui/NinePatch.ts';
import { setTheme } from '../src/ui/theme.ts';

test('custom skin follows input, resize, disabled and theme changes', () => {
	let clicks = 0;
	const event = new FederatedPointerEvent(new EventBoundary());
	const button = new Button({ width: 40, height: 20, skin: {
		texture: Texture.WHITE, border: 0, tints: { pressed: 0x123456, hover: 0xabcdef },
	}, onClick: () => clicks++ });
	const panel = button.children[0] as NinePatch;
	assert.ok(panel instanceof NinePatch);
	button.emit('pointerdown', event);
	assert.equal(panel.tint, 0x123456);
	button.emit('pointerup', event);
	assert.equal(clicks, 1);
	assert.equal(panel.tint, 0xabcdef);
	button.resize(80, 30);
	assert.equal(panel.width, 80);
	assert.equal(panel.height, 30);
	button.setDisabled(true);
	button.emit('pointerdown', event); button.emit('pointerup', event);
	assert.equal(clicks, 1);
	assert.equal(panel.tint, 0x777777);
	setTheme({});
	assert.equal(button.children[0], panel);
	button.setDisabled(false);
	button.emit('pointerdown', event); button.emit('pointerupoutside', event);
	assert.equal(panel.tint, 0xffffff);
	assert.equal(clicks, 1);
	button.destroy({ children: true });
	assert.equal(Texture.WHITE.destroyed, false);
});

test('onPress fires on pointerdown and onRelease on pointerup, independent of onClick', () => {
	let presses = 0;
	let releases = 0;
	let clicks = 0;
	const event = new FederatedPointerEvent(new EventBoundary());
	const button = new Button({
		width: 40, height: 20,
		onPress: () => presses++,
		onRelease: () => releases++,
		onClick: () => clicks++,
	});

	button.emit('pointerdown', event);
	assert.equal(presses, 1);
	assert.equal(releases, 0, 'onRelease must not fire on press');

	button.emit('pointerup', event);
	assert.equal(releases, 1);
	assert.equal(clicks, 1);

	button.destroy({ children: true });
});

test('onRelease fires for pointerupoutside too, so a virtual d-pad button released by dragging off it still stops repeating', () => {
	let releases = 0;
	let clicks = 0;
	const event = new FederatedPointerEvent(new EventBoundary());
	const button = new Button({ width: 40, height: 20, onRelease: () => releases++, onClick: () => clicks++ });

	button.emit('pointerdown', event);
	button.emit('pointerupoutside', event);
	assert.equal(releases, 1);
	assert.equal(clicks, 0, 'a drag-off must not count as a click');

	button.destroy({ children: true });
});

test('onRelease does not fire for pointerup or pointerupoutside without a prior pointerdown', () => {
	let releases = 0;
	const event = new FederatedPointerEvent(new EventBoundary());
	const button = new Button({ width: 40, height: 20, onRelease: () => releases++ });

	button.emit('pointerup', event);
	button.emit('pointerupoutside', event);
	assert.equal(releases, 0);

	button.destroy({ children: true });
});

test('label render options survive theme changes', () => {
	const label = new Label({ text: 'Test', stroke: { color: 0x123456, width: 2 }, resolution: 2, roundPixels: true });
	setTheme({});
	assert.equal(label.resolution, 2);
	assert.equal(label.roundPixels, true);
	assert.equal((label.style.stroke as { color: number }).color, 0x123456);
	assert.equal((label.style.stroke as { width: number }).width, 2);
	label.destroy();
});


