import { Container, Graphics } from 'pixi.js';
import type { Action } from '../../core/Input.ts';
import { Label } from './Label.ts';
import { SelectionModel } from './SelectionModel.ts';
import { theme, themeChanged } from './theme.ts';
import type { Container2D } from '../render/Types2D.ts';

export interface ListItem {
	/** what the row reads */
	text: string;

	/** a greyed-out row can be looked at but not chosen */
	disabled?: boolean;

	/** anything the game wants to get back when the row is chosen */
	value?: unknown;

	/** an icon drawn to the left of the text; sized to the row height */
	icon?: Container2D;
}

export interface ListViewOptions {
	width: number;
	height: number;
	items?: ListItem[];

	/** row height; defaults to the theme's line height */
	rowHeight?: number;

	onSelect?: (item: ListItem, index: number) => void;
	onHighlight?: (item: ListItem, index: number) => void;

	/**
	 * check-rather-than-pick rows: arrows move the highlight, confirm and tap toggle
	 * a check instead of choosing, and the game reads `checkedIndexes` when it is done.
	 * Off by default, which keeps the pick-one menu this list has always been.
	 */
	multiple?: boolean;
	onToggle?: (item: ListItem, index: number, checked: boolean) => void;
}

/**
 * A scrolling list of rows, driven by the keyboard.
 *
 * This is the workhorse of an inventory-heavy game: bags, spell lists, shop stock,
 * dialogue choices, save slots. It scrolls by keeping the highlight in view rather than by
 * pixel offset, which is what makes it feel right with a keyboard: the list moves only
 * when the selection would otherwise leave the window.
 *
 * Rows that are `disabled` are skipped when moving, so holding a direction never lands on
 * something unusable.
 *
 * @example
 * ```ts
 * import { ListView } from '@datamoc/mw_games/two-d/ui';
 *
 * const menu = new ListView({
 * 	width: 160,
 * 	height: 96,
 * 	items: [
 * 		{ text: 'Attack' },
 * 		{ text: 'Item' },
 * 		{ text: 'Flee', disabled: true },
 * 	],
 * 	onSelect: (item, index) => console.log('chose', item.text, index),
 * });
 *
 * menu.handleAction('down'); // highlights "Item"
 * menu.handleAction('confirm'); // fires onSelect for the highlighted row
 * ```
 */
export class ListView extends Container {
	private readonly selection = new SelectionModel<ListItem>({
		onChange: () => this.refresh(),
		onHighlight: (item, index) => this.onHighlight?.(item, index),
	});
	private rows: Container[] = [];

	private rowsLayer = new Container();
	private highlight = new Graphics();
	private mask_ = new Graphics();

	private viewWidth: number;
	private viewHeight: number;
	private rowHeight: number;
	private readonly explicitRowHeight: boolean;

	private scroll = 0;

	private readonly themeListener = () => this.restyle();

	onSelect: ((item: ListItem, index: number) => void) | null;
	onHighlight: ((item: ListItem, index: number) => void) | null;
	onToggle: ((item: ListItem, index: number, checked: boolean) => void) | null;
	private multiple: boolean;
	private checked = new Set<number>();
	private ticks: Graphics[] = [];

	constructor(options: ListViewOptions) {
		super();

		const t = theme();
		this.viewWidth = options.width;
		this.viewHeight = options.height;
		this.explicitRowHeight = options.rowHeight !== undefined;
		this.rowHeight = options.rowHeight ?? Math.ceil(t.font.size * t.font.lineHeight) + t.spacing;
		this.onSelect = options.onSelect ?? null;
		this.onHighlight = options.onHighlight ?? null;
		this.onToggle = options.onToggle ?? null;
		this.multiple = options.multiple ?? false;

		this.addChild(this.highlight);
		this.addChild(this.rowsLayer);

		//rows outside the window are clipped rather than drawn over the frame
		this.addChild(this.mask_);
		this.rowsLayer.mask = this.mask_;
		this.drawMask();

		//a masked list with no click support (before this session) or wheel support was
		//otherwise unreachable past the visible rows without the keyboard; one row per
		//notch, the same step `move` already takes for an arrow key, since scroll is
		//derived from the selection rather than an independent pixel offset (see this
		//class's own doc comment) - a free-scrolling wheel would fight that invariant
		this.eventMode = 'static';
		this.on('wheel', (event) => this.move(event.deltaY > 0 ? 1 : -1));

		this.setItems(options.items ?? []);
		themeChanged.add(this.themeListener);
	}

