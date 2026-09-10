import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	reset,
	setBase,
	setActive,
	t,
	formatSpec,
	tokenizeMessage,
	diffPlaceholders,
	formatNumber,
	parseFTL,
} from '../src/i18n/index.ts';

//a representative cut of a wider matrix verified case by case against CPython itself:
//every value below was diffed against the equivalent f-string before being written here

test('integers pad, align, fill and sign like CPython', () => {
	assert.equal(formatSpec(7, '03d', 'en'), '007');
	assert.equal(formatSpec(7, '5d', 'en'), '    7');
	assert.equal(formatSpec(-7, '05d', 'en'), '-0007');
	assert.equal(formatSpec(7, '+d', 'en'), '+7');
	assert.equal(formatSpec(7, ' d', 'en'), ' 7');
	assert.equal(formatSpec(7, '<5d', 'en'), '7    ');
	assert.equal(formatSpec(7, '^7d', 'en'), '   7   ');
	assert.equal(formatSpec(7, '*>7', 'en'), '******7');
	assert.equal(formatSpec(7, '0>7', 'en'), '0000007');
});

test('alternate bases, prefixes and grouping match CPython', () => {
	assert.equal(formatSpec(255, 'x', 'en'), 'ff');
	assert.equal(formatSpec(255, 'X', 'en'), 'FF');
	assert.equal(formatSpec(255, '#x', 'en'), '0xff');
	assert.equal(formatSpec(-15, '#x', 'en'), '-0xf');
	assert.equal(formatSpec(8, '#o', 'en'), '0o10');
	assert.equal(formatSpec(5, '#b', 'en'), '0b101');
	assert.equal(formatSpec(1234567, ',d', 'en'), '1,234,567');
	assert.equal(formatSpec(1234567, '_d', 'en'), '1_234_567');
	assert.equal(formatSpec(0xdeadbeef, '_x', 'en'), 'dead_beef');
	assert.equal(formatSpec(0b10101010, '_b', 'en'), '1010_1010');
	assert.equal(formatSpec(255, '#_b', 'en'), '0b1111_1111');
});

test('floats render fixed, scientific, general and percent forms', () => {
	assert.equal(formatSpec(3.14159, '.2f', 'en'), '3.14');
	assert.equal(formatSpec(3.14159, 'f', 'en'), '3.141590');
	assert.equal(formatSpec(3.14159, '08.2f', 'en'), '00003.14');
	assert.equal(formatSpec(1234.5, ',.2f', 'en'), '1,234.50');
	assert.equal(formatSpec(1234.5, '.2e', 'en'), '1.23e+03');
	assert.equal(formatSpec(1234.5, '.2E', 'en'), '1.23E+03');
	assert.equal(formatSpec(100, '.3g', 'en'), '100');
	assert.equal(formatSpec(0.000123, '.2g', 'en'), '0.00012');
	assert.equal(formatSpec(1000000, '.6g', 'en'), '1e+06');
	assert.equal(formatSpec(1.5, '#.3g', 'en'), '1.50');
	assert.equal(formatSpec(0.125, '.1%', 'en'), '12.5%');
	assert.equal(formatSpec(0.5, '%', 'en'), '50.000000%');
});

test('a precision without a type reads as significant digits on non-integers only', () => {
	assert.equal(formatSpec(1234.567, '.4', 'en'), '1.235e+03');
	assert.equal(formatSpec(123.456, '.4', 'en'), '123.5');
	assert.equal(formatSpec(42, '.2', 'en'), undefined);
});

test('strings take width, alignment, fill and truncation only', () => {
	assert.equal(formatSpec('hi', '>8', 'en'), '      hi');
	assert.equal(formatSpec('hello world', '.3s', 'en'), 'hel');
	assert.equal(formatSpec('hi', '*^9', 'en'), '***hi****');
	assert.equal(formatSpec('ab', '05', 'en'), 'ab000');
	assert.equal(formatSpec(65, 'c', 'en'), 'A');
	assert.equal(formatSpec(65, '5c', 'en'), '    A');
});

test('infinities spell themselves Python-style and take width', () => {
	assert.equal(formatSpec(Infinity, '.2f', 'en'), 'inf');
	assert.equal(formatSpec(-Infinity, '.2F', 'en'), '-INF');
	assert.equal(formatSpec(NaN, '', 'en'), 'nan');
	assert.equal(formatSpec(-0.0, '', 'en'), '-0.0');
	assert.equal(formatSpec(Infinity, '', 'en'), 'inf');
});

test('whatever CPython refuses comes back undefined', () => {
	assert.equal(formatSpec(3.5, 'd', 'en'), undefined);
	assert.equal(formatSpec(255, ',x', 'en'), undefined);
	assert.equal(formatSpec(65, '+c', 'en'), undefined);
	assert.equal(formatSpec(65, '5s', 'en'), undefined);
	assert.equal(formatSpec('ab', '+', 'en'), undefined);
	assert.equal(formatSpec('ab', '=5', 'en'), undefined);
	assert.equal(formatSpec(7, 'q', 'en'), undefined);
	assert.equal(formatSpec(7, '.2', 'en'), undefined);
	assert.equal(formatSpec(1234, '.2n', 'en'), undefined);
	assert.equal(formatSpec(1234, ',n', 'en'), undefined);
	assert.equal(formatSpec(7, '{width}', 'en'), undefined);
});

