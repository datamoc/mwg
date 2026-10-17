import { CanvasTextMetrics, Container, Graphics, Point, TextStyle } from 'pixi.js';
import { Button } from './Button.ts';
import { Dropdown, type DropdownOptions } from './Dropdown.ts';
import { ScrollBox } from './ScrollBox.ts';
import { theme, themeChanged } from './theme.ts';

export interface DropdownViewOptions extends DropdownOptions {
	/** the closed button's width, and the list's; the least width when `autoWidth` is on */
	width: number;
	/** the height of the closed button and of each row of the open list; 28 when omitted */
	rowHeight?: number;
	/** rows shown at once; a longer list scrolls inside the box. 8 when omitted */
	maxVisibleRows?: number;
	/** widens the view to fit the longest label instead of cutting it off at `width` */
	autoWidth?: boolean;
}

/**
 * The widget for a `Dropdown` model: a button showing the current choice that opens a column
 * of buttons beneath it, the highlighted row marked with `Button.setSelected`. Picking a row
 * selects it, closes the list and fires the model's `onChange`; clicking the closed button
 * again closes it.
 *
 * The list sits on an opaque backdrop, shows at most `maxVisibleRows` rows and scrolls (wheel,
 * touch drag, keys, scrollbar) beyond that, opening with the chosen row in view. `autoWidth`
 * measures the labels so none is cut off. The keyboard goes through `handleKey` (arrows, Page,
 * Home, End, Enter, Escape) and a click elsewhere through `handleOutsideClick`, which the owning
 * scene forwards from its own input, since the view does not own the stage.
 *
 * The list is drawn in this container's own space below the button, so a game places the view
 * where the closed button should sit and keeps it above its siblings when it is open.
 *
 * @example
 * ```ts
 * import { DropdownView } from '@datamoc/mw_games/two-d/ui';
 *
 * const level = new DropdownView({
 * 	width: 180,
 * 	maxVisibleRows: 6,
 * 	options: Array.from({ length: 30 }, (_, i) => ({ label: `Level ${i + 1}` })),
 * });
 * level.model.onChange.add(({ index }) => console.log('chose', index));
 * level.model.open();
 * level.refresh();
 * level.handleKey('PageDown'); // the highlight moves a page, the list scrolls to it
 * ```
 */
export class DropdownView extends Container {
	readonly model: Dropdown;
	private width_: number;
	private readonly rowHeight: number;
	private readonly maxRows: number;
	private readonly head: Button;
	private readonly list = new Container();
	private readonly backdrop = new Graphics();
	private box: ScrollBox | null = null;
	private listHeight = 0;
	private readonly themeListener = () => this.refresh();

	constructor(options: DropdownViewOptions) {
		super();
		this.model = new Dropdown(options);
		this.rowHeight = options.rowHeight ?? 28;
		this.maxRows = Math.max(1, options.maxVisibleRows ?? 8);
		this.width_ = options.autoWidth
			? Math.max(options.width, ...this.model.options.map((option) => this.labelWidth(option.label)))
			: options.width;
		this.head = new Button({
			width: this.width_,
			height: this.rowHeight,
			text: '',
			disabled: this.model.disabled,
			onClick: () => {
				this.model.toggleOpen();
				this.refresh();
			},
		});
		this.list.y = this.rowHeight;
		this.list.addChild(this.backdrop);
		this.addChild(this.head, this.list);
		this.refresh();
		themeChanged.add(this.themeListener);
	}

	/** how wide `text` is as a row's caption, plus the button's own padding */
	protected measureLabel(text: string): number {
		try {
			const style = new TextStyle({ fontFamily: theme().font.family, fontSize: theme().font.size });
			return CanvasTextMetrics.measureText(text, style).width;
		} catch {
			//no canvas to measure with (a test, a server): an average glyph width instead
			return text.length * theme().font.size * 0.6;
		}
	}

	private labelWidth(text: string): number {
		return Math.ceil(this.measureLabel(text)) + 2 * theme().padding + 16;
	}

	/** the view's current width: `width`, or what the longest label needed with `autoWidth` */
	get viewWidth(): number {
		return this.width_;
	}

