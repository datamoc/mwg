/**
 * Python f-string-style value formatting for catalog messages: `{dmg:03d}`, `{hp:.1%}`,
 * `{name:>12}`. Plain `{token}` interpolation stays exactly as it was; a format spec after
 * a colon picks a deterministic, locale-independent rendering (padded damage numbers, hex
 * ids, fixed-precision percentages), the counterpart to `Format.ts`, whose `Intl` wrappers
 * render the locale-aware way instead ("1,234" vs "1 234").
 *
 * Supported subset of
 * https://docs.python.org/3/library/string.html#format-specification-mini-language -
 * `[[fill]align][sign][z][#][0][width][,|_][.precision][type]` with types
 * `b c d e E f F g G n o s x X %`, verified case by case against CPython itself
 * (two-digit exponents, stripped `g` precision, `_` grouping binary/octal/hex in fours).
 * Deliberately outside the subset: nested replacement fields in the spec (`{:{width}}`),
 * which are left for a game to resolve before calling `t()`. Anything outside the subset
 * returns `undefined` rather than guessing, and `t()` leaves that placeholder untouched
 * the way it already does for a missing token.
 *
 * One divergence no implementation choice can close: JavaScript numbers carry no
 * int/float distinction, so integer-valued floats always take the integer path (`3.0`
 * renders as `3`, and takes `d` where CPython would raise for a float). Games that need
 * `3.0` spell it with an explicit float type (`{v:.1f}`).
 *
 * @example
 * ```ts
 * import { formatSpec, tokenizeMessage, diffPlaceholders } from '@datamoc/mw_games/i18n';
 *
 * formatSpec(7, '03d'); // '007'
 * formatSpec(0.125, '.1%'); // '12.5%'
 * formatSpec('hi', '^7'); // '  hi   '
 *
 * tokenizeMessage('Hit for {dmg:03d}!');
 * // ['Hit for ', { raw: '{dmg:03d}', token: 'dmg', debug: false, conv: undefined, spec: '03d' }, '!']
 *
 * diffPlaceholders('Hit for {dmg:03d}!', 'Touché pour {dmg} !');
 * // { missing: [], extra: [], changed: [{ token: 'dmg', base: ':03d', target: '' }] }
 * ```
 */

export interface Placeholder {
	/** the placeholder exactly as written, for untouched passthrough */
	raw: string;
	token: string;
	debug: boolean;
	conv: string | undefined;
	spec: string | undefined;
}

export type MessagePart = string | Placeholder;

const PLACEHOLDER_PATTERN = /\{(\w+)(=)?(?:!([sra]))?(?::([^{}]*))?\}/g;

/**
 * Splits a message into literal text and `{token}`, `{token:spec}`, `{token!conv}` and
 * `{token=}` placeholders - the single definition of that grammar, shared by `t()`'s own
 * interpolation and by `diffPlaceholders` below, so the editor's consistency check can
 * never disagree with the runtime about what counts as a placeholder.
 */
export function tokenizeMessage(text: string): MessagePart[] {
	const parts: MessagePart[] = [];
	PLACEHOLDER_PATTERN.lastIndex = 0;
	let cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
		if (match.index > cursor) parts.push(text.slice(cursor, match.index));
		//group 1 always participates; the rest may be absent at runtime
		const token: string = match[1];
		const conv = match[3] as string | undefined;
		const spec = match[4] as string | undefined;
		parts.push({ raw: match[0], token, debug: match[2] === '=', conv, spec });
		cursor = match.index + match[0].length;
	}
	if (cursor < text.length) parts.push(text.slice(cursor));
	return parts;
}

function placeholderSignature(part: Placeholder): string {
	return `${part.debug ? '=' : ''}${part.conv ? `!${part.conv}` : ''}${part.spec === undefined ? '' : `:${part.spec}`}`;
}

export interface PlaceholderDiff {
	/** tokens the base message needs that the target never supplies */
	missing: string[];
	/** tokens the target supplies that the base never needs */
	extra: string[];
	/** same token, different conversion/spec/debug shape on each side */
	changed: Array<{ token: string; base: string; target: string }>;
}

/**
 * Compares two message texts placeholder by placeholder - the check a translation editor
 * runs between a reference string and its translation, since a dropped or reworded token
 * (`{dmg:03d}` becoming `{damage}`, or vanishing entirely) reaches the player as a raw
 * placeholder exactly the way a missing key would.
 */
