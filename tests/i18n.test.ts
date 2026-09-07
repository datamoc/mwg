import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reset, setBase, setActive, t, has, direction, locale, typographic, createCatalogFormatter, formatNumber, formatDate, formatList, diffCatalogKeys, validateCatalog, type SemanticMessage, type Catalog } from '../src/i18n/index.ts';

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

// ----------------------------------------------------- SemanticMessage / createCatalogFormatter

const damage: SemanticMessage = { type: 'combat.damage', params: { target: 'gnoll', amount: 7 } };

test('the same message and locale format to the same result every time', () => {
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: { 'combat.damage.log': 'The {target} takes {amount} damage.' },
	});
	const formatter = createCatalogFormatter();
	assert.equal(formatter.format(damage, 'log'), formatter.format(damage, 'log'));
	reset();
});

test('one message renders differently per channel, from distinct catalog entries', () => {
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: {
			'combat.damage.log': 'The {target} takes {amount} damage.',
			'combat.damage.compact': '-{amount} HP',
			'combat.damage.accessibility': '{target} attack. {amount} damage.',
			'combat.damage': 'combat.damage({target}, {amount})', //fallback for the debug channel
		},
	});
	const formatter = createCatalogFormatter();

	const rendered = {
		log: formatter.format(damage, 'log'),
		compact: formatter.format(damage, 'compact'),
		accessibility: formatter.format(damage, 'accessibility'),
		debug: formatter.format(damage, 'debug'),
	};

	assert.equal(rendered.log, 'The gnoll takes 7 damage.');
	assert.equal(rendered.compact, '-7 HP');
	assert.equal(rendered.accessibility, 'gnoll attack. 7 damage.');
	assert.equal(rendered.debug, 'combat.damage(gnoll, 7)');
	assert.equal(new Set(Object.values(rendered)).size, 4, 'all four channels should differ');
	assert.deepEqual(damage.params, { target: 'gnoll', amount: 7 }, 'formatting must not mutate the message');
	reset();
});

test('a channel missing its own key falls back to the bare type; missing both is observable', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { 'combat.damage': 'combat.damage generic' } });
	const formatter = createCatalogFormatter();

	assert.equal(formatter.format(damage, 'debug'), 'combat.damage generic');

	reset();
	setBase({ locale: 'en', direction: 'ltr', messages: {} });
	assert.equal(formatter.format(damage, 'log'), 'combat.damage', 'no catalog entry at all: the type key itself, like t()');
	reset();
});

test('plural/select through the formatter works the same as through t(), across locales', () => {
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: { 'loot.found.log': { one: 'You found {count} coin.', other: 'You found {count} coins.' } },
	});
	const enFormatter = createCatalogFormatter();
	assert.equal(enFormatter.format({ type: 'loot.found', params: { count: 1 } }, 'log'), 'You found 1 coin.');
	assert.equal(enFormatter.format({ type: 'loot.found', params: { count: 3 } }, 'log'), 'You found 3 coins.');
	reset();

	setActive({
		locale: 'fr',
		direction: 'ltr',
		messages: { 'loot.found.log': { one: 'Vous trouvez {count} pièce.', other: 'Vous trouvez {count} pièces.' } },
	});
	const frFormatter = createCatalogFormatter();
	assert.equal(frFormatter.format({ type: 'loot.found', params: { count: 1 } }, 'log'), 'Vous trouvez 1 pièce.');
	assert.equal(frFormatter.format({ type: 'loot.found', params: { count: 5 } }, 'log'), 'Vous trouvez 5 pièces.');
	reset();
});

// --------------------------------------------------- formatNumber/formatDate/formatList