	/**
	 * Recolours rows and the default row height from the new theme in place, rather than
	 * through `setItems`: a row's optional `icon` is a `Container` the caller owns, and
	 * `setItems`'s teardown destroys a row's children on the way out - routing a restyle
	 * through it would destroy the very icons still referenced by the selection's items,
	 * the same trap `IconGrid.swapCells`'s own doc comment describes for its cells.
	 */
	private restyle(): void {
		const t = theme();
		if (!this.explicitRowHeight) {
			this.rowHeight = Math.ceil(t.font.size * t.font.lineHeight) + t.spacing;
		}
		const rtl = t.direction === 'rtl';
		const items = this.selection.items;

		this.rows.forEach((row, i) => {
			row.y = i * this.rowHeight;
			const item = items[i];

			const label = row.children.find((child): child is Label => child instanceof Label);
			if (label) {
				label.setColor(item.disabled ? t.color.textDim : t.color.text);
				const textStart = t.spacing + this.checkAdvance() + (item.icon ? this.rowHeight : 0);
				label.x = rtl ? this.viewWidth - textStart - label.width : textStart;
				label.y = Math.round((this.rowHeight - label.height) / 2);
			}
			if (item.icon) {
				item.icon.x = rtl
					? this.viewWidth - t.spacing - this.checkAdvance() - this.rowHeight
					: t.spacing + this.checkAdvance();
			}
		});

		this.updateTicks();
		this.refresh();
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}

	private drawMask(): void {
		this.mask_.clear().rect(0, 0, this.viewWidth, this.viewHeight).fill({ color: 0xffffff });
	}

	get visibleRows(): number {
		return Math.max(1, Math.floor(this.viewHeight / this.rowHeight));
	}

	get selectedIndex(): number {
		return this.selection.selectedIndex;
	}

	get selected(): ListItem | null {
		return this.selection.selected;
	}

	get length(): number {
		return this.selection.length;
	}

