import type { Catalog, MessageValue } from './index.ts';
import { diffCatalogKeys } from './Validate.ts';

/**
 * A catalog message reduced to plain, comparable text: a string as-is, a `PluralForms`
 * reduced to its `other` branch (or the first form present, the same fallback
 * `resolvePlural` itself uses with no count), and a `FluentMessage` formatted with no
 * params - best-effort, since a `.ftl` message needing a required variable throws rather
 * than resolving; that failure reads as empty text here rather than aborting the caller's
 * whole scan.
 *
 * @example
 * ```ts
 * import { messageText } from '@datamoc/mw_games/i18n';
 *
 * messageText('Hello'); // 'Hello'
 * messageText({ one: '1 item', other: '{count} items' }); // '{count} items'
 * ```
 */
export function messageText(value: MessageValue): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value !== null && 'format' in value) {
		try {
			return value.format();
		} catch {
			return '';
		}
	}
	const forms = value as Record<string, string>;
	return forms.other ?? Object.values(forms)[0] ?? '';
}

/**
 * The classic edit distance: how many single-character insertions, deletions or
 * substitutions turn `a` into `b`. The primitive `findSimilarMessages` is built on, exposed
 * on its own since "how different are these two strings" is useful wherever a catalog's own
 * message text is not the only thing worth comparing.
 *
 * @example
 * ```ts
 * import { levenshteinDistance } from '@datamoc/mw_games/i18n';
 *
 * levenshteinDistance('kitten', 'sitting'); // 3
 * levenshteinDistance('same', 'same'); // 0
 * ```
 */
export function levenshteinDistance(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
	let current = new Array<number>(b.length + 1);

	for (let i = 1; i <= a.length; i++) {
		current[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			current[j] = Math.min(
				previous[j] + 1, //deletion
				current[j - 1] + 1, //insertion
				previous[j - 1] + cost, //substitution
			);
		}
		[previous, current] = [current, previous];
	}

	return previous[b.length];
}

export interface SimilarMessagePair {
	a: string;
	b: string;
	distance: number;
	/** 1 minus the distance normalised by the longer message's length; 1 is identical text */
	similarity: number;
}

/**
 * Every pair of keys in `catalog` whose message text is at least `minSimilarity` alike
 * (default 0.8), surfaced for a human to decide whether they are genuinely the same message
 * translated three separate times - `mwg` finds the candidates, never merges anything on
 * its own. Empty messages are skipped (nothing to compare), and pairs are sorted most
 * similar first.
 *
 * @example
 * ```ts
 * import { findSimilarMessages } from '@datamoc/mw_games/i18n';
 *
 * const catalog = {
 *   locale: 'en', direction: 'ltr' as const,
 *   messages: { 'confirm.quit': 'Are you sure?', 'confirm.delete': 'Are you sure?' },
 * };
 *
 * findSimilarMessages(catalog); // [{ a: 'confirm.quit', b: 'confirm.delete', distance: 0, similarity: 1 }]
 * ```
 */
export function findSimilarMessages(catalog: Catalog, minSimilarity = 0.8): SimilarMessagePair[] {
	const entries = Object.entries(catalog.messages)
		.map(([key, value]) => [key, messageText(value)] as const)
		.filter(([, text]) => text.length > 0);

	const pairs: SimilarMessagePair[] = [];
	for (let i = 0; i < entries.length; i++) {
		for (let j = i + 1; j < entries.length; j++) {
			const [keyA, textA] = entries[i];
			const [keyB, textB] = entries[j];
			const maxLen = Math.max(textA.length, textB.length);
			const distance = levenshteinDistance(textA, textB);
			const similarity = maxLen === 0 ? 1 : 1 - distance / maxLen;
			if (similarity >= minSimilarity) pairs.push({ a: keyA, b: keyB, distance, similarity });
		}
	}

	return pairs.sort((x, y) => y.similarity - x.similarity);
}

export interface CatalogUsageStats {
	totalKeys: number;
	usedKeys: number;
	/** present in the catalog but absent from `referencedKeys` - a candidate for deletion */
	unusedKeys: readonly string[];
}

/**
 * Which of a catalog's keys a game's own source actually references, and which just sit
 * there. `mwg` has no idea how a game's code names a message key (a string literal, a
 * generated constant, a `SemanticMessage.type`) - `referencedKeys` is however the caller
 * already found that out (typically a grep or a build-time scan over its own source), the
 * same boundary `rollRoster` draws around a game's own roster values.
 *
 * @example
 * ```ts
 * import { catalogUsage } from '@datamoc/mw_games/i18n';
 *
 * const catalog = {
 *   locale: 'en', direction: 'ltr' as const,
 *   messages: { greeting: 'Hi', unused: 'never shown' },
 * };
 *
 * catalogUsage(catalog, ['greeting']); // { totalKeys: 2, usedKeys: 1, unusedKeys: ['unused'] }
 * ```
 */
