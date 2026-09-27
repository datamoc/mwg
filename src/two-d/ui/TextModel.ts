export interface TextModelOptions {
	value?: string;
	/** the most characters the field will hold; unlimited when omitted */
	maxLength?: number;
	/** a password-style field: `maskedValue` replaces every character with a dot */
	mask?: boolean;
	/** the character `maskedValue` repeats; a bullet when omitted */
	maskCharacter?: string;
	/**
	 * a multiline field: Enter inserts a real newline and the line helpers below
	 * navigate rows. Off by default, in which case newlines never survive an edit -
	 * a single-line name entry cannot grow a second row no matter what is pasted.
	 */
	multiline?: boolean;
}

/**
 * The editing state behind a text field, with no renderer attached - the counterpart to
 * `core.Input`'s `onText`, which supplies the characters: the DOM gives a key, this decides
 * where it goes, and a game draws `value` (or `maskedValue`) with the caret it reports.
 *
 * The caret is an index into `value`; a selection is the caret plus an anchor, so every edit
 * replaces the selection when there is one and inserts at the caret when there is not, which is
 * the behaviour a plain `<input>` has and a title screen's name entry expects.
 *
 * @example
 * ```ts
 * import { TextModel } from '@datamoc/mw_games/two-d/ui';
 *
 * const name = new TextModel({ maxLength: 8, value: 'Hero' });
 * name.selectAll();
 * name.insert('Ash');
 * console.log(name.value); // 'Ash'
 * ```
 */
export class TextModel {
	private text: string;
	private caretIndex: number;
	private anchor: number;
	private readonly maxLength?: number;
	private readonly mask: boolean;
	private readonly maskCharacter: string;
	private readonly multiline: boolean;
	private goalColumn: number | null = null;

	constructor(options: TextModelOptions = {}) {
		this.multiline = options.multiline ?? false;
		this.text = this.limit(this.shape(options.value ?? ''));
		this.maxLength = options.maxLength;
		this.mask = options.mask ?? false;
		this.maskCharacter = options.maskCharacter ?? '\u2022';
		this.caretIndex = this.text.length;
		this.anchor = this.caretIndex;
	}

	get value(): string {
		return this.text;
	}

	/**
	 * what to draw for a password field: every character replaced by the mask, except
	 * newlines, which stay newlines so a masked multiline value keeps its rows
	 */
	get maskedValue(): string {
		if (!this.mask) return this.text;
		return this.text
			.split('')
			.map((char) => (char === '\n' ? '\n' : this.maskCharacter))
			.join('');
	}

	get length(): number {
		return this.text.length;
	}

	get caret(): number {
		return this.caretIndex;
	}

	get selectionStart(): number {
		return Math.min(this.caretIndex, this.anchor);
	}

	get selectionEnd(): number {
		return Math.max(this.caretIndex, this.anchor);
	}

	get hasSelection(): boolean {
		return this.caretIndex !== this.anchor;
	}

	get selectedText(): string {
		return this.text.slice(this.selectionStart, this.selectionEnd);
	}

	/** replaces everything; the caret goes to the end and a new string is never longer than `maxLength` */
	setValue(value: string): void {
		this.text = this.limit(this.shape(value));
		this.caretIndex = this.text.length;
		this.anchor = this.caretIndex;
		this.goalColumn = null;
	}

	setCaret(index: number, extend = false): void {
		this.caretIndex = Math.max(0, Math.min(this.text.length, index));
		this.goalColumn = null;
		if (!extend) this.anchor = this.caretIndex;
	}

	/** inserts at the caret, replacing the selection, as a keystroke from `onText` does */
	insert(text: string): void {
		if (text.length === 0) return;
		this.replaceSelection(text);
	}

	/** the backspace key: removes the selection, or the character before the caret */
	backspace(): void {
		if (this.hasSelection) {
			this.replaceSelection('');
			return;
		}
		if (this.caretIndex === 0) return;
		this.text = this.text.slice(0, this.caretIndex - 1) + this.text.slice(this.caretIndex);
		this.setCaret(this.caretIndex - 1);
	}

	/** the delete key: removes the selection, or the character after the caret */
	deleteForward(): void {
		if (this.hasSelection) {
			this.replaceSelection('');
			return;
		}
		if (this.caretIndex >= this.text.length) return;
		this.text = this.text.slice(0, this.caretIndex) + this.text.slice(this.caretIndex + 1);
		this.setCaret(this.caretIndex);
	}

	/** arrow keys: moves the caret, extending the selection when the shift key is held */
	moveCaret(delta: number, extend = false): void {
		this.setCaret(this.caretIndex + delta, extend);
	}

	moveToStart(extend = false): void {
		this.setCaret(0, extend);
	}

	moveToEnd(extend = false): void {
		this.setCaret(this.text.length, extend);
	}

	selectAll(): void {
		this.anchor = 0;
		this.caretIndex = this.text.length;
		this.goalColumn = null;
	}

	clearSelection(): void {
		this.anchor = this.caretIndex;
	}

	/** replaces the selection (or inserts at the caret) and leaves the caret after the new text */
	replaceSelection(text: string): void {
		const start = this.selectionStart;
		const end = this.selectionEnd;
		const base = this.text.slice(0, start) + this.text.slice(end);
		const shaped = this.shape(text);
		//a paste into a field with little room left stops at the cap rather than being rejected whole
		const inserted =
			this.maxLength !== undefined && base.length + shaped.length > this.maxLength
				? shaped.slice(0, Math.max(0, this.maxLength - base.length))
				: shaped;
		this.text = this.text.slice(0, start) + inserted + this.text.slice(end);
		this.setCaret(start + inserted.length);
	}

	/** newlines as the field keeps them: rows in a multiline field, stripped away otherwise */
	private shape(text: string): string {
		return text.replace(/\r\n|\r|\n/g, this.multiline ? '\n' : '');
	}

	/** rows in a multiline field; always 1 for a single-line one, even when empty */
	get lineCount(): number {
		if (!this.multiline) return 1;
		return this.text.split('\n').length;
	}

	/** the 0-based row the caret sits on */
	get caretLine(): number {
		return this.text.slice(0, this.caretIndex).split('\n').length - 1;
	}

	/** [start, end) of a row, the end stopping before its newline; out-of-range rows clamp */
	lineRange(line: number): readonly [number, number] {
		const clamped = Math.max(0, Math.min(this.lineCount - 1, line));
		let start = 0;
		for (let i = 0; i < clamped; i++) start = this.text.indexOf('\n', start) + 1;
		const end = this.text.indexOf('\n', start);
		return [start, end === -1 ? this.text.length : end];
	}

	/**
	 * Up/down between rows, holding the column: the caret lands as far along the new
	 * row as it goes, the way a `<textarea>` moves. Rows here are newline-delimited,
	 * since only the renderer knows where a long row wraps on screen.
	 */
	moveCaretLine(delta: number, extend = false): void {
		const [start] = this.lineRange(this.caretLine);
		const column = this.goalColumn ?? this.caretIndex - start;
		const [nextStart, nextEnd] = this.lineRange(this.caretLine + delta);
		this.setCaret(nextStart + Math.min(column, nextEnd - nextStart), extend);
		this.goalColumn = column;
	}

	private limit(value: string): string {
		return this.maxLength !== undefined && value.length > this.maxLength ? value.slice(0, this.maxLength) : value;
	}
}
