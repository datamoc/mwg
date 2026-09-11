import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePo } from '../src/i18n/Po.ts';
import { setActive, tRaw, reset } from '../src/i18n/index.ts';

test('a basic msgid/msgstr pair becomes one catalog message', () => {
	const catalog = parsePo('fr', ['msgid "greeting"', 'msgstr "Bonjour"'].join('\n'));
	assert.equal(catalog.locale, 'fr');
	assert.deepEqual(catalog.messages, { greeting: 'Bonjour' });
});

test('the header entry is metadata, not a message', () => {
	const po = [
		'msgid ""',
		'msgstr ""',
		'"Project-Id-Version: test\\n"',
		'"Language: fr\\n"',
		'"Plural-Forms: nplurals=2; plural=(n > 1);\\n"',
		'',
		'msgid "hello"',
		'msgstr "bonjour"',
	].join('\n');
	assert.deepEqual(parsePo('fr', po).messages, { hello: 'bonjour' });
});

test('a string continued on the next quoted line is concatenated', () => {
	const po = ['msgid ""', '"a long "', '"message"', 'msgstr ""', '"un long "', '"message"'].join('\n');
	assert.deepEqual(parsePo('fr', po).messages, { 'a long message': 'un long message' });
});

test('PO escapes are unescaped, and an unknown escape keeps its character', () => {
	const po = ['msgid "two\\nlines"', 'msgstr "quote:\\" tab:\\t done"'].join('\n');
	assert.deepEqual(parsePo('en', po).messages, { 'two\nlines': 'quote:" tab:\t done' });

	const unknown = ['msgid "x"', 'msgstr "100\\% sure"'].join('\n');
	assert.deepEqual(parsePo('en', unknown).messages, { x: '100% sure' });
});

test('comments, references and flags are ignored', () => {
	const po = [
		'# translator comment',
		'#. extracted comment',
		'#: src/file.ts:12',
		'#, fuzzy',
		'msgid "key"',
		'msgstr "value"',
	].join('\n');
	assert.deepEqual(parsePo('en', po).messages, { key: 'value' });
});

test('msgctxt keys a message the way gettext does, with an EOT separator', () => {
	const po = ['msgctxt "menu"', 'msgid "Open"', 'msgstr "Ouvrir"'].join('\n');
	assert.deepEqual(parsePo('fr', po).messages, { 'menu\u0004Open': 'Ouvrir' });
});

test('an untranslated entry is left out so the base language can win', () => {
	const po = ['msgid "done"', 'msgstr "fait"', '', 'msgid "later"', 'msgstr ""'].join('\n');
	assert.deepEqual(parsePo('fr', po).messages, { done: 'fait' });
});

test('a new msgid without a blank line still closes the previous entry', () => {
	const po = ['msgid "a"', 'msgstr "un"', 'msgid "b"', 'msgstr "deux"'].join('\n');
	assert.deepEqual(parsePo('fr', po).messages, { a: 'un', b: 'deux' });
});

test('plural forms map onto the locale CLDR categories, in order', () => {
	const categories = new Intl.PluralRules('ar').resolvedOptions().pluralCategories;
	const po = [
		'msgid "apples"',
		'msgid_plural "{n} apples"',
		...categories.map((_, index) => `msgstr[${index}] "form${index}"`),
	].join('\n');

	const catalog = parsePo('ar', po);
	assert.deepEqual(
		catalog.messages.apples,
		Object.fromEntries(categories.map((category, index) => [category, `form${index}`])),
	);
});

test('t() selects the parsed plural form by count through Intl.PluralRules', () => {
	const categories = new Intl.PluralRules('ar').resolvedOptions().pluralCategories;
	const po = [
		'msgid "apples"',
		'msgid_plural "apples"',
		...categories.map((_, index) => `msgstr[${index}] "form${index}"`),
	].join('\n');

	setActive(parsePo('ar', po));
	try {
		for (const count of [0, 1, 2, 3, 11, 100]) {
			const expected = `form${categories.indexOf(new Intl.PluralRules('ar').select(count))}`;
			assert.equal(tRaw('apples', { count }), expected, `count ${count}`);
		}
	} finally {
		reset();
	}
});

test('a catalog with more plural forms than its locale declares throws', () => {
	const po = ['msgid "x"', 'msgid_plural "xs"', 'msgstr[0] "one"', 'msgstr[1] "other"', 'msgstr[2] "too many"'].join(
		'\n',
	);
	assert.throws(() => parsePo('en', po), /plural form 2/);
});

test('a plural entry with no msgstr[N] forms throws', () => {
	const po = ['msgid "x"', 'msgid_plural "xs"', 'msgstr "only one"'].join('\n');
	assert.throws(() => parsePo('en', po), /no msgstr\[N\]/);
});

test('a duplicate msgid throws rather than silently overwriting', () => {
	const po = ['msgid "a"', 'msgstr "one"', '', 'msgid "a"', 'msgstr "two"'].join('\n');
	assert.throws(() => parsePo('en', po), /Duplicate PO message/);
});

test('a translation with no msgid throws', () => {
	assert.throws(() => parsePo('en', 'msgstr "orphan"'), /no msgid/);
});

test('an unrecognised line throws with its number', () => {
	assert.throws(() => parsePo('en', ['msgid "a"', 'msgstr "b"', 'not po at all'].join('\n')), /line 3/);
});

test('a non-default gettext domain prefixes catalog keys', () => {
	const po = ['msgid "sword"', 'msgstr "Schwert"'].join('\n');
	assert.deepEqual(parsePo('de', po, { domain: 'units' }).messages, { 'units:sword': 'Schwert' });
	assert.deepEqual(parsePo('de', po).messages, { sword: 'Schwert' }, 'the default domain stays bare');
});

test('direction is inferred from the locale and can be overridden', () => {
	assert.equal(parsePo('he', ['msgid "a"', 'msgstr "b"'].join('\n')).direction, 'rtl');
	assert.equal(parsePo('en', ['msgid "a"', 'msgstr "b"'].join('\n')).direction, 'ltr');
	assert.equal(parsePo('he', ['msgid "a"', 'msgstr "b"'].join('\n'), { direction: 'ltr' }).direction, 'ltr');
});