export function catalogUsage(catalog: Catalog, referencedKeys: Iterable<string>): CatalogUsageStats {
	const referenced = new Set(referencedKeys);
	const keys = Object.keys(catalog.messages);
	const unusedKeys = keys.filter((key) => !referenced.has(key));
	return { totalKeys: keys.length, usedKeys: keys.length - unusedKeys.length, unusedKeys };
}

/**
 * How complete `other` is against `reference`, as a 0-1 fraction of `reference`'s own keys
 * that `other` also has - built on `diffCatalogKeys` rather than recomputing the same set
 * difference, so the two never disagree about what "missing" means.
 *
 * @example
 * ```ts
 * import { catalogCompleteness } from '@datamoc/mw_games/i18n';
 *
 * const en = { locale: 'en', direction: 'ltr' as const, messages: { a: '1', b: '2' } };
 * const fr = { locale: 'fr', direction: 'ltr' as const, messages: { a: '1' } };
 *
 * catalogCompleteness(en, fr); // 0.5
 * ```
 */
export function catalogCompleteness(reference: Catalog, other: Catalog): number {
	const referenceKeys = Object.keys(reference.messages);
	if (referenceKeys.length === 0) return 1;

	const { missing } = diffCatalogKeys(reference, other);
	return (referenceKeys.length - missing.length) / referenceKeys.length;
}

export interface PluralCoverage {
	/** how many keys in the catalog are plural forms at all, rather than a plain string or a Fluent message */
	pluralKeys: number;
	/** how many plural-form keys define each CLDR category, `'other'` included */
	formsPresent: Partial<Record<Intl.LDMLPluralRule, number>>;
}

/**
 * How many of a catalog's plural-form messages define each CLDR category - `'few'`/`'many'`
 * sitting at 0 while `'other'` covers every key is exactly the gap a language needing those
 * categories (Polish, Arabic) would otherwise only discover once a player hit the wrong count.
 *
 * @example
 * ```ts
 * import { pluralFormCoverage } from '@datamoc/mw_games/i18n';
 *
 * const catalog = {
 *   locale: 'en', direction: 'ltr' as const,
 *   messages: { items: { one: '{count} item', other: '{count} items' } },
 * };
 *
 * pluralFormCoverage(catalog); // { pluralKeys: 1, formsPresent: { one: 1, other: 1 } }
 * ```
 */
export function pluralFormCoverage(catalog: Catalog): PluralCoverage {
	const formsPresent: Partial<Record<Intl.LDMLPluralRule, number>> = {};
	let pluralKeys = 0;

	for (const value of Object.values(catalog.messages)) {
		if (typeof value === 'string' || (typeof value === 'object' && value !== null && 'format' in value)) continue;
		pluralKeys++;
		for (const category of Object.keys(value) as Intl.LDMLPluralRule[]) {
			formsPresent[category] = (formsPresent[category] ?? 0) + 1;
		}
	}

	return { pluralKeys, formsPresent };
}

/**
 * Drops `mergedKey` from `catalog`, keeping `survivingKey` (and its current text) exactly as
 * it was - the mechanical half of collapsing two keys a human decided are the same message.
 * Apply this to every language's own catalog to merge consistently across all of them.
 *
 * Rewriting whichever call sites used `mergedKey` is deliberately not this function's job:
 * `mwg` has no view into a game's own source tree, the same boundary `catalogUsage`'s
 * `referencedKeys` already draws - a caller doing that rewrite already knows exactly where
 * `mergedKey` is used, since it had to find `referencedKeys` the same way to begin with.
 *
 * @example
 * ```ts
 * import { mergeCatalogKeys } from '@datamoc/mw_games/i18n';
 *
 * const catalog = {
 *   locale: 'en', direction: 'ltr' as const,
 *   messages: { 'confirm.quit': 'Are you sure?', 'confirm.delete': 'Are you sure?' },
 * };
 *
 * const merged = mergeCatalogKeys(catalog, 'confirm.quit', 'confirm.delete');
 * console.log(Object.keys(merged.messages)); // ['confirm.quit']
 * ```
 */
export function mergeCatalogKeys(catalog: Catalog, survivingKey: string, mergedKey: string): Catalog {
	if (!(survivingKey in catalog.messages)) {
		throw new Error(`mergeCatalogKeys: "${survivingKey}" is not a key in this catalog`);
	}
	if (!(mergedKey in catalog.messages)) {
		throw new Error(`mergeCatalogKeys: "${mergedKey}" is not a key in this catalog`);
	}
	if (survivingKey === mergedKey) {
		throw new Error('mergeCatalogKeys: survivingKey and mergedKey must be different keys');
	}

	const messages = { ...catalog.messages };
	delete messages[mergedKey];
	return { ...catalog, messages };
}
