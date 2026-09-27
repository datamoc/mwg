import { Container, Graphics } from 'pixi.js';
import type { Action } from '../../core/Input.ts';
import { Signal } from '../../core/Signal.ts';
import { Label } from './Label.ts';
import { theme, themeChanged } from './theme.ts';

export interface RadioOption {
	/** what the row reads */
	text: string;

	/** a greyed-out option can be looked at but not chosen */
	disabled?: boolean;

	/** anything the game wants to get back when the option is chosen */
	value?: unknown;
}

export interface RadioGroupOptions {
	options?: RadioOption[];

	/** initially selected index; the first enabled option when omitted */
	selected?: number;

	/** the circle's diameter; the dot is drawn inside it */
	size?: number;

	/** vertical space between rows */
	gap?: number;
}

/**
 * One choice among several, where a checkbox would allow many: exactly one option
 * is selected, arrows move the selection (which selects at once, the way native
 * radio groups do), and a tap selects directly. Disabled options are skipped by
 * the keyboard and ignore the pointer, the same contract `ListView` rows keep.
 *
 * @example
 * ```ts
 * import { RadioGroup } from '@datamoc/mw_games/two-d/ui';
 *
 * const side = new RadioGroup({ options: [{ text: 'White' }, { text: 'Black' }] });
 * side.onChange.add((index) => console.log('side', index));
 * side.select(1);
 * ```
 */
export class RadioGroup extends Container {
	readonly onChange = new Signal<number>();

	private options_: RadioOption[] = [];
	private rows: Container[] = [];
	private circles: Graphics[] = [];

	private size_: number;
	private gap_: number;
	private selected_ = -1;

	private readonly themeListener = () => this.draw();

	constructor(options: RadioGroupOptions = {}) {
		super();

		this.size_ = options.size ?? 20;
		this.gap_ = options.gap ?? 8;

		this.buildRows(options.options ?? []);
		this.selected_ = this.defaultSelection(options.selected);

		this.draw();
		themeChanged.add(this.themeListener);
	}

	get selected(): number {
		return this.selected_;
	}

	get selectedOption(): RadioOption | null {
		return this.options_[this.selected_] ?? null;
	}

	get length(): number {
		return this.options_.length;
	}

	get rowHeight(): number {
		return this.size_ + this.gap_;
	}

	setOptions(options: RadioOption[], selected?: number): void {
		this.buildRows(options);
		this.selected_ = this.defaultSelection(selected);
		this.draw();
	}

	/** picks an option, firing `onChange` only when the choice actually moves */
	select(index: number): void {
		const option = this.options_[index];
		if (!option || option.disabled) return;
		if (index === this.selected_) {
			this.draw();
			return;
		}
		this.selected_ = index;
		this.draw();
		this.onChange.dispatch(index);
	}

	/**
	 * Steps the selection by `delta` rows, skipping disabled options and wrapping
	 * at both ends, the way a short settings group wants. Returns false when there
	 * is nothing selectable to move to, so a caller can beep rather than doing nothing.
	 */
	move(delta: number): boolean {
		const count = this.options_.length;
		if (count === 0) return false;
		let at = this.selected_;
		for (let tried = 0; tried < count; tried++) {
			at = (at + delta + count) % count;
			const option = this.options_[at];
			if (option && !option.disabled) {
				this.select(at);
				return true;
			}
		}
		return false;
	}

	/** @returns true when the action was used */
	handleAction(action: Action): boolean {
		switch (action) {
			case 'up':
			case 'left':
				return this.move(-1);
			case 'down':
			case 'right':
				return this.move(1);
			default:
				//nothing to confirm: arrows already select, the way native radio groups do
				return false;
		}
	}

	/** selects row `index` the way a tap does; a disabled row is a no-op */
	tapRow(index: number): void {
		this.select(index);
	}

	private defaultSelection(wanted?: number): number {
		if (wanted !== undefined) {
			const option = this.options_[wanted];
			if (option && !option.disabled) return wanted;
		}
		const first = this.options_.findIndex((option) => !option.disabled);
		return first === -1 ? -1 : first;
	}

	private buildRows(options: RadioOption[]): void {
		for (const row of this.rows) row.destroy({ children: true });
		this.rows = [];
		this.circles = [];
		this.options_ = [...options];
		this.removeChildren();

		options.forEach((option, i) => {
			const row = new Container();
			row.y = i * this.rowHeight;
			row.eventMode = 'static';
			row.cursor = option.disabled ? 'default' : 'pointer';
			row.on('pointertap', () => this.tapRow(i));

			const circle = new Graphics();
			row.addChild(circle);
			this.circles.push(circle);

			const label = new Label({ text: option.text });
			row.addChild(label);

			this.rows.push(row);
			this.addChild(row);
		});
	}

	private draw(): void {
		const t = theme();
		const rtl = t.direction === 'rtl';

		this.rows.forEach((row, i) => {
			const option = this.options_[i];
			const dim = option.disabled;
			const circle = this.circles[i];

			circle
				.clear()
				.circle(this.size_ / 2, this.size_ / 2, this.size_ / 2 - 1)
				.fill({ color: t.color.panelFill })
				.stroke({ color: dim ? t.color.textDim : t.color.panelBorder, width: 2 });

			if (i === this.selected_) {
				circle
					.circle(this.size_ / 2, this.size_ / 2, Math.max(2, this.size_ * 0.28))
					.fill({ color: dim ? t.color.textDim : t.color.textHighlight });
			}

			const textStart = this.size_ + t.spacing;
			const label = row.children.find((child): child is Label => child instanceof Label);
			const textWidth = label?.width ?? 0;
			if (label) {
				label.setColor(dim ? t.color.textDim : t.color.text);
				label.y = Math.round((this.size_ - label.height) / 2);
			}
			//mirrored per row, since rows have no shared width to align against
			if (rtl) {
				if (label) label.x = 0;
				circle.x = textWidth + t.spacing;
			} else {
				circle.x = 0;
				if (label) label.x = textStart;
			}
		});
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}
