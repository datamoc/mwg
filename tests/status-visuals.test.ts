import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatusVisuals } from '../src/render/StatusVisuals.ts';

function fakeTarget() {
	const calls: { method: 'lerpTint' | 'resetColor'; args: number[] }[] = [];
	return {
		calls,
		lerpTint(color: number, strength: number) {
			calls.push({ method: 'lerpTint', args: [color, strength] });
		},
		resetColor() {
			calls.push({ method: 'resetColor', args: [] });
		},
	};
}

test('no active status resets the sprite to its own colours', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.update(0.016);
	assert.deepEqual(target.calls, [{ method: 'resetColor', args: [] }]);
});

test('an active status lerps towards its style colour at the default strength', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.set('poisoned', true);
	visuals.update(0.016);

	assert.deepEqual(target.calls, [{ method: 'lerpTint', args: [0x00ff00, 0.5] }]);
});

test('set(kind, false) turns a status back off', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.set('poisoned', true);
	assert.equal(visuals.has('poisoned'), true);
	visuals.set('poisoned', false);
	assert.equal(visuals.has('poisoned'), false);

	visuals.update(0.016);
	assert.deepEqual(target.calls, [{ method: 'resetColor', args: [] }]);
});

test('style key order is priority: the first declared active style wins', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, {
		styles: {
			burning: { color: 0xff4400 },
			poisoned: { color: 0x00ff00 },
		},
	});

	//poisoned applied first in time, but burning is declared first and should still win
	visuals.set('poisoned', true);
	visuals.set('burning', true);
	visuals.update(0.016);

	assert.deepEqual(target.calls, [{ method: 'lerpTint', args: [0xff4400, 0.5] }]);
});

test('a kind with no matching style is tracked but never shown', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { poisoned: { color: 0x00ff00 } } });

	visuals.set('unmapped', true);
	assert.equal(visuals.has('unmapped'), true);
	visuals.update(0.016);

	assert.deepEqual(target.calls, [{ method: 'resetColor', args: [] }]);
});

test('a custom strength is used instead of the default', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { frozen: { color: 0x88ccff, strength: 0.9 } } });

	visuals.set('frozen', true);
	visuals.update(0.016);

	assert.deepEqual(target.calls, [{ method: 'lerpTint', args: [0x88ccff, 0.9] }]);
});

test('a pulsing style oscillates strength between 0 and its peak over time', () => {
	const target = fakeTarget();
	const visuals = new StatusVisuals(target, { styles: { burning: { color: 0xff4400, strength: 1, pulseRate: 1 } } });
	visuals.set('burning', true);

	visuals.update(0); // t = 0: sin(0) = 0 -> half peak
	assert.equal(target.calls[0].args[1], 0.5);

	visuals.update(0.25); // t = 0.25s, pulseRate 1Hz -> sin(pi/2) = 1 -> full peak
	assert.equal(target.calls[1].args[1], 1);

	visuals.update(0.25); // t = 0.5s -> sin(pi) = 0 -> half peak
	assert.ok(Math.abs(target.calls[2].args[1] - 0.5) < 1e-9);
});
