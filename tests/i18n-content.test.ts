import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	messageText,
	levenshteinDistance,
	findSimilarMessages,
	catalogUsage,
	catalogCompleteness,
	pluralFormCoverage,
	mergeCatalogKeys,
	type Catalog,
} from '../src/i18n/index.ts';

function catalog(messages: Catalog['messages']): Catalog {
	return { locale: 'en', direction: 'ltr', messages };
}

// ------------------------------------------------------------------- messageText

test('messageText returns a plain string as-is', () => {
	assert.equal(messageText('Hello'), 'Hello');
});

test('messageText reduces plural forms to "other", or the first form when "other" is absent', () => {
	assert.equal(messageText({ one: '1 item', other: '{count} items' }), '{count} items');
	assert.equal(messageText({ one: '1 item' }), '1 item');
});

test('messageText formats a FluentMessage with no params, and swallows a throw as empty text', () => {
	assert.equal(messageText({ format: () => 'formatted' }), 'formatted');
	assert.equal(
		messageText({
			format: () => {
				throw new Error('needs a param');
			},
		}),
		''
	);
});

// ------------------------------------------------------------------- levenshteinDistance

test('levenshteinDistance is 0 for identical strings, including both empty', () => {
	assert.equal(levenshteinDistance('same', 'same'), 0);
	assert.equal(levenshteinDistance('', ''), 0);
});

test('levenshteinDistance against an empty string is the other string\'s length', () => {
	assert.equal(levenshteinDistance('', 'abc'), 3);
	assert.equal(levenshteinDistance('abc', ''), 3);
});

test('levenshteinDistance matches the textbook kitten/sitting example', () => {
	assert.equal(levenshteinDistance('kitten', 'sitting'), 3);
});

test('levenshteinDistance is symmetric', () => {
	assert.equal(levenshteinDistance('flaw', 'lawn'), levenshteinDistance('lawn', 'flaw'));
});

// ------------------------------------------------------------------- findSimilarMessages

test('finds an exact-duplicate pair at similarity 1', () => {
	const cat = catalog({ 'confirm.quit': 'Are you sure?', 'confirm.delete': 'Are you sure?' });
	const pairs = findSimilarMessages(cat);
	assert.equal(pairs.length, 1);
	assert.deepEqual([pairs[0].a, pairs[0].b].sort(), ['confirm.delete', 'confirm.quit']);
	assert.equal(pairs[0].distance, 0);
	assert.equal(pairs[0].similarity, 1);
});

test('excludes pairs below the similarity threshold', () => {
	const cat = catalog({ a: 'Are you sure?', b: 'Completely unrelated text here' });
	assert.deepEqual(findSimilarMessages(cat), []);
});

test('a lower minSimilarity surfaces looser near-duplicates that the default threshold would miss', () => {
	const cat = catalog({ a: 'Save game', b: 'Save games' }); // 1-char edit over an 11-char string: similarity ~0.909
	assert.deepEqual(findSimilarMessages(cat, 0.95), []);
	assert.equal(findSimilarMessages(cat, 0.9).length, 1);
});

test('skips empty messages entirely, never pairing two blanks as "identical"', () => {
	const cat = catalog({ a: '', b: '' });
	assert.deepEqual(findSimilarMessages(cat), []);
});

test('sorts pairs most similar first', () => {
	const cat = catalog({
		a: 'Are you sure?',
		b: 'Are you sure!',
		c: 'Something else',
		d: 'Are you sure?',
	});
	const pairs = findSimilarMessages(cat, 0.5);
	for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i - 1].similarity >= pairs[i].similarity);
});

// ------------------------------------------------------------------- catalogUsage

test('reports total, used and unused keys against a referenced-keys list', () => {
	const cat = catalog({ greeting: 'Hi', farewell: 'Bye', unused: 'never shown' });
	const stats = catalogUsage(cat, ['greeting', 'farewell']);
	assert.equal(stats.totalKeys, 3);
	assert.equal(stats.usedKeys, 2);
	assert.deepEqual(stats.unusedKeys, ['unused']);
});

test('every key referenced leaves unusedKeys empty', () => {
	const cat = catalog({ a: '1', b: '2' });
	const stats = catalogUsage(cat, ['a', 'b']);
	assert.deepEqual(stats.unusedKeys, []);
	assert.equal(stats.usedKeys, 2);
});

// ------------------------------------------------------------------- catalogCompleteness

test('a fully-translated catalog is 1.0 complete', () => {
	const en = catalog({ a: '1', b: '2' });
	const fr = catalog({ a: '1', b: '2' });
	assert.equal(catalogCompleteness(en, fr), 1);
});

test('completeness is the fraction of reference keys present in other', () => {
	const en = catalog({ a: '1', b: '2', c: '3', d: '4' });
	const fr = catalog({ a: '1', b: '2' });
	assert.equal(catalogCompleteness(en, fr), 0.5);
});

test('an empty reference catalog is trivially 1.0 complete', () => {
	const en = catalog({});
	const fr = catalog({ a: '1' });
	assert.equal(catalogCompleteness(en, fr), 1);
});

// ------------------------------------------------------------------- pluralFormCoverage

test('counts only plural-form keys, ignoring plain strings and Fluent messages', () => {
	const cat = catalog({
		items: { one: '{count} item', other: '{count} items' },
		greeting: 'Hi',
		fluent: { format: () => 'x' },
	});
	const coverage = pluralFormCoverage(cat);
	assert.equal(coverage.pluralKeys, 1);
	assert.deepEqual(coverage.formsPresent, { one: 1, other: 1 });
});

test('tallies category coverage across several plural keys', () => {
	const cat = catalog({
		items: { one: 'a', other: 'b' },
		coins: { other: 'c' },
	});
	const coverage = pluralFormCoverage(cat);
	assert.equal(coverage.pluralKeys, 2);
	assert.deepEqual(coverage.formsPresent, { one: 1, other: 2 });
});

test('a catalog with no plural forms reports zero coverage', () => {
	const cat = catalog({ greeting: 'Hi' });
	assert.deepEqual(pluralFormCoverage(cat), { pluralKeys: 0, formsPresent: {} });
});

// ------------------------------------------------------------------- mergeCatalogKeys

test('drops the merged key, keeping the surviving key and its text untouched', () => {
	const cat = catalog({ 'confirm.quit': 'Are you sure?', 'confirm.delete': 'Are you sure?' });
	const merged = mergeCatalogKeys(cat, 'confirm.quit', 'confirm.delete');
	assert.deepEqual(Object.keys(merged.messages), ['confirm.quit']);
	assert.equal(merged.messages['confirm.quit'], 'Are you sure?');
});

test('does not mutate the original catalog', () => {
	const cat = catalog({ a: '1', b: '2' });
	mergeCatalogKeys(cat, 'a', 'b');
	assert.deepEqual(Object.keys(cat.messages), ['a', 'b']);
});

test('throws when either key is not actually in the catalog', () => {
	const cat = catalog({ a: '1', b: '2' });
	assert.throws(() => mergeCatalogKeys(cat, 'a', 'missing'));
	assert.throws(() => mergeCatalogKeys(cat, 'missing', 'a'));
});

test('throws when asked to merge a key into itself', () => {
	const cat = catalog({ a: '1' });
	assert.throws(() => mergeCatalogKeys(cat, 'a', 'a'));
});
