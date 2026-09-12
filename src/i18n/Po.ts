import type { Catalog, Direction, PluralForms } from './index.ts';

export interface PoOptions {
	/** override the direction `parsePo` infers from the locale */
	direction?: Direction;

	/**
	 * The gettext domain this catalog is. `'messages'` (the default) leaves keys bare, the
	 * way gettext's default domain does; any other domain prefixes every key with
	 * `domain:`, so a game can load several `.po` files into one catalog without a shared
	 * `msgid` colliding.
	 */
	domain?: string;
}

/**
 * Parses the useful, dependency-free subset of a gettext `.po` file into an `i18n`
 * `Catalog`: `msgid`/`msgstr`, `msgctxt`, `msgid_plural` with `msgstr[N]`, and the header
 * entry, which is read and dropped. Comments are ignored, and so are flags other than one:
 * a `#, fuzzy` entry is treated as *untranslated*, which is what gettext's own tools mean by
 * it, so the base language wins for that key rather than a translation a translator has not
 * signed off on.
 *
 * Gettext's plural forms are positions (`msgstr[0]`, `msgstr[1]`), while a `Catalog` keys
 * them by CLDR category (what `Intl.PluralRules.select` returns). The two agree on order for
 * a CLDR-ordered catalog - English's two forms are one/other and Arabic's six are
 * zero/one/two/few/many/other - so form `N` maps to the Nth category the locale declares. A
 * catalog with more forms than its locale declares throws rather than silently mislabelling
 * one.
 *
 * An entry with an empty translation is left out, which is what gettext means by
 * "untranslated" and what lets `t()` fall back to the base language. A `msgid` carries no
 * placeholder syntax of its own here: write the catalog's own `{token}` form in the `.po`,
 * or run the strings through `FormatSpec` separately.
 *
 * @example
 * ```ts
 * import { parsePo, setBase, setActive, t } from '@datamoc/mw_games/i18n';
 *
 * const po = [
 *   'msgid "greeting"',
 *   'msgstr "Bonjour, {name} !"',
 *   '',
 *   'msgid "apple"',
 *   'msgid_plural "{n} apples"',
 *   'msgstr[0] "une pomme"',
 *   'msgstr[1] "{n} pommes"',
 * ].join('\n');
 *
 * setBase({ locale: 'en', direction: 'ltr', messages: { greeting: 'Hello, {name}!' } });
 * setActive(parsePo('fr', po));
 * console.log(t('greeting', { name: 'Ada' })); // 'Bonjour, Ada !'
 * console.log(t('apple', { count: 3, n: 3 })); // '{n} pommes'
 * ```
 */
