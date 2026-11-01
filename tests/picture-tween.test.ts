import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PictureLayer } from '../src/two-d/render/PictureLayer.ts';
import { TintedSprite } from '../src/two-d/render/TintedSprite.ts';

const close = (actual: number, expected: number, epsilon = 1e-9): void => {
	assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

test('show accepts a tone, moveTo merges it per channel, and null clears it', () => {
	const layer = new PictureLayer();
	const picture = layer.show('1', { tone: { gray: 255 } });
	assert.equal(picture.tone.gray, 255);

	picture.moveTo({ tone: { red: 40 } });
	assert.equal(picture.tone.gray, 255, 'an unnamed channel is left alone');
	assert.equal(picture.tone.red, 40);

	picture.moveTo({ tone: null });
	assert.equal(picture.tone.gray, 0);
	assert.equal(picture.tone.red, 0);
});

test('TintedSprite applies a tone passed at construction', () => {
	const sprite = new TintedSprite({ tone: { gray: 120, blue: 10 } });
	assert.equal(sprite.tone.gray, 120);
	assert.equal(sprite.tone.blue, 10);
});

test('position and tone tweens run independently and both settle', async () => {
	const layer = new PictureLayer();
	const picture = layer.show('1');

	const moving = picture.tweenTo({ x: 100 }, 1);
	const toning = picture.tweenTo({ tone: { gray: 255, blue: 20 } }, 2);

	layer.update(0.5);
	close(picture.x, 50);
	close(picture.tone.gray, 63.75);

	layer.update(0.5);
	close(picture.x, 100);
	close(picture.tone.gray, 127.5);

	layer.update(1);
	close(picture.tone.gray, 255);
	close(picture.tone.blue, 20);
	await Promise.all([moving, toning]);
});

test('an instant change to one property does not disturb another property tween', () => {
	const layer = new PictureLayer();
	const picture = layer.show('1');

	picture.setTone({ gray: 200 });
	void picture.tweenTo({ x: 80 }, 1);
	picture.setTone({ gray: 0 });
	layer.update(0.5);

	close(picture.x, 40);
	assert.equal(picture.tone.gray, 0, 'the running move never re-applies the old tone');
});

test('a second tween on the same property retargets from the live value', () => {
	const layer = new PictureLayer();
	const picture = layer.show('1');

	void picture.tweenTo({ x: 100 }, 1);
	layer.update(0.5);
	close(picture.x, 50);

	void picture.tweenTo({ x: 200 }, 1);
	layer.update(0.5);
	close(picture.x, 125, 1e-9);
});

test('stopTween freezes the values and resolves the pending promises', async () => {
	const layer = new PictureLayer();
	const picture = layer.show('1');

	const done = picture.tweenTo({ y: 100 }, 1);
	layer.update(0.4);
	close(picture.y, 40);

	picture.stopTween();
	await done;
	layer.update(1);
	close(picture.y, 40);
});

test('superseding a tween resolves its promise rather than leaving a waiter hanging', async () => {
	const layer = new PictureLayer();
	const picture = layer.show('1');

	let firstResolved = false;
	const first = picture.tweenTo({ alpha: 0 }, 1).then(() => {
		firstResolved = true;
	});
	void picture.tweenTo({ alpha: 1 }, 2);
	await first;
	assert.equal(firstResolved, true);
});

test('a non-positive duration applies the patch at once', async () => {
	const picture = new PictureLayer().show('1');
	await picture.tweenTo({ x: 12, tone: { gray: 255 } }, 0);
	assert.equal(picture.x, 12);
	assert.equal(picture.tone.gray, 255);
});

test('rename and swap keep the sprite, its properties and the draw order', () => {
	const layer = new PictureLayer();
	const a = layer.show('a', { zIndex: 1, tone: { gray: 100 }, rotation: 0.5, blendMode: 'add' });
	const b = layer.show('b', { zIndex: 2 });
	const c = layer.show('c', { zIndex: 3 });

	const order = layer.names;
	assert.equal(layer.rename('a', 'renamed'), true);
	assert.equal(layer.get('renamed'), a);
	assert.equal(layer.get('a'), null);
	assert.deepEqual(layer.names, ['renamed', 'b', 'c']);
	assert.equal(order.length, layer.names.length);
	assert.equal(a.tone.gray, 100);
	assert.equal(a.rotation, 0.5);
	assert.equal(a.blendMode, 'add');

	assert.equal(layer.swap('b', 'c'), true);
	assert.equal(layer.get('b'), c);
	assert.equal(layer.get('c'), b);
	assert.deepEqual(layer.names, ['renamed', 'c', 'b']);

	assert.equal(layer.rename('missing', 'x'), false);
	assert.equal(layer.rename('renamed', 'b'), false, 'a taken name is refused');
});