export function diffPlaceholders(baseText: string, targetText: string): PlaceholderDiff {
	const base = new Map<string, string>();
	const target = new Map<string, string>();
	for (const part of tokenizeMessage(baseText)) {
		if (typeof part !== 'string') base.set(part.token, placeholderSignature(part));
	}
	for (const part of tokenizeMessage(targetText)) {
		if (typeof part !== 'string') target.set(part.token, placeholderSignature(part));
	}
	return {
		missing: [...base.keys()].filter((token) => !target.has(token)),
		extra: [...target.keys()].filter((token) => !base.has(token)),
		changed: [...base].flatMap(([token, baseSig]) => {
			const targetSig = target.get(token);
			return targetSig !== undefined && targetSig !== baseSig ? [{ token, base: baseSig, target: targetSig }] : [];
		}),
	};
}
const SPEC_PATTERN = /^(?:(.)?([<>=^]))?([+\- ])?(z)?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/;

const INT_RADIX: Record<string, number> = { b: 2, o: 8, x: 16, X: 16 };
const INT_PREFIX: Record<string, string> = { b: '0b', o: '0o', x: '0x', X: '0X' };
const FINITE_FLOAT_TYPES = new Set(['f', 'F', 'e', 'E', 'g', 'G', '%', 'n']);

/** `str()` for a number: integers plain, non-integers as-is, infinities Python-spelled */
function reprNumber(value: number): string {
	if (Number.isNaN(value)) return 'nan';
	if (value === Infinity) return 'inf';
	if (value === -Infinity) return '-inf';
	if (Object.is(value, -0)) return '-0.0';
	return String(value);
}

function groupDigits(digits: string, separator: string, size = 3, digit = '\\d'): string {
	return digits.replace(new RegExp(`\\B(?=(${digit}{${size}})+(?!${digit}))`, 'g'), separator);
}

/** groups the leading digit run of a decimal rendering (`1,234.5`, `1_234.5`) */
function groupDecimalRendering(text: string, separator: string): string {
	const match = /^(\d+)/.exec(text);
	if (!match) return text;
	return groupDigits(match[1], separator) + text.slice(match[1].length);
}

function padText(text: string, width: number, fill: string, align: string): string {
	if (text.length >= width) return text;
	const pad = fill.repeat(width - text.length);
	if (align === '<') return text + pad;
	//a centered field with an odd spare character puts it on the right, like CPython
	if (align === '^') return pad.slice(0, Math.floor(pad.length / 2)) + text + pad.slice(Math.floor(pad.length / 2));
	return pad + text;
}

/** CPython pads an exponent to at least two digits (`1.23e+3` renders as `1.23e+03`) */
function padExponent(text: string): string {
	return text.replace(/([eE][+-])(\d)$/, '$10$2');
}

/**
 * Significant-digits formatting with stripped zeros. CPython's `g` renders fixed while
 * the exponent stays below the precision; a bare precision without a type (`{v:.4}`)
 * switches to exponential one digit sooner - same shape, a tighter threshold.
 */
function formatGeneral(magnitude: number, precision: number, upper: boolean, alt: boolean, fixedBelow?: number): string {
	const digits = precision === 0 ? 1 : precision;
	if (magnitude === 0) return alt ? `0.${'0'.repeat(digits - 1)}` : '0';
	const exponent = Math.floor(Math.log10(magnitude));
	let out: string;
	if (exponent >= -4 && exponent < (fixedBelow ?? digits)) {
		out = magnitude.toFixed(digits - 1 - exponent);
		if (!alt) out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
	} else {
		out = padExponent(magnitude.toExponential(digits - 1));
		if (!alt) out = out.replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.e/i, 'e');
	}
	return upper ? out.toUpperCase() : out;
}

function localeSeparators(language: string): { group: string; decimal: string } {
	let group = ',';
	let decimal = '.';
	for (const part of new Intl.NumberFormat(language).formatToParts(1000.5)) {
		if (part.type === 'group') group = part.value;
		if (part.type === 'decimal') decimal = part.value;
	}
	return { group, decimal };
}

function formatStringSpec(
	value: string,
	fillChar: string | undefined,
	alignChar: string | undefined,
	zeroFlag: string | undefined,
	width: number,
	precision: number | undefined,
): string {
	const text = precision === undefined ? value : value.slice(0, precision);
	//unlike numbers, a string keeps its left alignment behind a `0` flag (`'ab'` as
	//`05` renders `'ab000'`), since zero-padding a word has no sign to sit behind
	return padText(text, width, fillChar ?? (zeroFlag ? '0' : ' '), alignChar ?? '<');
}

