import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFTL, reset, setBase, t } from '../src/i18n/index.ts';

test('parseFTL feeds simple messages and typed-looking variables into t()', () => {
	reset();
	setBase(parseFTL('en', 'welcome = Welcome, { $name }!'));
	assert.equal(t('welcome', { name: 'Ada' }), 'Welcome, Ada!');
});

test('parseFTL resolves exact and plural variants with locale rules', () => {
	reset();
	setBase(parseFTL('fr', `items = { $count ->
    [one] { $count } objet
   *[other] { $count } objets
}`));
	assert.equal(t('items', { count: 1 }), '1 objet');
	assert.equal(t('items', { count: 2 }), '2 objets');
});

test('parseFTL resolves a select expression whose opening brace starts on its own indented line', () => {
	reset();
	setBase(parseFTL('en', `items =
    { $count ->
        [one] { $count } item
       *[other] { $count } items
    }`));
	assert.equal(t('items', { count: 1 }), '1 item');
	assert.equal(t('items', { count: 5 }), '5 items');
});

test('parseFTL validates select delimiters and default variants', () => {
	assert.throws(() => parseFTL('en', `items = { $count ->
   *[other] items`), /not closed/);
	assert.throws(() => parseFTL('en', `items = { $count ->
    [other] items
}`), /exactly one default/);
});