test('`n` follows the active locale like formatNumber does', () => {
	setBase({ locale: 'en-US', direction: 'ltr', messages: {} });
	try {
		assert.equal(formatSpec(1234567, 'n', 'en-US'), formatNumber(1234567));
	} finally {
		reset();
	}
	setBase({ locale: 'de-DE', direction: 'ltr', messages: {} });
	try {
		assert.equal(formatSpec(1234567, 'n', 'de-DE'), new Intl.NumberFormat('de-DE').format(1234567));
	} finally {
		reset();
	}
});

test('t() interpolates specs, conversions and debug markers through params', () => {
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: {
			hit: 'Hit for {dmg:03d}!',
			share: 'Share: {ratio:.1%}',
			padded: '[{name:>8}]',
			quoted: '{name!r}',
			shouted: '{name!s}',
			debugged: '{dmg=}',
			debuggedSpec: '{dmg=:.1f}',
			plain: 'Hi {name}, you have {count} items.',
		},
	});
	try {
		assert.equal(t('hit', { dmg: 7 }), 'Hit for 007!');
		assert.equal(t('share', { ratio: 0.125 }), 'Share: 12.5%');
		assert.equal(t('padded', { name: 'Ada' }), '[     Ada]');
		assert.equal(t('quoted', { name: 'Ada' }), "'Ada'");
		assert.equal(t('shouted', { name: 'Ada' }), 'Ada');
		assert.equal(t('debugged', { dmg: 42 }), 'dmg=42');
		assert.equal(t('debuggedSpec', { dmg: 3.14159 }), 'dmg=3.1');
		assert.equal(t('plain', { name: 'Ada', count: 3 }), 'Hi Ada, you have 3 items.');
	} finally {
		reset();
	}
});

test('t() leaves missing tokens and ill-fitting specs untouched', () => {
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: {
			missing: 'Nothing for {dmg:03d} here.',
			wrongType: 'Count: {name:d}.',
			unknown: 'Value: {v:q}.',
		},
	});
	try {
		assert.equal(t('missing'), 'Nothing for {dmg:03d} here.');
		assert.equal(t('wrongType', { name: 'Ada' }), 'Count: {name:d}.');
		assert.equal(t('unknown', { v: 1 }), 'Value: {v:q}.');
	} finally {
		reset();
	}
});

test('an FTL variable carrying a spec reaches t() intact', () => {
	const catalog = parseFTL('en', 'hit = Hit for { $dmg:03d }!\nshout = { $name!r } lands.\n');
	setBase({ locale: 'en', direction: 'ltr', messages: {} });
	setActive(catalog);
	try {
		assert.equal(t('hit', { dmg: 7 }), 'Hit for 007!');
		assert.equal(t('shout', { name: 'Ada' }), "'Ada' lands.");
	} finally {
		reset();
	}
});

test('JS numbers take the integer path, documented: 3.0 renders as 3', () => {
	assert.equal(formatSpec(3, '', 'en'), '3');
	assert.equal(formatSpec(3, 'd', 'en'), '3');
	assert.equal(formatSpec(3, '.1f', 'en'), '3.0');
});

test('tokenizeMessage splits literals from every placeholder shape', () => {
	assert.deepEqual(tokenizeMessage('Hit for {dmg:03d}!'), [
		'Hit for ',
		{ raw: '{dmg:03d}', token: 'dmg', debug: false, conv: undefined, spec: '03d' },
		'!',
	]);
	assert.deepEqual(tokenizeMessage('{name!r} did {dmg=}'), [
		{ raw: '{name!r}', token: 'name', debug: false, conv: 'r', spec: undefined },
		' did ',
		{ raw: '{dmg=}', token: 'dmg', debug: true, conv: undefined, spec: undefined },
	]);
	assert.deepEqual(tokenizeMessage('no placeholders'), ['no placeholders']);
	assert.deepEqual(tokenizeMessage('{open'), ['{open']);
});

test('diffPlaceholders reports dropped, added and reshaped tokens', () => {
	assert.deepEqual(diffPlaceholders('Hit for {dmg:03d}!', 'Touché pour {dmg} !'), {
		missing: [],
		extra: [],
		changed: [{ token: 'dmg', base: ':03d', target: '' }],
	});
	assert.deepEqual(diffPlaceholders('{a} and {b}', '{a} et {c}'), {
		missing: ['b'],
		extra: ['c'],
		changed: [],
	});
	assert.deepEqual(diffPlaceholders('same {x} here', 'same {x} here'), { missing: [], extra: [], changed: [] });
	assert.deepEqual(diffPlaceholders('plain', 'plain'), { missing: [], extra: [], changed: [] });
});
