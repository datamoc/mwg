import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Container } from 'pixi.js';
import { Toast } from '../src/ui/Toast.ts';

test('show pops content in immediately when idle: alpha eases from 0 to 1 over the fade-in duration', () => {
	const toast = new Toast({ fadeIn: 1, hold: 1, fadeOut: 1 });
	const content = new Container();
	toast.show(content);

	assert.equal(content.alpha, 0);
	toast.update(0.5);
	assert.ok(content.alpha > 0 && content.alpha < 1, `alpha was ${content.alpha}`);

	toast.update(0.5);
	assert.ok(Math.abs(content.alpha - 1) < 1e-9);
});

test('content pops in from scaleFrom and settles to scale 1', () => {
	const toast = new Toast({ fadeIn: 1, hold: 1, fadeOut: 1, scaleFrom: 3 });
	const content = new Container();
	toast.show(content);

	assert.equal(content.scale.x, 3);
	toast.update(1); // fade-in complete
	assert.ok(Math.abs(content.scale.x - 1) < 1e-9);
});

test('a toast stays fully visible through the hold phase, then fades out', () => {
	const toast = new Toast({ fadeIn: 0.1, hold: 1, fadeOut: 1 });
	const content = new Container();
	toast.show(content);

	toast.update(0.1); // fade-in complete
	assert.equal(content.alpha, 1);

	toast.update(0.5); // mid-hold
	assert.equal(content.alpha, 1, 'must stay fully visible during hold');

	toast.update(0.5); // hold complete, fade-out begins
	toast.update(0.5); // mid fade-out
	assert.ok(Math.abs(content.alpha - 0.5) < 0.05, `alpha was ${content.alpha}`);
});

test('a second show() while one is playing queues rather than overlapping', () => {
	const toast = new Toast({ fadeIn: 0.1, hold: 0.1, fadeOut: 0.1 });
	const first = new Container();
	const second = new Container();

	toast.show(first);
	toast.show(second);

	assert.equal(toast.children.includes(second), false, 'the second toast must not appear yet');

	toast.update(0.1); // first: fade-in complete
	toast.update(0.1); // first: hold complete
	toast.update(0.1); // first: fade-out complete, second starts

	assert.equal(toast.children.includes(second), true);
});

test('isBusy is true while showing or queued, false once everything has played out', () => {
	const toast = new Toast({ fadeIn: 0.1, hold: 0.1, fadeOut: 0.1 });
	assert.equal(toast.isBusy, false);

	toast.show(new Container());
	assert.equal(toast.isBusy, true);

	toast.update(0.1);
	toast.update(0.1);
	toast.update(0.1);
	assert.equal(toast.isBusy, false);
});

test('a completed toast is removed and destroyed, not left as an invisible child', () => {
	const toast = new Toast({ fadeIn: 0.1, hold: 0.1, fadeOut: 0.1 });
	const content = new Container();
	toast.show(content);

	toast.update(0.1);
	toast.update(0.1);
	toast.update(0.1);

	assert.equal(toast.children.length, 0);
	assert.equal(content.destroyed, true);
});

test('update() with nothing queued does not throw', () => {
	const toast = new Toast();
	assert.doesNotThrow(() => toast.update(1));
});
