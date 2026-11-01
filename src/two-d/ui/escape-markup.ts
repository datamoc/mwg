/**
 * How one engine escape code is read and what markup it becomes.
 *
 * `mwg` supplies the mechanism and the markup it targets (`parseMarkup`, `MarkupText`, `RichLabel`);
 * the codes themselves belong to the engine a game's text came from, so the table lives in that
 * game's own code and is passed to `escapesToMarkup` as data. Nothing in this file knows what
 * `\C[3]` or `\FS[20]` mean.
 */
export interface EscapeRule {
	/** the literal that introduces the code, `'\\C'` for `\C[3]` */
	readonly code: string;
	/** markup emitted where the code appears; `{argument}` is replaced by the resolved argument */
	readonly open: string;
	/**
	 * markup emitted at the end of the line the code appeared on, so a style never runs past that
	 * line. Omit it for a rule whose `open` needs no closing markup.
	 */
	readonly close?: string;
	/**
	 * how the code's argument is read, when it takes one:
	 * - `'literal'` - as written, for a variable value or a name
	 * - `'color'` - a colour; a bare integer is an engine palette index, so it stays literal unless
	 *   `EscapeMarkupOptions.resolve` turns it into a real colour
	 * - `'number'` - a finite number; anything else leaves the code literal
	 *
	 * An argument is written between `[...]` after the code, or runs to a `}` when the code itself
	 * ends in `{` (the `{#ff0000}` shape). A code that consumed a delimiter writes it back into
	 * `open`, so `{#ff0000}` is `open: "<span color='#{argument}'>"`.
	 */
	readonly argument?: 'literal' | 'color' | 'number';
}

/** How `escapesToMarkup` resolves arguments the engine left symbolic. */
export interface EscapeMarkupOptions {
	/**
	 * Turns one argument into the text that replaces `{argument}`, or `undefined` to keep the
	 * argument as written. A palette index (`3` into `#c0ffee`) or an engine variable (`\V[4]` into
	 * the player's name) is exactly this callback's job, and the rule it receives says which code
	 * asked.
	 */
	readonly resolve?: (rule: EscapeRule, argument: string) => string | undefined;
}

/**
 * Rewrites engine escape codes into `mwg` markup according to caller-supplied rules.
 *
 * @example
 * ```ts
 * import { escapesToMarkup } from '@datamoc/mwg/two-d/ui';
 *
 * const markup = escapesToMarkup('\\C[3]Danger\\C[0] ahead', [
 *   { code: '\\C', open: "<span color='{argument}'>", close: '</span>', argument: 'color' },
 * ], {
 *   resolve: (_rule, argument) => (argument === '0' ? '#ffffff' : '#ff0000'),
 * });
 * console.log(markup); // "<span color='#ff0000'>Danger<span color='#ffffff'> ahead</span></span>"
 * ```
 *
 * The contract is the same one `parseMarkup` follows for anything it cannot read: a code with no
 * rule, or an argument that does not parse, stays literal rather than disappearing. Codes are
 * rewritten line by line, and a rule's `close` is emitted at the end of the line its code opened
 * on, in reverse order of opening, so a style is balanced and never leaks onto the next line. A
 * rule with no `close` contributes only its `open`: its effect is whatever markup the open starts,
 * and the adaptor adds nothing to end it.
 *
 * Text between codes is copied through untouched, so a game that cannot trust its own text (a
 * player-entered name, say) escapes it with `escapeHtml` before formatting it into an engine
 * string, or after this call on the text it controls.
 */
export function escapesToMarkup(
	source: string,
	rules: readonly EscapeRule[],
	options: EscapeMarkupOptions = {},
): string {
	const ordered = rules.filter((rule) => rule.code.length > 0).sort((a, b) => b.code.length - a.code.length);
	if (ordered.length === 0) return source;
	return source
		.split('\n')
		.map((line) => rewriteLine(line, ordered, options.resolve))
		.join('\n');
}

interface Opened {
	readonly rule: EscapeRule;
	readonly argument: string;
}

function rewriteLine(line: string, rules: readonly EscapeRule[], resolve: EscapeMarkupOptions['resolve']): string {
	const opened: Opened[] = [];
	let output = '';
	let index = 0;

	while (index < line.length) {
		const rule = rules.find((candidate) => line.startsWith(candidate.code, index));
		if (!rule) {
			output += line[index];
			index++;
			continue;
		}

		const start = index;
		index += rule.code.length;

		if (rule.argument === undefined) {
			output += rule.open;
			opened.push({ rule, argument: '' });
			continue;
		}

		const bracket = line[index];
		const closer = bracket === '[' ? ']' : bracket === '{' ? '}' : '}';
		if (bracket === '[' || bracket === '{') index++;
		const end = line.indexOf(closer, index);
		if (end < 0) {
			//an unterminated argument is not a code this engine could have meant: keep the rest as text
			output += line.slice(start);
			index = line.length;
			break;
		}

		const raw = line.slice(index, end);
		index = end + 1;
		const argument = resolve?.(rule, raw) ?? raw;
		if (!argumentFits(rule.argument, argument)) {
			output += line.slice(start, index);
			continue;
		}

		output += rule.open.replaceAll('{argument}', argument);
		opened.push({ rule, argument });
	}

	for (let openIndex = opened.length - 1; openIndex >= 0; openIndex--) {
		const { rule, argument } = opened[openIndex];
		if (rule.close !== undefined) output += rule.close.replaceAll('{argument}', argument);
	}
	return output;
}

function argumentFits(kind: 'literal' | 'color' | 'number', argument: string): boolean {
	if (kind === 'number') return argument.trim() !== '' && Number.isFinite(Number(argument));
	//a bare integer is a palette index rather than a CSS colour; only `resolve` can turn it into one
	if (kind === 'color') return argument.trim() !== '' && !/^\d+$/.test(argument.trim());
	return true;
}
