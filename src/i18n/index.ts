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
 *
 * @example
 * ```ts
 * import { setBase, setActive, t, locale, direction, typographic, parseFTL, reset } from '@datamoc/mw_games/i18n';
 *
 * setBase({ locale: 'en', direction: 'ltr', messages: { greeting: 'Hello, {name}!' } });
 *
 * const french = parseFTL('fr', 'greeting = Bonjour, { $name } !');
 * setActive(french);
 *
 * console.log(t('greeting', { name: 'Ada' })); // 'Bonjour, Ada !'
 * console.log(locale(), direction()); // 'fr' 'ltr'
 * console.log(typographic("aujourd'hui")); // "aujourd’hui"
 *
 * reset(); // back to unset, for the next test or a language switch from scratch
 * ```
 *
 * `createCatalogFormatter` (`SemanticMessage.ts`) sits on top of the same catalog: a
 * simulation emits one typed `SemanticMessage` and a game renders it differently per channel
 * (log line, compact HUD, accessibility, debug) without touching the message itself.
 * ```ts
 * import { setBase, createCatalogFormatter, type SemanticMessage } from '@datamoc/mw_games/i18n';
 *
 * setBase({
 *   locale: 'en',
 *   direction: 'ltr',
 *   messages: { 'combat.damage.log': 'The {target} takes {amount} damage.', 'combat.damage.compact': '-{amount} HP' },
 * });
 *
 * const formatter = createCatalogFormatter();
 * const message: SemanticMessage = { type: 'combat.damage', params: { target: 'gnoll', amount: 7 } };
 * console.log(formatter.format(message, 'log'), formatter.format(message, 'compact'));
 * // 'The gnoll takes 7 damage.' '-7 HP'
 * ```
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
 * Resolves a message by key, interpolating `{token}` placeholders from `params`, without
 * any display-text decoration: no `typographic` spacing, no right-to-left isolate wrapping.
 * This is the resolver for catalog values that are not shown to the player - a sound path
 * behind the semantic formatter's `audio` channel, an icon id, a font name - where a
 * narrow no-break space or a bidi control character would corrupt the value rather than
 * improve it.
 *
 * A key present in neither language returns itself, the same as `t()`.
 *
 * @example
 * ```ts
 * import { setBase, tRaw } from '@datamoc/mw_games/i18n';
 *
 * setBase({ locale: 'fr', direction: 'ltr', messages: { 'ui.click.audio': 'sounds/hit!.wav' } });
 * tRaw('ui.click.audio'); // 'sounds/hit!.wav', with no extra spacing before the '!'
 * ```
 */
export function tRaw(key: string, params?: MessageParams): string {
	const entry = active?.messages[key] ?? base?.messages[key];
	if (entry === undefined) return key;

	const text =
		typeof entry === 'string'
			? entry
			: isFluentMessage(entry)
				? entry.format(params)
				: resolvePlural(entry, params?.count);
	return params ? interpolate(text, params) : text;
}

/**
 * Resolves a message by key, interpolating `{token}` placeholders from `params`.
 *
 * Placeholders also take Python f-string-style fitting-out: `{dmg:03d}`, `{hp:.1%}`,
 * `{name:>12}`, plus `!s`/`!r`/`!a` conversions and `=` debugging (`{dmg=}` renders as
 * `dmg=42`), all resolved through `formatSpec`. A placeholder whose token is missing, or
 * whose spec fits neither the value nor the supported subset, is left untouched rather
 * than throwing or rendering half-formatted.
 *
 * A key present in neither language returns itself, which is the only case where a raw key
 * can reach the player - and it means the key was never translated anywhere, not merely
 * missing from one language.
 */
export function t(key: string, params?: MessageParams): string {
	if (!has(key)) return key;

	const translated = tRaw(key, params);
	const resolved = (active ?? base)?.typography === false ? translated : typographic(translated, locale());

	// Canvas 2D's fillText (what every renderer here draws text through) always resolves
	// bidi runs against an 'ltr' paragraph base, since nothing sets the context's own
	// `direction`. A message that is mostly RTL but starts or ends with a weak/neutral
	// character (a digit, an interpolated Latin name) then gets its runs ordered as if
	// the paragraph were LTR. Wrapping the whole string in an explicit right-to-left
	// isolate is a Unicode Bidi Algorithm formatting control, not a locale heuristic, so
	// fillText honours it regardless of the canvas's own direction.
	const RLI = '⁧'; // right-to-left isolate
	const PDI = '⁩'; // pop directional isolate
	return direction() === 'rtl' ? `${RLI}${resolved}${PDI}` : resolved;
}

