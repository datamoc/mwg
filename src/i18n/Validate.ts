import type { Catalog, MessageValue } from './index.ts';

/** the keys two catalogs disagree on - what a translation catalog missing a key, or one
 * abandoned key nobody removed, looks like structurally. */
export interface CatalogKeyDiff {
	/** in `reference` but not `other` - an untranslated key */
	missing: readonly string[];
	/** in `other` but not `reference` - a stale or misspelled key */
	extra: readonly string[];
}

/**
 * Compares two catalogs' key sets - typically a base language against a translation, so a
 * missing or stray key is caught before a player sees a raw key fall through `t()`'s own
 * fallback, rather than after.
 *
 * @example
 * ```ts
 * import { diffCatalogKeys } from '@datamoc/mw_games/i18n';
 *
 * const en = { locale: 'en', direction: 'ltr' as const, messages: { greeting: 'Hello', farewell: 'Bye' } };
 * const fr = { locale: 'fr', direction: 'ltr' as const, messages: { greeting: 'Bonjour', extra: 'oops' } };
 *
 * console.log(diffCatalogKeys(en, fr)); // { missing: ['farewell'], extra: ['extra'] }
 * ```
 */
export function diffCatalogKeys(reference: Catalog, other: Catalog): CatalogKeyDiff {
	const referenceKeys = new Set(Object.keys(reference.messages));
	const otherKeys = new Set(Object.keys(other.messages));
	return {
		missing: [...referenceKeys].filter((key) => !otherKeys.has(key)),
		extra: [...otherKeys].filter((key) => !referenceKeys.has(key)),
	};
}

export interface CatalogIssue {
	key: string;
	kind: 'empty-message' | 'plural-missing-other';
	detail: string;
}

/**
 * Structural problems inside one catalog, independent of any other: an empty string, or a
 * plural form with no `other` branch - `Intl.PluralRules` guarantees `other` is always a
 * valid category for every locale, so a form set lacking it will silently degrade for any
 * count the more specific branches don't cover (`t()`'s own `resolvePlural` falls back to
 * *any* form present, which hides exactly this mistake instead of surfacing it).
 *
 * This is deliberately not a parameter schema validator: `SemanticMessage<TType, TParams>`
 * already gives a game compile-time checking of which params a message needs, which the
 * source document calls the primary mechanism - a runtime schema on top would duplicate that
 * for no case a game's own types do not already catch.
 *
 * @example
 * ```ts
 * import { validateCatalog } from '@datamoc/mw_games/i18n';
 *
 * const catalog = {
 *   locale: 'en', direction: 'ltr' as const,
 *   messages: { empty: '', broken: { few: 'a few' } },
 * };
 *
 * console.log(validateCatalog(catalog).map((issue) => issue.key)); // ['empty', 'broken']
 * ```
 */
export function validateCatalog(catalog: Catalog): CatalogIssue[] {
	const issues: CatalogIssue[] = [];

	for (const [key, value] of Object.entries(catalog.messages)) {
		if (typeof value === 'string') {
			if (value === '')
				issues.push({ key, kind: 'empty-message', detail: 'message resolves to an empty string' });
			continue;
		}
		if (isPluralForms(value) && value.other === undefined) {
			issues.push({ key, kind: 'plural-missing-other', detail: 'plural forms have no "other" branch' });
		}
	}

	return issues;
}

function isPluralForms(value: MessageValue): value is Exclude<MessageValue, string> & Record<string, string> {
	return typeof value === 'object' && value !== null && !('format' in value);
}

export interface AudioIssue {
	/** the full `<type>.audio` key */
	key: string;
	kind: 'empty-audio-path' | 'audio-not-a-path';
	detail: string;
}

/**
 * Structural problems in a catalog's sound cues: an `<type>.audio` entry holding an
 * empty string (the formatter already reads that as "no sound", so it is dead weight),
 * or holding plural forms/a select message instead of a plain path. A sound path is data
 * a game hands to `mwg/audio`'s `Sound`, not grammar - count- or variant-dependent paths
 * would silently reduce to one branch at lookup time rather than selecting one per play.
 *
 * @example
 * ```ts
 * import { validateMessageAudio } from '@datamoc/mw_games/i18n';
 *
 * const catalog = {
 *   locale: 'en', direction: 'ltr' as const,
 *   messages: { 'hit.audio': '', 'loot.audio': { one: 'a.wav', other: 'b.wav' } },
 * };
 *
 * console.log(validateMessageAudio(catalog).map((issue) => issue.key)); // ['hit.audio', 'loot.audio']
 * ```
 */
export function validateMessageAudio(catalog: Catalog): AudioIssue[] {
	const issues: AudioIssue[] = [];

	for (const [key, value] of Object.entries(catalog.messages)) {
		if (!key.endsWith('.audio')) continue;
		if (typeof value !== 'string') {
			issues.push({
				key,
				kind: 'audio-not-a-path',
				detail: 'an audio entry must be a plain path string, not plural forms or a select message',
			});
		} else if (value === '') {
			issues.push({
				key,
				kind: 'empty-audio-path',
				detail: 'an empty audio entry already means "no sound"; remove the key instead',
			});
		}
	}

	return issues;
}