	setItems(items: ListItem[]): void {
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
			row.eventMode = 'static';
			row.cursor = item.disabled ? 'default' : 'pointer';
			//a tap selects and confirms in one step, the way a mouse/touch player expects
			//from a menu row - IconGrid's cells already work this way, this closes the same
			//gap on ListView, which was keyboard-only until now
			row.on('pointerdown', () => this.tapRow(i));

			if (item.icon) {
				item.icon.x = rtl
					? this.viewWidth - t.spacing - this.checkAdvance() - this.rowHeight
					: t.spacing + this.checkAdvance();
				row.addChild(item.icon);
			}

			const label = new Label({
				text: item.text,
				color: item.disabled ? t.color.textDim : t.color.text,
			});
			const textStart = t.spacing + this.checkAdvance() + (item.icon ? this.rowHeight : 0);
			label.x = rtl ? this.viewWidth - textStart - label.width : textStart;
			//centre the text in its row rather than sitting it on the top edge
			label.y = Math.round((this.rowHeight - label.height) / 2);
			row.addChild(label);

			this.rows.push(row);
			this.rowsLayer.addChild(row);
		});

		this.selection.reset(items);
		this.checked.clear();
		this.rebuildTicks();
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
		return this.selection.step((from, count) => (from + delta + count) % count, this.selection.length);
	}

	select(index: number): void {
		this.selection.select(index);
	}

	confirm(): boolean {
		if (this.multiple) return this.toggleChecked(this.selection.selectedIndex);
		return this.selection.confirm(this.onSelect);
	}

	/**
	 * Selects and confirms row `index` in one step, the way a mouse or touch player expects
	 * from a menu row rather than a select-then-confirm keyboard sequence - the same pointer
	 * parity `IconGrid.tapCell` already gives its cells. A disabled row is a no-op, the same
	 * as an out-of-range one. This is what a row's own `pointerdown` handler calls, so a game
	 * driving the list programmatically (a test, a gamepad-to-pointer bridge) reaches the
	 * exact behaviour a real tap would.
	 */
	tapRow(index: number): void {
		const items = this.selection.items;
		if (index < 0 || index >= items.length || items[index].disabled) return;
		this.select(index);
		this.confirm();
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

	get checkedIndexes(): number[] {
		return [...this.checked].sort((a, b) => a - b);
	}

	isChecked(index: number): boolean {
		return this.checked.has(index);
	}

	/** checks or unchecks a row, firing `onToggle` only when the mark actually moves */
	setChecked(index: number, checked: boolean): void {
		const item = this.selection.items[index];
		if (!item || item.disabled) return;
		if (this.checked.has(index) === checked) return;
		if (checked) this.checked.add(index);
		else this.checked.delete(index);
		this.updateTicks();
		this.onToggle?.(item, index, checked);
	}

	/** flips a row’s check; false for out-of-range and disabled rows */
	toggleChecked(index: number): boolean {
		const item = this.selection.items[index];
		if (!item || item.disabled) return false;
		this.setChecked(index, !this.checked.has(index));
		return true;
	}

	/** unchecks everything silently, the way `setItems` starts unchecked */
	clearChecked(): void {
		if (this.checked.size === 0) return;
		this.checked.clear();
		this.updateTicks();
	}

	/** the check box side, so text and icons indent past it in multiple mode */
	private checkAdvance(): number {
		return this.multiple ? this.checkBox() + theme().spacing : 0;
	}

	private checkBox(): number {
		return Math.max(12, this.rowHeight - 8);
	}

	private rebuildTicks(): void {
		this.ticks = [];
		if (!this.multiple) return;
		for (const row of this.rows) {
			const tick = new Graphics();
			row.addChildAt(tick, 0);
			this.ticks.push(tick);
		}
		this.updateTicks();
	}

	private updateTicks(): void {
		const t = theme();
		const rtl = t.direction === 'rtl';
		const box = this.checkBox();
		const y = Math.round((this.rowHeight - box) / 2);
		this.ticks.forEach((tick, i) => {
			const dim = this.selection.items[i]?.disabled ?? true;
			tick.clear()
				.rect(0, 0, box, box)
				.fill({ color: t.color.panelFill })
				.stroke({ color: dim ? t.color.textDim : t.color.panelBorder, width: 2 });
			if (this.checked.has(i)) {
				const inset = box * 0.25;
				tick.moveTo(inset, box * 0.55)
					.lineTo(box * 0.45, box - inset)
					.lineTo(box - inset, inset)
					.stroke({
						color: dim ? t.color.textDim : t.color.textHighlight,
						width: Math.max(2, box * 0.12),
						cap: 'round',
						join: 'round',
					});
			}
			tick.x = rtl ? this.viewWidth - t.spacing - box : t.spacing;
			tick.y = y;
		});
	}

	private refresh(): void {
		//scroll only as far as needed to bring the selection back into view, so the list
		//stays put while the highlight moves within it
		const visible = this.visibleRows;
		const index = this.selection.selectedIndex;
		const length = this.selection.length;
		if (index < this.scroll) {
			this.scroll = index;
		} else if (index >= this.scroll + visible) {
			this.scroll = index - visible + 1;
		}
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, length - visible)));

		this.rowsLayer.y = -this.scroll * this.rowHeight;

		const t = theme();
		if (length === 0) {
			this.highlight.clear();
			return;
		}

		this.highlight
			.clear()
			.rect(0, (index - this.scroll) * this.rowHeight, this.viewWidth, this.rowHeight)
			.fill({ color: t.color.selection });
	}
}
