import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Stealth } from '../src/roguelike/Stealth.ts';

test('a unit stays undetected while every observer is outside the radius', () => {
	const stealth = new Stealth({ radius: 1 });
	const found = stealth.checkDetection({ x: 0, y: 0 }, [{ x: 5, y: 5 }]);
	assert.equal(found, false);
	assert.equal(stealth.isDetected, false);
});

test('an observer inside the radius detects the unit, even with clear terrain assumed', () => {
	const stealth = new Stealth({ radius: 1 });
	const found = stealth.checkDetection({ x: 0, y: 0 }, [{ x: 1, y: 0 }]);
	assert.equal(found, true);
	assert.equal(stealth.isDetected, true);
});

test('detection is reported only on the call that first discovers the unit', () => {
	const stealth = new Stealth({ radius: 2 });
	const observers = [{ x: 1, y: 0 }];

	assert.equal(stealth.checkDetection({ x: 0, y: 0 }, observers), true, 'first call discovers it');
	assert.equal(stealth.checkDetection({ x: 0, y: 0 }, observers), false, 'already detected, no second discovery');
	assert.equal(stealth.isDetected, true);
});

test('reset lets the unit be discovered again', () => {
	const stealth = new Stealth({ radius: 1 });
	stealth.checkDetection({ x: 0, y: 0 }, [{ x: 0, y: 1 }]);
	assert.equal(stealth.isDetected, true);

	stealth.reset();
	assert.equal(stealth.isDetected, false);
	assert.equal(stealth.checkDetection({ x: 0, y: 0 }, [{ x: 0, y: 1 }]), true);
});
