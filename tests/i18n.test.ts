import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reset, setBase, setActive, t, has, direction, locale, typographic } from '../src/i18n/index.ts';

test('active language wins over base when both have the key', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { greeting: 'Hello' } });
	setActive({ locale: 'fr', direction: 'ltr', messages: { greeting: 'Bonjour' } });
	assert.equal(t('greeting'), 'Bonjour');
	reset();
});

test('a key missing from the active language falls back to the base language', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { farewell: 'Goodbye' } });
	setActive({ locale: 'fr', direction: 'ltr', messages: { greeting: 'Bonjour' } });
	assert.equal(t('farewell'), 'Goodbye');
	reset();
});

test('a key missing from both languages returns the key itself', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: {} });
	assert.equal(t('nowhere'), 'nowhere');
	reset();
});

test('has() reports whether a key resolves in either language', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { greeting: 'Hello' } });
	assert.equal(has('greeting'), true);
	assert.equal(has('nowhere'), false);
	reset();
});

test('{token} placeholders interpolate from params, leaving unmatched tokens untouched', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { welcome: 'Hi {name}, you have {count} items and {missing}.' } });
	assert.equal(t('welcome', { name: 'Ada', count: 3 }), 'Hi Ada, you have 3 items and {missing}.');
	reset();
});

test('plural forms are selected through Intl.PluralRules, falling back to "other"', () => {
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: { items: { one: '{count} item', other: '{count} items' } },
	});
	assert.equal(t('items', { count: 1 }), '1 item');
	assert.equal(t('items', { count: 5 }), '5 items');
	reset();
});

test('a plural message with no count falls back to "other", then to any form', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { items: { one: '{count} item', other: '{count} items' } } });
	assert.equal(t('items'), '{count} items');
	setBase({ locale: 'en', direction: 'ltr', messages: { items: { few: 'a few' } } });
	assert.equal(t('items'), 'a few');
	reset();
});

test('direction() and locale() fall back from active to base, and default when neither is set', () => {
	assert.equal(locale(), 'en');
	assert.equal(direction(), 'ltr');
	setBase({ locale: 'ar', direction: 'rtl', messages: {} });
	assert.equal(locale(), 'ar');
	assert.equal(direction(), 'rtl');
	setActive({ locale: 'he', direction: 'rtl', messages: {} });
	assert.equal(locale(), 'he');
	reset();
});

test('typographic apostrophes apply to French, Italian, and Dutch elisions', () => {
	assert.equal(typographic("aujourd'hui dell'anno z'n", 'fr-FR'), 'aujourd’hui dell’anno z’n');
	assert.equal(typographic("today's text", 'en'), "today's text");
});

test('translation applies typography after interpolation and allows opting out', () => {
	setBase({ locale: 'fr', direction: 'ltr', messages: { greeting: "Bonjour, {name}! Aujourd'hui." } });
	assert.equal(t('greeting', { name: "l'ami" }), 'Bonjour, l’ami! Aujourd’hui.');
	setActive({ locale: 'fr', direction: 'ltr', typography: false, messages: { greeting: "Salut, {name}!" } });
	assert.equal(t('greeting', { name: "l'ami" }), "Salut, l'ami!");
	reset();
});
