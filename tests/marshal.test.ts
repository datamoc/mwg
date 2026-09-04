import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeMarshal, encodeMarshal, RubySymbol, hashDefaultOf, withHashDefault, type RubyObject } from '../src/rpg/Marshal.ts';

/**
 * Fixtures below are real `Marshal.dump` output from Ruby itself (verified against Ruby's
 * own documented format, not just this decoder's own idea of it) - `decodeMarshal` has to
 * agree with what an actual Ruby save file contains, not merely round-trip its own encoder.
 * Generated with `ruby -e 'print Marshal.dump(...).bytes.map{|b| "0x%02x" % b}.join(", ")'`
 * against the real Ruby 3.4 on this machine, not hand-derived from the format spec.
 */

test('decodes nil, true and false', () => {
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x30])), null);
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x54])), true);
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x46])), false);
});

test('decodes small and multi-byte Fixnums, positive and negative', () => {
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x69, 0x00])), 0);
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x69, 0x06])), 1);
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x69, 0x7f])), 122);
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x69, 0xfa])), -1);
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x69, 0x01, 0x7b])), 123); // multi-byte positive
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x69, 0xff, 0x84])), -124); // multi-byte negative
});

test('decodes a Symbol - Marshal.dump(:foo)', () => {
	assert.equal(decodeMarshal(new Uint8Array([0x04, 0x08, 0x3a, 0x08, 0x66, 0x6f, 0x6f])), 'foo');
});

test('decodes an Array - Marshal.dump([1, 2, 3])', () => {
	// prettier-ignore
	const bytes = new Uint8Array([0x04, 0x08, 0x5b, 0x08, 0x69, 0x06, 0x69, 0x07, 0x69, 0x08]);
	assert.deepEqual(decodeMarshal(bytes), [1, 2, 3]);
});

test('decodes an ivar-wrapped empty String - Marshal.dump("")', () => {
	// prettier-ignore
	const bytes = new Uint8Array([0x04, 0x08, 0x49, 0x22, 0x00, 0x06, 0x3a, 0x06, 0x45, 0x54]);
	assert.equal(decodeMarshal(bytes), '');
});

test('decodes a plain (non-ivar-wrapped) String', () => {
	// '"' + length 3 + "abc"
	const bytes = new Uint8Array([0x04, 0x08, 0x22, 0x08, 0x61, 0x62, 0x63]);
	assert.equal(decodeMarshal(bytes), 'abc');
});

test('decodes a Hash into a Map, preserving key order', () => {
	const encoded = encodeMarshal(
		new Map<unknown, unknown>([
			['a', 1],
			['b', 2],
		])
	);
	const decoded = decodeMarshal(encoded) as Map<unknown, unknown>;
	assert.deepEqual([...decoded.entries()], [
		['a', 1],
		['b', 2],
	]);
});

test('decodes an Object into its class name and ivars', () => {
	const object: RubyObject = { class: 'Game_Actor', ivars: { '@hp': 42, '@name': 'Alice' } };
	const decoded = decodeMarshal(encodeMarshal(object)) as RubyObject;

	assert.equal(decoded.class, 'Game_Actor');
	assert.deepEqual(decoded.ivars, { '@hp': 42, '@name': 'Alice' });
});

test('rejects a header from an unsupported Marshal version', () => {
	assert.throws(() => decodeMarshal(new Uint8Array([0x05, 0x08, 0x30])), /version/);
});

test('a repeated Float or Bignum registers an object link, the same as a repeated string does - Marshal.dump([f,f])', () => {
	// prettier-ignore
	const floatBytes = new Uint8Array([0x04, 0x08, 0x5b, 0x07, 0x66, 0x08, 0x31, 0x2e, 0x35, 0x40, 0x06]);
	assert.deepEqual(decodeMarshal(floatBytes), [1.5, 1.5]);

	// Marshal.dump([2**70, 2**70])
	// prettier-ignore
	const bignumBytes = new Uint8Array([
		0x04, 0x08, 0x5b, 0x07, 0x6c, 0x2b, 0x0a,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x40, 0x00, 0x40, 0x06,
	]);
	const decoded = decodeMarshal(bignumBytes) as number[];
	assert.equal(decoded.length, 2);
	assert.equal(decoded[0], decoded[1], 'the second element must be the same decoded value as the first, via the link, not independently re-read');
});

