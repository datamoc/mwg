import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SyncGuard, stateChecksum } from '../src/core/SyncGuard.ts';

test('the checksum ignores object key order, so two equal states hash alike', () => {
	assert.equal(stateChecksum({ hp: 7, x: 2, name: 'rat' }), stateChecksum({ name: 'rat', x: 2, hp: 7 }));
	assert.equal(
		stateChecksum({ a: { one: 1, two: 2 }, b: [1, 2, 3] }),
		stateChecksum({ b: [1, 2, 3], a: { two: 2, one: 1 } }),
	);
});

test('a changed value changes the checksum', () => {
	assert.notEqual(stateChecksum({ hp: 7 }), stateChecksum({ hp: 6 }));
	assert.notEqual(stateChecksum([1, 2, 3]), stateChecksum([1, 2, 4]));
	assert.notEqual(stateChecksum([1, 2]), stateChecksum([2, 1]), 'array order matters');
	assert.notEqual(stateChecksum(1), stateChecksum('1'), 'and so does type');
	assert.notEqual(stateChecksum({ a: 1 }), stateChecksum({ a: 1, b: 2 }));
});

test('the same value always hashes to the same number', () => {
	const value = { units: { hero: { hp: 10, x: 1 } }, turn: 4, log: ['a', 'b'] };
	assert.equal(stateChecksum(value), stateChecksum(structuredClone(value)));
	const first = stateChecksum(value);
	for (let i = 0; i < 5; i++) assert.equal(stateChecksum(value), first);
});

test('values JSON cannot represent follow JSON own rules', () => {
	//an object entry with undefined is dropped, so this equals the object without it
	assert.equal(stateChecksum({ a: 1, b: undefined }), stateChecksum({ a: 1 }));
	//an array element becomes null
	assert.equal(stateChecksum([1, undefined, 3]), stateChecksum([1, null, 3]));
	//non-finite numbers become null
	assert.equal(stateChecksum({ n: Number.NaN }), stateChecksum({ n: null }));
	assert.equal(stateChecksum({ n: Infinity }), stateChecksum({ n: null }));
});

test('strings are escaped, so a quote cannot be confused with structure', () => {
	assert.notEqual(stateChecksum('a"b'), stateChecksum('ab'));
	assert.notEqual(stateChecksum({ 'a":1': 2 }), stateChecksum({ a: { 1: 2 } }));
});

test('the checksum is an unsigned 32-bit integer', () => {
	for (const value of [null, true, 0, -1, 'x', [], {}, { deep: [1, 'two', null] }]) {
		const checksum = stateChecksum(value);
		assert.ok(Number.isInteger(checksum) && checksum >= 0 && checksum <= 0xffffffff, `${checksum}`);
	}
});

test('the guard accepts the first checksum for a tick and matching repeats', () => {
	const guard = new SyncGuard();
	assert.equal(guard.observe(1, 111), true);
	assert.equal(guard.observe(1, 111), true);
	assert.equal(guard.observe(2, 222), true);
	assert.equal(guard.divergent, false);
	assert.equal(guard.atTick, null);
});

test('a disagreement marks the run divergent and remembers the first tick', () => {
	const guard = new SyncGuard();
	guard.observe(1, 111);
	guard.observe(2, 222);

	assert.equal(guard.observe(2, 999), false, 'the same tick hashed differently');
	assert.equal(guard.divergent, true);
	assert.equal(guard.atTick, 2);

	//a later disagreement does not move the recorded tick, and the mismatch still fails
	assert.equal(guard.observe(5, 555), true, 'a first observation is still a reference');
	assert.equal(guard.observe(5, 556), false);
	assert.equal(guard.atTick, 2);
});

test('reset forgets every observation for a new run', () => {
	const guard = new SyncGuard();
	guard.observe(1, 1);
	guard.observe(1, 2);
	assert.equal(guard.divergent, true);

	guard.reset();
	assert.equal(guard.divergent, false);
	assert.equal(guard.atTick, null);
	assert.equal(guard.observe(1, 2), true, 'the mismatching value is now the reference');
});

test('out-of-order ticks are still compared per tick', () => {
	const guard = new SyncGuard();
	assert.equal(guard.observe(9, 90), true);
	assert.equal(guard.observe(3, 30), true);
	assert.equal(guard.observe(9, 90), true);
	assert.equal(guard.observe(3, 31), false);
	assert.equal(guard.atTick, 3);
});
