import { Container, Graphics } from 'pixi.js';
import type { Action } from '../core/Input.ts';
import { Label } from './Label.ts';
import { theme } from './theme.ts';

export interface ListItem {
	/** what the row reads */
	text: string;

	/** a greyed-out row can be looked at but not chosen */
	disabled?: boolean;

	/** anything the game wants to get back when the row is chosen */
	value?: unknown;

	/** an icon drawn to the left of the text; sized to the row height */
	icon?: Container;
}

export interface ListViewOptions {
	width: number;
	height: number;
	items?: ListItem[];

	/** row height; defaults to the theme's line height */
	rowHeight?: number;

	onSelect?: (item: ListItem, index: number) => void;
	onHighlight?: (item: ListItem, index: number) => void;
}

/**
 * A scrolling list of rows, driven by the keyboard.
 *
 * This is the workhorse of an inventory-heavy game: bags, spell lists, shop stock,
 * dialogue choices, save slots. It scrolls by keeping the highlight in view rather than by
 * pixel offset, which is what makes it feel right with a keyboard — the list moves only
 * when the selection would otherwise leave the window.
 *
 * Rows that are `disabled` are skipped when moving, so holding a direction never lands on
 * something unusable.
 */
export class ListView extends Container {
	private items: ListItem[] = [];
	private rows: Container[] = [];

	private rowsLayer = new Container();
	private highlight = new Graphics();
	private mask_ = new Graphics();

	private viewWidth: number;
	private viewHeight: number;
	private rowHeight: number;

	private index = 0;
	private scroll = 0;

	onSelect: ((item: ListItem, index: number) => void) | null;
	onHighlight: ((item: ListItem, index: number) => void) | null;

	constructor(options: ListViewOptions) {
		super();

		const t = theme();
		this.viewWidth = options.width;
		this.viewHeight = options.height;
		this.rowHeight = options.rowHeight ?? Math.ceil(t.font.size * t.font.lineHeight) + t.spacing;
		this.onSelect = options.onSelect ?? null;
		this.onHighlight = options.onHighlight ?? null;

		this.addChild(this.highlight);
		this.addChild(this.rowsLayer);

		//rows outside the window are clipped rather than drawn over the frame
		this.addChild(this.mask_);
		this.rowsLayer.mask = this.mask_;
		this.drawMask();

		this.setItems(options.items ?? []);
	}

	private drawMask(): void {
		this.mask_.clear().rect(0, 0, this.viewWidth, this.viewHeight).fill({ color: 0xffffff });
	}

	get visibleRows(): number {
		return Math.max(1, Math.floor(this.viewHeight / this.rowHeight));
	}

	get selectedIndex(): number {
		return this.index;
	}

	get selected(): ListItem | null {
		return this.items[this.index] ?? null;
	}

	get length(): number {
		return this.items.length;
	}

	setItems(items: ListItem[]): void {
		this.items = items;

		for (const row of this.rows) row.destroy({ children: true });
		this.rows = [];
		this.rowsLayer.removeChildren();

		const t = theme();
		//in rtl the icon moves to the right edge and the text sits to its left, ending at
		//the same distance from that edge the ltr text starts from the left one
		const rtl = t.direction === 'rtl';

		items.forEach((item, i) => {
			const row = new Container();
			row.y = i * this.rowHeight;

			if (item.icon) {
				item.icon.x = rtl ? this.viewWidth - t.spacing - this.rowHeight : t.spacing;
				row.addChild(item.icon);
			}

			const label = new Label({
				text: item.text,
				color: item.disabled ? t.color.textDim : t.color.text,
			});
			const textStart = t.spacing + (item.icon ? this.rowHeight : 0);
			label.x = rtl ? this.viewWidth - textStart - label.width : textStart;
			//centre the text in its row rather than sitting it on the top edge
			label.y = Math.round((this.rowHeight - label.height) / 2);
			row.addChild(label);

			this.rows.push(row);
			this.rowsLayer.addChild(row);
		});

		this.index = this.items.findIndex((item) => !item.disabled);
		if (this.index === -1) this.index = 0;
		this.scroll = 0;
		this.refresh();
	}

	resize(width: number, height: number): void {
		this.viewWidth = width;
		this.viewHeight = height;
		this.drawMask();
		this.refresh();
	}

	/**
	 * Moves the highlight by `delta` rows, skipping disabled ones.
	 *
	 * Wraps at both ends, which is what a short menu wants. Returns false when there is
	 * nothing selectable to move to, so a caller can beep rather than doing nothing.
	 */
	move(delta: number): boolean {
		if (this.items.length === 0) return false;

		let next = this.index;
		//at most one full pass, so a list of entirely disabled rows terminates
		for (let step = 0; step < this.items.length; step++) {
			next = (next + delta + this.items.length) % this.items.length;
			if (!this.items[next].disabled) {
				this.index = next;
				this.refresh();
				this.onHighlight?.(this.items[next], next);
				return true;
			}
		}
		return false;
	}

	select(index: number): void {
		if (index < 0 || index >= this.items.length || this.items[index].disabled) return;
		this.index = index;
		this.refresh();
		this.onHighlight?.(this.items[index], index);
	}

	confirm(): boolean {
		const item = this.selected;
		if (!item || item.disabled) return false;
		this.onSelect?.(item, this.index);
		return true;
	}

	/** @returns true when the action was used */
	handleAction(action: Action): boolean {
		switch (action) {
			case 'up':
				return this.move(-1);
			case 'down':
				return this.move(1);
			case 'confirm':
				return this.confirm();
			default:
				return false;
		}
	}

	private refresh(): void {
		//scroll only as far as needed to bring the selection back into view, so the list
		//stays put while the highlight moves within it
		const visible = this.visibleRows;
		if (this.index < this.scroll) {
			this.scroll = this.index;
		} else if (this.index >= this.scroll + visible) {
			this.scroll = this.index - visible + 1;
		}
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.items.length - visible)));

		this.rowsLayer.y = -this.scroll * this.rowHeight;

		const t = theme();
		if (this.items.length === 0) {
			this.highlight.clear();
			return;
		}

		this.highlight
			.clear()
			.rect(0, (this.index - this.scroll) * this.rowHeight, this.viewWidth, this.rowHeight)
			.fill({ color: t.color.selection });
	}
}