/** espace fine insécable - narrow no-break space, U+202F */
const THIN_NBSP = ' ';
/** espace insécable - ordinary no-break space, U+00A0 */
const NBSP = ' ';

/** words a French document commonly numbers - generic document/narrative structure, not any
 * one game's own vocabulary, the same way `t()`'s plural categories are language structure
 * rather than content */
const FR_NUMBERING_WORDS = [
	'Chapitre',
	'Tome',
	'Livre',
	'Partie',
	'Section',
	'Article',
	'Acte',
	'Scène',
	'Niveau',
	'Manche',
	'Round',
	'Étape',
	'Volume',
	'Figure',
	'Page',
	'Numéro',
];

/** German abbreviations that keep a no-break space before whatever follows them (Duden K 116) */
const DE_ABBREVIATIONS = ['Nr', 'Dr', 'Bd', 'Kap', 'Art', 'Abb', 'Str', 'Tel'];
/** units a no-break space keeps glued to the number in front of them (Duden K 117) */
const DE_UNITS = ['kg', 'g', 'mg', 't', 'km', 'm', 'cm', 'mm', 'l', 'ml', 'h', 'min', 's', '%', '°C', '€'];

/**
 * Locale-specific punctuation/spacing conventions, applied on top of interpolation - the
 * things a translator would type by hand if this project asked every catalog to carry
 * literal U+202F/U+00A0 characters, which no one would ever remember to do consistently.
 *
 * French (Imprimerie nationale's rules, `Lexique des règles typographiques`): a narrow
 * no-break space before `; : ! ?` and around `« »`, and an ordinary no-break space between a
 * numbering word and the number following it ("Chapitre 3"). Also replaces apostrophes
 * between letters with a curly one, for French, Italian, and Dutch elisions - English and
 * other locales are left untouched, as a straight apostrophe can be intentional punctuation
 * there.
 *
 * German (Duden K 116/117): a no-break space between a number and its unit ("5 kg"), and
 * after a small set of abbreviations before whatever follows ("Nr. 3", "Dr. Müller").
 *
 * Deliberately not attempted here: a *game's own* units ("pièces d'or", "points de vie") -
 * `mwg` cannot know a game's vocabulary any more than it knows its item names, so gluing a
 * value to a game-specific unit is `nonBreakingUnit`'s job, not this function's.
 */
