import { locale } from './index.ts';

/**
 * Locale-aware number/date/list formatting, for a catalog message that needs more than
 * `{token}` substitution can give it - "1,234" vs "1 234", "3 items" vs "3 éléments" joined
 * with "and"/"et". A game calls these while building a `t()`/`SemanticMessage` param, the
 * same way it already resolves an entity id to display text; MWG does not parse a format
 * directive out of the message string itself.
 *
 * All three read the active locale from `i18n`'s own `locale()`, so a language switch takes
 * effect the same way it already does for plurals and typography.
 *
 * @example
 * ```ts
 * import { setActive, t, formatNumber, formatDate, formatList } from '@datamoc/mw_games/i18n';
 *
 * setActive({ locale: 'fr-FR', direction: 'ltr', messages: { found: 'Vous trouvez {amount}.' } });
 *
 * console.log(formatNumber(1234.5)); // '1 234,5'
 * console.log(formatDate(new Date(2024, 0, 15))); // '15/01/2024'
 * console.log(t('found', { amount: formatList(['une épée', 'un bouclier']) })); // '... une épée et un bouclier.'
 * ```
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(locale(), options).format(value);
}

export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(locale(), options).format(value);
}

export function formatList(items: readonly string[], options?: Intl.ListFormatOptions): string {
	return new Intl.ListFormat(locale(), options).format(items);
}