export function parsePo(locale: string, source: string, options: PoOptions = {}): Catalog {
	const domain = options.domain ?? 'messages';
	const prefix = domain === 'messages' ? '' : `${domain}:`;
	const messages: Record<string, string | PluralForms> = {};

	interface Entry {
		context?: string;
		id?: string;
		plural?: string;
		str?: string;
		plurals: Map<number, string>;
	}

	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	let entry: Entry | null = null;
	/** the flags of the entry being read, from its `#,` lines - `fuzzy` is the one that matters */
	let flags = '';

	const finish = (): void => {
		if (!entry) return;
		if (entry.id === undefined) {
			if (entry.str !== undefined || entry.plurals.size > 0 || entry.context !== undefined) {
				throw new Error('PO entry has a translation but no msgid');
			}
			entry = null;
			flags = '';
			return;
		}
		store(entry);
		entry = null;
		flags = '';
	};

	const store = (current: Entry): void => {
		const id = current.id as string;
		if (id === '') return; // the header entry: metadata, not a message

		//gettext's own answer to a `#, fuzzy` entry is that it is not a translation yet - the
		//header being edited, or a guess a tool wants reviewed - so it is left out and the base
		//language wins, exactly as for an empty msgstr
		if (/(^|,)\s*fuzzy\s*(,|$)/.test(flags)) return;

		if (current.plural !== undefined && current.plurals.size === 0) {
			throw new Error(`PO message "${id}" has a plural but no msgstr[N] forms`);
		}

		const key = prefix + (current.context ? `${current.context}\u0004${id}` : id);
		if (messages[key] !== undefined) throw new Error(`Duplicate PO message: ${key}`);

		if (current.plurals.size > 0) {
			if ([...current.plurals.values()].every((text) => text === '')) return; // untranslated
			const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
			const forms: PluralForms = {};
			for (const [index, text] of [...current.plurals].sort((a, b) => a[0] - b[0])) {
				const category = categories[index];
				if (category === undefined) {
					throw new Error(
						`PO message "${id}" has plural form ${index}, but ${locale} declares only ${categories.length}`,
					);
				}
				forms[category] = text;
			}
			messages[key] = forms;
			return;
		}

		if (current.str !== undefined && current.str !== '') messages[key] = current.str;
		//an empty msgstr is gettext's "untranslated": leave the key out so the base language wins
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed === '') {
			finish();
			continue;
		}
		if (trimmed.startsWith('#,')) {
			flags += `${flags === '' ? '' : ','}${trimmed.slice(2).trim()}`;
			continue;
		}
		if (trimmed.startsWith('#')) continue; // translator comments, references

		const match = line.match(/^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+(.*)$/);
		if (!match) throw new Error(`Invalid PO line ${i + 1}: ${line}`);

		const keyword = match[1];
		const index = match[2] === undefined ? undefined : Number(match[2]);
		const read = readPoString(lines, i, match[3]);
		i = read.next - 1;

		if (!entry) {
			entry = { plurals: new Map() };
		} else if ((keyword === 'msgctxt' || keyword === 'msgid') && entry.id !== undefined) {
			//a new entry with no blank line between: close the previous one
			finish();
			entry = { plurals: new Map() };
		}

		if (keyword === 'msgctxt') entry.context = read.text;
		else if (keyword === 'msgid') entry.id = read.text;
		else if (keyword === 'msgid_plural') entry.plural = read.text;
		else if (keyword === 'msgstr') entry.str = read.text;
		else if (index !== undefined) entry.plurals.set(index, read.text);
		else throw new Error(`Invalid PO keyword on line ${i + 1}: ${keyword}`);
	}
	finish();

	return {
		locale,
		direction: options.direction ?? (/^(ar|he|fa|ur)(?:-|$)/i.test(locale) ? 'rtl' : 'ltr'),
		messages,
	};
}

/** Reads one PO string at `start`, its quoted chunk and any continuation lines, concatenated. */
function readPoString(lines: readonly string[], start: number, rest: string): { text: string; next: number } {
	if (!rest.trim().startsWith('"')) {
		throw new Error(`PO string must start with a quote on line ${start + 1}: ${rest}`);
	}

	let text = parseChunk(rest.trim(), start);
	let i = start + 1;
	while (i < lines.length && lines[i].trim().startsWith('"')) {
		text += parseChunk(lines[i].trim(), i);
		i++;
	}
	return { text, next: i };
}

function parseChunk(chunk: string, line: number): string {
	const match = chunk.match(/^"((?:[^"\\]|\\.)*)"/);
	if (!match) throw new Error(`Invalid PO string on line ${line + 1}: ${chunk}`);
	return unescapePo(match[1]);
}

function unescapePo(text: string): string {
	return text.replace(/\\(.)/g, (_, character: string) => {
		switch (character) {
			case 'n':
				return '\n';
			case 't':
				return '\t';
			case 'r':
				return '\r';
			case '"':
				return '"';
			case '\\':
				return '\\';
			case 'a':
				return '\x07';
			case 'b':
				return '\b';
			case 'f':
				return '\f';
			case 'v':
				return '\v';
			default:
				//an unrecognised escape keeps the character, which is gettext's own laxness
				return character;
		}
	});
}
