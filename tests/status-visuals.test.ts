import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatusVisuals, type TintTarget } from '../src/two-d/render/StatusVisuals.ts';

function fakeTarget(): TintTarget {
	return { colorAdd: 0 };
}

/** unpacks `packColorAdd`'s little-endian unorm8x4 back to 0..1 floats, for readable assertions */
function rgb(target: TintTarget): { r: number; g: number; b: number } {
	const packed = target.colorAdd;
	return {
		r: (packed & 0xff) / 255,
		g: ((packed >> 8) & 0xff) / 255,
		b: ((packed >> 16) & 0xff) / 255,
	};
}

test('no active status leaves colorAdd at zero', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.update(0.016);
	assert.equal(target.colorAdd, 0);
});

test('an active status contributes its style colour at the default strength', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.set('poisoned', true);
	visuals.update(0.016);

	const { r, g, b } = rgb(target);
	assert.ok(Math.abs(r - 0) < 0.01);
	assert.ok(Math.abs(g - 0.5) < 0.01);
	assert.ok(Math.abs(b - 0) < 0.01);
});

test('set(kind, false) turns a status back off', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.set('poisoned', true);
	assert.equal(visuals.has('poisoned'), true);
	visuals.set('poisoned', false);
	assert.equal(visuals.has('poisoned'), false);

	visuals.update(0.016);
	assert.equal(target.colorAdd, 0);
});

test('two active statuses compose instead of one winning by declaration order', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, {
		styles: {
			burning: { color: 0xff0000, strength: 0.4 },
			poisoned: { color: 0x00ff00, strength: 0.4 },
		},
	});

	visuals.set('poisoned', true);
	visuals.set('burning', true);
	visuals.update(0.016);

	const { r, g, b } = rgb(target);
	assert.ok(Math.abs(r - 0.4) < 0.01, `expected red ~0.4, got ${r}`);
	assert.ok(Math.abs(g - 0.4) < 0.01, `expected green ~0.4, got ${g}`);
	assert.ok(Math.abs(b - 0) < 0.01);
});

test('composed channels clip at 1 instead of wrapping', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, {
		styles: {
			a: { color: 0xff0000, strength: 0.8 },
			b: { color: 0xff0000, strength: 0.8 },
		},
	});

	visuals.set('a', true);
	visuals.set('b', true);
	visuals.update(0.016);

	const { r } = rgb(target);
	assert.ok(Math.abs(r - 1) < 0.01, `expected red clipped to ~1, got ${r}`);
});

test('a kind with no matching style is tracked but never shown', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.set('unmapped', true);
	assert.equal(visuals.has('unmapped'), true);
	visuals.update(0.016);

	assert.equal(target.colorAdd, 0);
});

test('a custom strength is used instead of the default', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { frozen: { color: 0x88ccff, strength: 0.9 } } });

	visuals.set('frozen', true);
	visuals.update(0.016);

	const { b } = rgb(target);
	assert.ok(Math.abs(b - 0.9) < 0.01, `expected blue ~0.9, got ${b}`);
});

test('a pulsing style oscillates strength between 0 and its peak over time', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { burning: { color: 0xff0000, strength: 1, pulseRate: 1 } } });
	visuals.set('burning', true);

	visuals.update(0); // t = 0: sin(0) = 0 -> half peak
	assert.ok(Math.abs(rgb(target).r - 0.5) < 0.01);

	visuals.update(0.25); // t = 0.25s, pulseRate 1Hz -> sin(pi/2) = 1 -> full peak
	assert.ok(Math.abs(rgb(target).r - 1) < 0.01);

	visuals.update(0.25); // t = 0.5s -> sin(pi) = 0 -> half peak
	assert.ok(Math.abs(rgb(target).r - 0.5) < 0.01);
});

test('flash layers a decaying contribution on top of whatever statuses are active', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: {} });

	visuals.flash(0xffffff, 1, 1);
	visuals.update(0); // just started: full strength
	assert.ok(Math.abs(rgb(target).r - 1) < 0.01);

	visuals.update(0.5); // half decayed
	assert.ok(Math.abs(rgb(target).r - 0.5) < 0.02, `expected ~0.5, got ${rgb(target).r}`);

	visuals.update(0.5); // fully decayed
	assert.equal(target.colorAdd, 0);
});