export function formatSpec(value: string | number, spec: string, language = 'en'): string | undefined {
	if (spec === '') return typeof value === 'number' ? reprNumber(value) : value;
	const parsed = SPEC_PATTERN.exec(spec);
	if (!parsed) return undefined;
	const groups: Array<string | undefined> = parsed.slice(1);
	const [fillChar, alignChar, sign, zFlag, altFlag, zeroFlag, widthDigits, grouping, precisionDigits, type] = groups;
	const precision = precisionDigits === undefined ? undefined : Number(precisionDigits);
	const width = widthDigits === undefined ? 0 : Number(widthDigits);

	if (typeof value === 'string') {
		//strings take width/alignment/fill and `.precision` truncation only - every other
		//option is numeric, and CPython raises for those rather than coercing the string
		if (sign || zFlag || altFlag || grouping || alignChar === '=' || (type !== undefined && type !== 's')) return undefined;
		return formatStringSpec(value, fillChar, alignChar, zeroFlag, width, precision);
	}

	//CPython's `s` is string-only: a number behind one raises rather than stringifying
	if (type === 's') return undefined;
	if (type === 'c') {
		//a code point, not a number rendered as text - numeric dressing of any kind is refused
		if (sign || altFlag || zeroFlag || grouping || precision !== undefined) return undefined;
		const code = Math.trunc(value);
		if (code < 0 || code > 0x10ffff) return undefined;
		return padText(String.fromCodePoint(code), width, fillChar ?? ' ', alignChar ?? '>');
	}
	if (!Number.isFinite(value)) {
		if (type !== undefined && !FINITE_FLOAT_TYPES.has(type)) return undefined;
		//CPython spells these lowercase except behind an uppercase float type
		let text = Number.isNaN(value) ? 'nan' : 'inf';
		if (type === 'F' || type === 'E' || type === 'G') text = text.toUpperCase();
		if (type === '%') text += '%';
		const signText = value < 0 ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
		return padText(signText + text, width, fillChar ?? ' ', alignChar ?? '>');
	}

	let negative = value < 0 || Object.is(value, -0);
	//Python 3.11's `z`: a negative zero renders as a positive one
	if (zFlag && value === 0) negative = false;
	const magnitude = Math.abs(value);
	const separator = grouping === ',' ? ',' : grouping === '_' ? '_' : '';
	let body: string;

	if (type === undefined) {
		//no type: `str()` plus sign/grouping/width - a precision without a type reads as
		//significant digits, except on an integer, where CPython raises
		if (precision !== undefined) {
			if (Number.isInteger(magnitude)) return undefined;
			body = formatGeneral(magnitude, precision, false, !!altFlag, precision - 1);
		} else {
			body = reprNumber(magnitude);
		}
		if (separator) body = groupDecimalRendering(body, separator);
	} else if (type === 'd') {
		if (precision !== undefined || !Number.isInteger(magnitude)) return undefined;
		body = String(Math.trunc(magnitude));
		if (separator) body = groupDigits(body, separator);
	} else if (type in INT_RADIX) {
		//integer-only, like `d`; `,` is refused on a non-decimal base while `_` groups
		//binary, octal and hex in fours rather than threes (`dead_beef`, `1010_1010`)
		if (precision !== undefined || !Number.isInteger(magnitude) || grouping === ',') return undefined;
		body = Math.trunc(magnitude).toString(INT_RADIX[type]);
		if (type === 'X') body = body.toUpperCase();
		if (separator) body = groupDigits(body, separator, 4, '[0-9a-fA-F]');
		if (altFlag) body = INT_PREFIX[type] + body;
	} else if (type === 'n') {
		//locale-aware, so it shares none of the fixed separators above - and takes none
		if (grouping || (precision !== undefined && Number.isInteger(magnitude))) return undefined;
		if (Number.isInteger(magnitude)) {
			body = new Intl.NumberFormat(language).format(Math.trunc(magnitude));
		} else {
			const { group, decimal } = localeSeparators(language);
			const general = formatGeneral(magnitude, precision ?? 6, false, !!altFlag);
			const mantissa = general.split('e')[0];
			const exponent = general.slice(mantissa.length);
			body = groupDecimalRendering(mantissa, group).replace('.', decimal) + exponent;
		}
	} else if (type === 'f' || type === 'F') {
		body = magnitude.toFixed(precision ?? 6);
		if (separator) body = groupDecimalRendering(body, separator);
	} else if (type === 'e' || type === 'E') {
		body = padExponent(magnitude.toExponential(precision ?? 6));
		if (type === 'E') body = body.toUpperCase();
		if (separator) body = groupDecimalRendering(body, separator);
	} else if (type === 'g' || type === 'G') {
		body = formatGeneral(magnitude, precision ?? 6, type === 'G', !!altFlag);
		if (separator) body = groupDecimalRendering(body, separator);
	} else {
		// '%' - fixed digits of the value times a hundred, then the sign itself
		const hundredths = magnitude * 100;
		body = (Number.isFinite(hundredths) ? hundredths.toFixed(precision ?? 6) : 'inf') + '%';
		if (separator && Number.isFinite(hundredths)) body = groupDecimalRendering(body, separator);
	}

	const signText = negative ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
	const fill = fillChar ?? (zeroFlag && !alignChar ? '0' : ' ');
	const align = alignChar ?? (zeroFlag && !alignChar ? '=' : '>');
	if (align === '=') return signText + padText(body, width - signText.length, fill, '>');
	return padText(signText + body, width, fill, align);
}