	/** how many rows the open list shows at once (fewer than `maxVisibleRows` for a short list) */
	get visibleRows(): number {
		return Math.min(this.maxRows, this.model.options.length);
	}

	/** the open list's scrolling box, or null while closed; its `offset` is what a test reads */
	get scroller(): ScrollBox | null {
		return this.box;
	}

	/** lets a list that would run off the bottom of a `height`-tall viewport show fewer rows */
	fitBelow(globalY: number, viewportHeight: number): number {
		const rows = Math.floor((viewportHeight - globalY - this.rowHeight) / this.rowHeight);
		return Math.max(1, Math.min(this.maxRows, rows));
	}

	/** redraws the closed label and the open list from the model; call after changing the model directly */
	refresh(): void {
		const model = this.model;
		this.head.setText(`${model.selected?.label ?? ''} ▾`);
		this.head.setDisabled(model.disabled);
		this.box?.destroy({ children: true });
		this.box = null;
		this.list.visible = model.isOpen;
		this.backdrop.clear();
		if (!model.isOpen) return;

		const rows = this.visibleRows;
		this.listHeight = rows * this.rowHeight;
		const t = theme();
		this.backdrop
			.rect(0, 0, this.width_, this.listHeight)
			.fill({ color: t.color.panelFill, alpha: 1 })
			.stroke({ color: t.color.panelBorder, width: 1 });

		const box = new ScrollBox({
			width: this.width_,
			height: this.listHeight,
			contentHeight: model.options.length * this.rowHeight,
			touch: true,
			lineHeight: this.rowHeight,
		});
		const rowWidth = this.width_ - (box.scrollable ? 8 : 0);
		model.options.forEach((option, index) => {
			const row = new Button({
				width: rowWidth,
				height: this.rowHeight,
				text: option.label,
				disabled: option.disabled,
				onClick: () => {
					model.setHighlight(index);
					model.confirm();
					this.refresh();
				},
			});
			row.y = index * this.rowHeight;
			row.setSelected(index === model.highlight);
			box.content.addChild(row);
		});
		box.scrollIntoView(model.highlight * this.rowHeight, this.rowHeight);
		this.box = box;
		this.list.addChild(box);
	}

	/**
	 * A key for the view: closed, Enter/Space/ArrowDown open it; open, the arrows, Page and Home/End
	 * move the highlight (the list scrolls to keep it in view), Enter picks it and Escape closes
	 * without changing the choice.
	 *
	 * @returns true when the key was used, so the caller does not also act on it
	 */
	handleKey(key: string): boolean {
		const model = this.model;
		if (model.disabled) return false;
		if (!model.isOpen) {
			if (key !== 'Enter' && key !== ' ' && key !== 'ArrowDown') return false;
			model.open();
			this.refresh();
			return true;
		}
		const count = model.options.length;
		switch (key) {
			case 'Escape':
				model.cancel();
				break;
			case 'Enter':
			case ' ':
				model.confirm();
				break;
			case 'ArrowUp':
				model.move(-1);
				break;
			case 'ArrowDown':
				model.move(1);
				break;
			case 'PageUp':
				model.setHighlight(Math.max(0, model.highlight - this.maxRows));
				break;
			case 'PageDown':
				model.setHighlight(Math.min(count - 1, model.highlight + this.maxRows));
				break;
			case 'Home':
				model.setHighlight(0);
				break;
			case 'End':
				model.setHighlight(count - 1);
				break;
			default:
				return false;
		}
		this.refresh();
		return true;
	}

	/**
	 * A press at a screen position: closes the open list, keeping the old choice, when it landed
	 * outside the button and the list.
	 *
	 * @returns true when it closed the list
	 */
	handleOutsideClick(globalX: number, globalY: number): boolean {
		if (!this.model.isOpen) return false;
		const local = this.toLocal(new Point(globalX, globalY));
		const inside =
			local.x >= 0 && local.x <= this.width_ && local.y >= 0 && local.y <= this.rowHeight + this.listHeight;
		if (inside) return false;
		this.model.cancel();
		this.refresh();
		return true;
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}
