import { Signal } from '../../core/Signal.ts';

export interface DropdownOption {
	/** the value the game reads back; the label when omitted */
	id?: string;
	label: string;
	disabled?: boolean;
}

export interface DropdownOptions {
	options: readonly DropdownOption[];
	/** the entry selected from the start; the first enabled one when omitted */
	selectedIndex?: number;
	disabled?: boolean;
}

/**
 * A closed button that opens a list of options - the "option button" a settings row or a
 * scenario picker drops down.
 *
 * Renderer-free, like `TabbedList`: the state is the whole widget's mind, and a game draws the
 * button's label and the open list wherever its own layout wants them. The rule worth naming is
 * that opening restores the highlight to the current selection, so the first arrow key does not
 * jump from wherever the highlight was last, and a disabled option is skipped by the highlight
 * exactly as `ListView` skips one.
 *
 * @example
 * ```ts
 * import { Dropdown } from '@datamoc/mw_games/two-d/ui';
 *
 * const difficulty = new Dropdown({
 *   options: [{ id: 'easy', label: 'Easy' }, { id: 'normal', label: 'Normal' }],
 * });
 * difficulty.open();
 * difficulty.move(1);
 * difficulty.confirm();
 * console.log(difficulty.selected?.id); // 'normal'
 * ```
 */
export class Dropdown {
	readonly onChange = new Signal<{ option: DropdownOption; index: number }>();

	private options_: DropdownOption[];
	private current: number;
	private highlight_: number;
	private open_ = false;
	private disabled_: boolean;

	constructor(options: DropdownOptions) {
		this.options_ = [...options.options];
		this.disabled_ = options.disabled ?? false;
		const requested = options.selectedIndex ?? this.firstEnabled();
		this.current = this.options_[requested]?.disabled ? this.firstEnabled() : requested;
		this.highlight_ = this.current;
	}

	get options(): readonly DropdownOption[] {
		return this.options_;
	}

	get selectedIndex(): number {
		return this.current;
	}

	/** the selected entry; the first enabled one when nothing was selected, `null` when empty */
	get selected(): DropdownOption | null {
		return this.options_[this.current] ?? null;
	}

	get isOpen(): boolean {
		return this.open_;
	}

	get disabled(): boolean {
		return this.disabled_;
	}

	/** the row an open list has highlighted, which is what a confirm would take */
	get highlight(): number {
		return this.highlight_;
	}

	setDisabled(disabled: boolean): void {
		this.disabled_ = disabled;
		if (disabled) this.open_ = false;
	}

	setOptions(options: readonly DropdownOption[]): void {
		this.options_ = [...options];
		this.current = this.firstEnabled();
		this.highlight_ = this.current;
		this.open_ = false;
	}

	/** opens the list, restoring the highlight to the current selection */
	open(): void {
		if (this.disabled_ || this.open_) return;
		this.open_ = true;
		this.highlight_ = this.current;
	}

	close(): void {
		this.open_ = false;
	}

	toggleOpen(): void {
		if (this.open_) this.close();
		else this.open();
	}

	/** moves the highlight by `delta` rows, skipping disabled entries and wrapping at both ends */
	move(delta: number): void {
		if (!this.open_ || this.options_.length === 0) return;
		const count = this.options_.length;
		let index = this.highlight_;
		for (let tried = 0; tried < count; tried++) {
			index = (((index + delta) % count) + count) % count;
			if (!this.options_[index].disabled) {
				this.highlight_ = index;
				return;
			}
		}
	}

	/** opens the list and highlights `index`, if it is enabled */
	setHighlight(index: number): void {
		if (index < 0 || index >= this.options_.length || this.options_[index].disabled) return;
		this.highlight_ = index;
	}

	/** takes the highlighted row: closes, selects it, and fires `onChange` when it moved */
	confirm(): boolean {
		if (!this.open_) return false;
		const option = this.options_[this.highlight_];
		if (!option || option.disabled) return false;
		this.open_ = false;
		if (this.highlight_ !== this.current) {
			this.current = this.highlight_;
			this.onChange.dispatch({ option, index: this.current });
		}
		return true;
	}

	/** closes the list without taking anything, the escape key's own action */
	cancel(): void {
		this.open_ = false;
		this.highlight_ = this.current;
	}

	private firstEnabled(): number {
		const index = this.options_.findIndex((option) => !option.disabled);
		return index === -1 ? 0 : index;
	}
}