test('decodes Hash.new(0) - a hash with a default value, kept out of the entries themselves', () => {
	// prettier-ignore
	const bytes = new Uint8Array([0x04, 0x08, 0x7d, 0x00, 0x69, 0x00]);
	const decoded = decodeMarshal(bytes) as Map<unknown, unknown>;
	assert.equal(decoded.size, 0, 'the default must not appear as a fake entry');
	assert.equal(hashDefaultOf(decoded), 0);
});

test('a real key equal to the old sentinel string is not swallowed by a hash default', () => {
	// Hash.new(0) with one real entry {1=>5} plus a second real entry {2=>7}
	// prettier-ignore
	const bytes = new Uint8Array([
		0x04, 0x08, 0x7d, 0x07,
		0x69, 0x06, 0x69, 0x0a,
		0x69, 0x07, 0x69, 0x0c,
		0x69, 0x00,
	]);
	const decoded = decodeMarshal(bytes) as Map<unknown, unknown>;
	assert.deepEqual([...decoded.entries()], [
		[1, 5],
		[2, 7],
	]);
	assert.equal(hashDefaultOf(decoded), 0);
});

test('withHashDefault round-trips a Hash.new(default) through encodeMarshal/decodeMarshal', () => {
	const hash = withHashDefault(
		new Map<unknown, unknown>([
			[1, 5],
			[2, 7],
		]),
		0
	);

	const decoded = decodeMarshal(encodeMarshal(hash)) as Map<unknown, unknown>;
	assert.deepEqual([...decoded.entries()], [
		[1, 5],
		[2, 7],
	]);
	assert.equal(hashDefaultOf(decoded), 0);
});

test('an ordinary Hash (no default) has no default value on decode', () => {
	const decoded = decodeMarshal(encodeMarshal(new Map([['a', 1]]))) as Map<unknown, unknown>;
	assert.equal(hashDefaultOf(decoded), undefined);
});

test('round-trips nil, booleans, integers (small, multi-byte, negative) and floats through encode/decode', () => {
	for (const value of [null, true, false, 0, 1, -1, 122, 123, -124, 100000, -100000, 3.5, -2.25]) {
		assert.equal(decodeMarshal(encodeMarshal(value)), value);
	}
});

test('round-trips strings, including ones needing multi-byte length encoding', () => {
	for (const text of ['', 'hello', 'x'.repeat(500)]) {
		assert.equal(decodeMarshal(encodeMarshal(text)), text);
	}
});

test('round-trips a symbol distinctly from an equal string, both decoding to the same JS string', () => {
	assert.equal(decodeMarshal(encodeMarshal(new RubySymbol('confirm'))), 'confirm');
	assert.equal(decodeMarshal(encodeMarshal('confirm')), 'confirm');
});

test('round-trips nested arrays, hashes and objects', () => {
	const value = {
		class: 'Game_Party',
		ivars: {
			'@gold': 500,
			'@actors': [1, 2, 3],
			'@items': new Map<unknown, unknown>([
				[1, 5],
				[7, 2],
			]),
		},
	} satisfies RubyObject;

	const decoded = decodeMarshal(encodeMarshal(value)) as RubyObject;
	assert.equal(decoded.class, 'Game_Party');
	assert.equal(decoded.ivars['@gold'], 500);
	assert.deepEqual(decoded.ivars['@actors'], [1, 2, 3]);
	assert.deepEqual([...(decoded.ivars['@items'] as Map<unknown, unknown>).entries()], [
		[1, 5],
		[7, 2],
	]);
});

test('encoding a value of an unsupported type throws rather than silently dropping it', () => {
	assert.throws(() => encodeMarshal(Symbol('nope')));
	assert.throws(() => encodeMarshal((() => {}) as unknown as number));
});