//compared against Intl directly, rather than a hardcoded formatted string: the exact
//separators (a narrow no-break space in French grouping, say) are ICU data, not this
//project's contract, and differ across Node/ICU versions in ways ours must simply track
test('formatNumber uses the active locale\'s grouping and decimal conventions', () => {
	setBase({ locale: 'en-US', direction: 'ltr', messages: {} });
	assert.equal(formatNumber(1234.5), new Intl.NumberFormat('en-US').format(1234.5));
	try {
		setActive({ locale: 'fr-FR', direction: 'ltr', messages: {} });
		assert.equal(formatNumber(1234.5), new Intl.NumberFormat('fr-FR').format(1234.5));
	} finally {
		reset();
	}
});

test('formatNumber accepts Intl.NumberFormatOptions the same way Intl.NumberFormat does', () => {
	setBase({ locale: 'en-US', direction: 'ltr', messages: {} });
	assert.equal(formatNumber(0.5, { style: 'percent' }), new Intl.NumberFormat('en-US', { style: 'percent' }).format(0.5));
	reset();
});

test('formatList joins with the active locale\'s own conjunction', () => {
	setBase({ locale: 'en-US', direction: 'ltr', messages: {} });
	assert.equal(formatList(['a sword', 'a shield']), new Intl.ListFormat('en-US').format(['a sword', 'a shield']));
	try {
		setActive({ locale: 'fr-FR', direction: 'ltr', messages: {} });
		const items = ['une épée', 'un bouclier'];
		assert.equal(formatList(items), new Intl.ListFormat('fr-FR').format(items));
	} finally {
		reset();
	}
});

test('formatDate renders through the active locale, options passed straight through', () => {
	setBase({ locale: 'en-US', direction: 'ltr', messages: {} });
	const date = new Date(Date.UTC(2024, 0, 15));
	const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
	assert.equal(formatDate(date, options), new Intl.DateTimeFormat('en-US', options).format(date));
	reset();
});

test('with no locale set, formatting falls back to the default locale rather than throwing', () => {
	assert.doesNotThrow(() => formatNumber(42));
	assert.doesNotThrow(() => formatList(['a', 'b']));
});

// ---------------------------------------------------------- diffCatalogKeys/validateCatalog

test('diffCatalogKeys reports keys missing from, and extra in, a translation', () => {
	const en: Catalog = { locale: 'en', direction: 'ltr', messages: { greeting: 'Hello', farewell: 'Bye' } };
	const fr: Catalog = { locale: 'fr', direction: 'ltr', messages: { greeting: 'Bonjour', extra: 'oops' } };

	assert.deepEqual(diffCatalogKeys(en, fr), { missing: ['farewell'], extra: ['extra'] });
});

test('diffCatalogKeys reports nothing for two catalogs with identical key sets', () => {
	const a: Catalog = { locale: 'en', direction: 'ltr', messages: { greeting: 'Hi' } };
	const b: Catalog = { locale: 'fr', direction: 'ltr', messages: { greeting: 'Salut' } };

	assert.deepEqual(diffCatalogKeys(a, b), { missing: [], extra: [] });
});

test('validateCatalog flags an empty message string', () => {
	const catalog: Catalog = { locale: 'en', direction: 'ltr', messages: { empty: '', fine: 'ok' } };
	const issues = validateCatalog(catalog);
	assert.deepEqual(issues, [{ key: 'empty', kind: 'empty-message', detail: 'message resolves to an empty string' }]);
});

test('validateCatalog flags plural forms with no "other" branch', () => {
	const catalog: Catalog = { locale: 'en', direction: 'ltr', messages: { broken: { few: 'a few' } } };
	const issues = validateCatalog(catalog);
	assert.deepEqual(issues, [{ key: 'broken', kind: 'plural-missing-other', detail: 'plural forms have no "other" branch' }]);
});

test('validateCatalog is clean for a catalog with no structural problems', () => {
	const catalog: Catalog = {
		locale: 'en',
		direction: 'ltr',
		messages: { greeting: 'Hello', items: { one: '{count} item', other: '{count} items' } },
	};
	assert.deepEqual(validateCatalog(catalog), []);
});
