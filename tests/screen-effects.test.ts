import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenEffects } from '../src/two-d/render/ScreenEffects.ts';

test('a new overlay is clear and idle', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	assert.equal(effects.washAlpha, 0);
	assert.equal(effects.isBusy, false);
});

test('fadeOut drives the wash to fully covering, reporting completion exactly once', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.fadeOut(1);
	assert.equal(effects.isBusy, true);

	assert.equal(effects.update(0.5), false);
	assert.ok(effects.washAlpha > 0 && effects.washAlpha < 1, 'partway through');

	assert.equal(effects.update(0.5), true, 'true on the frame it completes');
	assert.equal(effects.washAlpha, 1);
	assert.equal(effects.isBusy, false);

	assert.equal(effects.update(0.5), false, 'and never true again');
});

test('fadeIn clears the wash back to transparent', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.fadeOut(0);
	assert.equal(effects.washAlpha, 1);

	effects.fadeIn(1);
	effects.update(1);
	assert.equal(effects.washAlpha, 0);
});

test('a non-positive duration is an instant cut, applied without waiting a frame', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.fadeOut(0);
	assert.equal(effects.washAlpha, 1);
	assert.equal(effects.isBusy, false, 'nothing left running');
});

test('flash rises then falls, ending clear rather than stuck at full', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.flash(1);

	effects.update(0.5);
	const peak = effects.washAlpha;
	assert.ok(peak > 0.9, 'near full at the midpoint');

	assert.equal(effects.update(0.5), true);
	assert.equal(effects.washAlpha, 0, 'a flash always ends clear');
	assert.equal(effects.isBusy, false);
});

test('flash respects a peak below full', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.flash(1, 0xffffff, 0.5);
	effects.update(0.5);
	assert.ok(effects.washAlpha <= 0.5 + 1e-9);
	assert.ok(effects.washAlpha > 0.4);
});

test('setTint holds an opacity indefinitely and does not read as busy', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.setTint(0x00ff00, 0.3);
	assert.equal(effects.washAlpha, 0.3);
	assert.equal(effects.isBusy, false);

	effects.update(10);
	assert.equal(effects.washAlpha, 0.3, 'a held tint never ticks away on its own');
});

test('setTint clamps out-of-range opacity rather than passing it through', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.setTint(0x00ff00, 5);
	assert.equal(effects.washAlpha, 1);
	effects.setTint(0x00ff00, -2);
	assert.equal(effects.washAlpha, 0);
});

test('setTint cancels a running fade, since both drive the same overlay', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.fadeOut(1);
	effects.setTint(0xff0000, 0.5);
	assert.equal(effects.isBusy, false);
	assert.equal(effects.washAlpha, 0.5);
});

test('clear drops a running effect and a held tint alike', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.setTint(0xff0000, 0.8);
	effects.clear();
	assert.equal(effects.washAlpha, 0);
	assert.equal(effects.isBusy, false);
});

test('a fade started mid-fade continues from where the wash actually is', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.fadeOut(1);
	effects.update(0.5);
	const midpoint = effects.washAlpha;

	//reversing partway must not snap to full first
	effects.fadeIn(1);
	effects.update(0.001);
	assert.ok(effects.washAlpha <= midpoint + 1e-6);
});

test('setViewport does not disturb a running effect', () => {
	const effects = new ScreenEffects({ width: 100, height: 100 });
	effects.fadeOut(1);
	effects.update(0.5);
	const before = effects.washAlpha;
	effects.setViewport(640, 480);
	assert.equal(effects.washAlpha, before);
	assert.equal(effects.isBusy, true);
});