export function typographic(text: string, language = locale()): string {
	const lang = language.split('-')[0].toLowerCase();
	let result = text;

	if (lang === 'fr' || lang === 'it' || lang === 'nl') {
		result = result.replace(/([\p{L}])'(?=[\p{L}])/gu, '$1’');
	}

	if (lang === 'fr') result = frenchSpacing(result);
	if (lang === 'de') result = germanSpacing(result);

	return result;
}

/** joins a value and its unit with whatever space French/German typography requires to keep
 * them from breaking across a line - the unit's own text ("pièces d'or", "points de vie",
 * "kg") is always the game's own vocabulary; this only picks the space that glues it to the
 * value in front of it, the same division `SemanticMessage`/`EntityTextResolver` already draw
 * between mechanism and content.
 *
 * @example
 * ```ts
 * import { nonBreakingUnit } from '@datamoc/mw_games/i18n';
 *
 * console.log(nonBreakingUnit(12, 'pièces d\'or', 'fr')); // '12 pièces d\'or'
 * console.log(nonBreakingUnit(5, 'kg', 'de')); // '5 kg'
 * console.log(nonBreakingUnit(3, 'gold', 'en')); // '3 gold'
 * ```
 */
export function nonBreakingUnit(value: string | number, unit: string, language = locale()): string {
	const lang = language.split('-')[0].toLowerCase();
	const space = lang === 'fr' ? THIN_NBSP : lang === 'de' ? NBSP : ' ';
	return `${value}${space}${unit}`;
}

/** idempotent on purpose: `\s` already matches U+202F/U+00A0, so re-running this on
 * already-spaced text leaves it unchanged rather than stacking a second space */
function frenchSpacing(text: string): string {
	let result = text
		.replace(/\s?([;!?])/g, `${THIN_NBSP}$1`)
		.replace(/«\s?/g, `«${THIN_NBSP}`)
		.replace(/\s?»/g, `${THIN_NBSP}»`);

	// `:` is excluded from clock times ("12:30") and URLs ("https://") by requiring a letter,
	// not a digit, immediately before it - a heuristic good enough for translated dialogue/UI
	// text, not a general-purpose text parser
	// Keep the colon in an inline `{sound:path}` marker byte-for-byte intact so the
	// presentation layer can still recognize it after locale formatting.
	result = result.replace(/(?<!\{soun)(\p{L})\s?:/gu, `$1${THIN_NBSP}:`);

	const numbering = new RegExp(`\\b(${FR_NUMBERING_WORDS.join('|')})\\s+(?=\\d)`, 'g');
	return result.replace(numbering, `$1${NBSP}`);
}

function germanSpacing(text: string): string {
	// `\b` after a symbol like `%`/`€` never matches (neither side of that boundary is a "word"
	// character), so the next-character check is spelled out directly instead: not a letter or
	// digit, which also rules out matching "kg" as a false-positive prefix of a longer word
	const units = new RegExp(`(\\d)\\s+(?=(?:${DE_UNITS.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}]))`, 'gu');
	const abbreviations = new RegExp(`\\b(${DE_ABBREVIATIONS.join('|')})\\.\\s+`, 'g');

	return text.replace(units, `$1${NBSP}`).replace(abbreviations, `$1.${NBSP}`);
}

function escapeRegExp(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
	return tokenizeMessage(text)
		.map((part) => (typeof part === 'string' ? part : resolvePlaceholder(part, params)))
		.join('');
}

function resolvePlaceholder(part: Placeholder, params: MessageParams): string {
	const value = params[part.token];
	if (value === undefined) return part.raw;
	try {
		const converted = part.conv === undefined ? value : convertValue(value, part.conv);
		const formatted = part.spec === undefined ? String(converted) : formatSpec(converted, part.spec, locale());
		if (formatted === undefined) return part.raw;
		return part.debug ? `${part.token}=${formatted}` : formatted;
	} catch {
		//an absurd width (or anything else down in the formatter that throws) leaves
		//the placeholder readable rather than aborting the whole message
		return part.raw;
	}
}

/** `!s`/`!r`/`!a` before any `:spec`, the way CPython applies the conversion first */
function convertValue(value: string | number, conv: string): string | number {
	if (conv === 's') return String(value);
	if (typeof value === 'number') {
		const text = formatSpec(value, '', 'en') ?? String(value);
		return conv === 'a' ? escapeAscii(text) : text;
	}
	const quoted = `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}'`;
	return conv === 'a' ? escapeAscii(quoted) : quoted;
}

function escapeAscii(text: string): string {
	let out = '';
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		out +=
			code > 127
				? code > 0xffff
					? `\\U${code.toString(16).padStart(8, '0')}`
					: `\\u${code.toString(16).padStart(4, '0')}`
				: char;
	}
	return out;
}

/** clears both languages, mainly so tests do not leak state into one another */
export function reset(): void {
	base = null;
	active = null;
	activeRules = null;
}

export { parseFTL } from './Fluent.ts';
export type { FluentOptions } from './Fluent.ts';

export { parseSoundMarkers, stripSoundMarkers } from './SoundMarkers.ts';
export type { InlineSoundCue, ParsedSoundText } from './SoundMarkers.ts';

export { createCatalogFormatter } from './SemanticMessage.ts';
export type {
	SemanticMessage,
	EntityTextResolver,
	GrammaticalEntity,
	MessageChannel,
	MessageFormatter,
} from './SemanticMessage.ts';

export { formatNumber, formatDate, formatList } from './Format.ts';

import { formatSpec, tokenizeMessage, diffPlaceholders, type Placeholder } from './FormatSpec.ts';
export { formatSpec, tokenizeMessage, diffPlaceholders };
export type { Placeholder, MessagePart, PlaceholderDiff } from './FormatSpec.ts';

export { diffCatalogKeys, validateCatalog, validateMessageAudio } from './Validate.ts';
export type { CatalogKeyDiff, CatalogIssue, AudioIssue } from './Validate.ts';

export {
	AUDIO_SUFFIX,
	copyFromBase,
	createEditSession,
	cueKeyFor,
	deleteTargetKey,
	isAudioKey,
	sessionCompleteness,
	sessionKeys,
	sessionRow,
	sessionRows,
	setTargetSound,
	setTargetText,
	swapSession,
} from './EditSession.ts';
export type { EditRow, EditSession, RowFilter } from './EditSession.ts';

export {
	messageText,
	levenshteinDistance,
	findSimilarMessages,
	catalogUsage,
	catalogCompleteness,
	pluralFormCoverage,
	mergeCatalogKeys,
} from './Content.ts';
export type { SimilarMessagePair, CatalogUsageStats, PluralCoverage } from './Content.ts';
