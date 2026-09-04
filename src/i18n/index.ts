/**
 * Message tables per language, with plurals and interpolation, compiled at build time the
 * same way every other resource is.
 *
 * A message table is data - loaded like any other asset, so `mwg/assets` already covers
 * getting it into the game and `tools/compile-resources` already covers shipping it from
 * `file://`. What lives here is picking the right string out of it: plural forms selected
 * by `Intl.PluralRules` rather than a hand-rolled rule table (the browser already ships the
 * CLDR plural rules for every locale, and getting those right by hand is exactly the kind
 * of detail that stays wrong until a native speaker notices), `{token}` interpolation, and
 * the text direction `mwg/ui` lays widgets out against.
 *
 * A missing key in the active language falls back to the base language rather than showing
 * a raw key to the player - a translation catalog is nearly always incomplete somewhere,
 * and a placeholder key breaks immersion far worse than the wrong language would.
 */

/** left-to-right is the default; right-to-left is the other case `mwg/ui` mirrors against */
export type Direction = 'ltr' | 'rtl';

/** a value that varies by count, keyed by the CLDR plural category it applies to */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

export interface FluentMessage {
	format(params?: MessageParams): string;
}

export type MessageValue = string | PluralForms | FluentMessage;

export interface Catalog {
	/** a BCP-47 tag, such as 'en', 'fr', or 'ar' - passed straight to Intl.PluralRules */
	locale: string;
	direction: Direction;
	messages: Record<string, MessageValue>;
	/** Apply locale-aware typographic apostrophes when resolving messages. Defaults to true. */
	typography?: boolean;
}

let base: Catalog | null = null;
let active: Catalog | null = null;
let activeRules: Intl.PluralRules | null = null;
let fallbackRules: Intl.PluralRules | null = null;

/** the language everything falls back to; set this once, at startup */
export function setBase(catalog: Catalog): void {
	base = catalog;
}

/** the language currently shown; pass null to fall back to the base language alone */
export function setActive(catalog: Catalog | null): void {
	active = catalog;
	activeRules = catalog ? new Intl.PluralRules(catalog.locale) : null;
}

export function locale(): string {
	return (active ?? base)?.locale ?? 'en';
}

/** what `mwg/ui` lays widgets out against */
export function direction(): Direction {
	return (active ?? base)?.direction ?? 'ltr';
}

export interface MessageParams {
	/** picks the plural form, when the message has more than one */
	count?: number;
	[token: string]: string | number | undefined;
}

/**
 * Resolves a message by key, interpolating `{token}` placeholders from `params`.
 *
 * A key present in neither language returns itself, which is the only case where a raw key
 * can reach the player - and it means the key was never translated anywhere, not merely
 * missing from one language.
 */
export function t(key: string, params?: MessageParams): string {
	const entry = active?.messages[key] ?? base?.messages[key];
	if (entry === undefined) return key;

	const text = typeof entry === 'string' ? entry : isFluentMessage(entry) ? entry.format(params) : resolvePlural(entry, params?.count);
	const translated = params ? interpolate(text, params) : text;
	return (active ?? base)?.typography === false ? translated : typographic(translated, locale());
}

/**
 * Replaces apostrophes between letters for locales whose ordinary elisions use a curly
 * apostrophe. English and other locales are left untouched, as a straight apostrophe can
 * be intentional punctuation there.
 */
export function typographic(text: string, language = locale()): string {
	if (!/^(fr|it|nl)(?:-|$)/i.test(language)) return text;
	return text.replace(/([\p{L}])'(?=[\p{L}])/gu, '$1’');
}

/** true when `key` resolves to something other than itself, in either language */
export function has(key: string): boolean {
	return active?.messages[key] !== undefined || base?.messages[key] !== undefined;
}

function resolvePlural(forms: PluralForms, count: number | undefined): string {
	if (count === undefined) {
		return forms.other ?? Object.values(forms)[0] ?? '';
	}

	const category = (activeRules ?? (fallbackRules ??= new Intl.PluralRules('en'))).select(count);
	return forms[category] ?? forms.other ?? '';
}

function isFluentMessage(value: PluralForms | FluentMessage): value is FluentMessage {
	return 'format' in value;
}

function interpolate(text: string, params: MessageParams): string {
	return text.replace(/\{(\w+)\}/g, (whole, token: string) => {
		const value = params[token];
		return value === undefined ? whole : String(value);
	});
}

/** clears both languages, mainly so tests do not leak state into one another */
export function reset(): void {
	base = null;
	active = null;
	activeRules = null;
}

export { parseFTL } from './Fluent.ts';
export type { FluentOptions } from './Fluent.ts';
