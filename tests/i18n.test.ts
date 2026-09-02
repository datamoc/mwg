import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setBase, setActive, reset, t, has, locale, direction } from '../src/i18n/index.ts';

/**
 * Message resolution, tested without a renderer: plural selection and interpolation are
 * pure functions of a catalog, and the direction/fallback rules are the interesting part.
 */

test('resolves a plain key from the base language', () => {
	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: { hello: 'Hello!' } });

	assert.equal(t('hello'), 'Hello!');
});

test('the active language wins over the base one', () => {
	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: { hello: 'Hello!' } });
	setActive({ locale: 'fr', direction: 'ltr', messages: { hello: 'Bonjour !' } });

	assert.equal(t('hello'), 'Bonjour !');
});

test('a key missing from the active language falls back to the base one', () => {
	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: { hello: 'Hello!', bye: 'Bye!' } });
	//"bye" was never translated into fr
	setActive({ locale: 'fr', direction: 'ltr', messages: { hello: 'Bonjour !' } });

	assert.equal(t('bye'), 'Bye!');
});

test('a key missing everywhere returns itself, never blank', () => {
	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: {} });

	assert.equal(t('nonexistent'), 'nonexistent');
	assert.equal(has('nonexistent'), false);
});

test('interpolates {token} placeholders from params', () => {
	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: { greet: 'Hello, {name}!' } });

	assert.equal(t('greet', { name: 'Ren' }), 'Hello, Ren!');
});

test('an unmatched token is left as-is rather than removed', () => {
	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: { greet: 'Hello, {name}!' } });

	assert.equal(t('greet', { count: 1 }), 'Hello, {name}!');
});

test('picks the plural form via the active language CLDR rule', () => {
	reset();
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: { items: { one: '{count} item', other: '{count} items' } },
	});

	assert.equal(t('items', { count: 1 }), '1 item');
	assert.equal(t('items', { count: 5 }), '5 items');
});

test('a plural rule not covered by the message falls back to "other"', () => {
	reset();
	//French has its own plural rule for 0 and 1 ("one"), and nothing else for "few" etc.
	setBase({
		locale: 'fr',
		direction: 'ltr',
		messages: { items: { other: '{count} articles' } },
	});

	assert.equal(t('items', { count: 1 }), '1 articles');
});

test('direction follows the active language, falling back to the base one', () => {
	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: {} });
	assert.equal(direction(), 'ltr');
	assert.equal(locale(), 'en');

	setActive({ locale: 'ar', direction: 'rtl', messages: {} });
	assert.equal(direction(), 'rtl');
	assert.equal(locale(), 'ar');

	setActive(null);
	assert.equal(direction(), 'ltr');
	assert.equal(locale(), 'en');
});
