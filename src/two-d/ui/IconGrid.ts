import { Container, Graphics } from 'pixi.js';
import type { Action } from '../../core/Input.ts';
import { Label } from './Label.ts';
import { SelectionModel } from './SelectionModel.ts';
import { theme, themeChanged } from './theme.ts';
import type { Container2D } from '../render/Types2D.ts';

export interface IconGridItem {
	/** the icon drawn in the cell, sized to fit it */
	icon: Container2D;

	/** a greyed-out cell can be looked at but not chosen */
	disabled?: boolean;

	/** anything the game wants to get back when the cell is chosen */
	value?: unknown;

	/** a stack count drawn as a small badge in the corner; 1 or omitted draws no badge */
	quantity?: number;
}

export interface IconGridOptions {
	width: number;
	height: number;

	/** cells per row */
	columns: number;

	items?: IconGridItem[];

	/** side length of one cell; defaults to the width divided evenly across `columns` */
	cellSize?: number;

	/** seconds a cell must be held before it fires `onQuickslot` instead of a tap */
	longPressDuration?: number;

	onSelect?: (item: IconGridItem, index: number) => void;
	onHighlight?: (item: IconGridItem, index: number) => void;

	/** a cell held past `longPressDuration` - assigning it to a hotbar, typically */
	onQuickslot?: (item: IconGridItem, index: number) => void;

	/** one cell tapped, then a second - the game's own call what reordering means */
	onReorder?: (fromIndex: number, toIndex: number) => void;
}

/**
 * A grid of icons, driven by the keyboard or the pointer.
 *
 * `ListView` is a menu; this is a bag. SPD-sized item counts read better as rows of icons
 * than as a scrolling list of names, and a grid is what supports two cells apart in the same
 * row being adjacent choices rather than everything being one long column.
 *
 * Reordering is tap-then-tap, not a continuously-dragged ghost sprite: touch one cell to
 * pick it up, touch a second to swap them. It reads as "drag and drop" to a player and costs
 * none of the drag-threshold and global-pointer-tracking fragility an actually-followed ghost
 * sprite would - and unlike a live drag, every step of it is a plain method call a test can
 * drive without simulating pointer events at all.
 *
 * @example
 * ```ts
 * import { IconGrid } from '@datamoc/mw_games/two-d/ui';
 * import { Shape2D } from '@datamoc/mw_games/two-d/render';
 *
 * const potionIcon = new Shape2D().rect(0, 0, 16, 16).fill(0x66cc66);
 * const swordIcon = new Shape2D().rect(0, 0, 16, 16).fill(0xcccccc);
 *
 * const bag = new IconGrid({
 * 	width: 160,
 * 	height: 80,
 * 	columns: 4,
 * 	items: [
 * 		{ icon: potionIcon, quantity: 3 },
 * 		{ icon: swordIcon },
 * 	],
 * 	onSelect: (item, index) => console.log('used', index, item.value),
 * });
 *
 * bag.handleAction('right'); // moves the highlight to the sword
 * bag.handleAction('confirm'); // fires onSelect for the highlighted cell
 * ```
 */
export class IconGrid extends Container {
	private readonly selection = new SelectionModel<IconGridItem>({
		onChange: () => this.refresh(),
		onHighlight: (item, index) => this.onHighlight?.(item, index),
	});
	private cells: Container[] = [];

	private cellsLayer = new Container();
	private highlight = new Graphics();
	private pickupHighlight = new Graphics();
	private mask_ = new Graphics();

	private viewWidth: number;
	private viewHeight: number;
	private columns: number;
	private cellSize: number;
	private longPressDuration: number;

	private scrollRow = 0;

	/** the cell a first tap picked up, awaiting a second tap to swap with */
	private pickedUp: number | null = null;

	private pressedIndex: number | null = null;
	private pressTimer = 0;

	onSelect: ((item: IconGridItem, index: number) => void) | null;
	onHighlight: ((item: IconGridItem, index: number) => void) | null;
	onQuickslot: ((item: IconGridItem, index: number) => void) | null;
	onReorder: ((fromIndex: number, toIndex: number) => void) | null;

	/**
	 * Recolours quantity badges in place rather than through `setItems`: an item's `icon` is
	 * a `Container` the caller owns, and `setItems`'s teardown destroys a cell's children on
	 * the way out (see `swapCells`'s own doc comment) - routing a restyle through it would
	 * destroy the very icons still referenced by the selection's items.
	 */
	private readonly themeListener = () => {
		const t = theme();
		const items = this.selection.items;
		items.forEach((item, i) => {
			const cell = this.cells[i];
			if (!cell) return;
			cell.x = this.columnX(i % this.columns);

			if ((item.quantity ?? 1) <= 1) return;
			const badge = cell.children.find((child): child is Label => child instanceof Label);
			badge?.setColor(t.color.textHighlight);
		});
		this.refresh();
	};

	/** a column's x, mirrored under `theme().direction === 'rtl'` so column 0 sits at the reading-start edge */
	private columnX(col: number): number {
		const rtl = theme().direction === 'rtl';
		return (rtl ? this.columns - 1 - col : col) * this.cellSize;
	}

	constructor(options: IconGridOptions) {
		super();

		this.viewWidth = options.width;
		this.viewHeight = options.height;
		this.columns = Math.max(1, options.columns);
		this.cellSize = options.cellSize ?? Math.floor(this.viewWidth / this.columns);
		this.longPressDuration = options.longPressDuration ?? 0.6;

		this.onSelect = options.onSelect ?? null;
		this.onHighlight = options.onHighlight ?? null;
		this.onQuickslot = options.onQuickslot ?? null;
		this.onReorder = options.onReorder ?? null;

		this.addChild(this.highlight);
		this.addChild(this.pickupHighlight);
		this.addChild(this.cellsLayer);

		//cells below the window are clipped rather than drawn over the frame
		this.addChild(this.mask_);
		this.cellsLayer.mask = this.mask_;
		this.drawMask();

		//a masked grid with no click support (before this session) or wheel support was
		//otherwise unreachable past the visible rows without the keyboard - the same gap
		//`ListView`'s own wheel handling closed there, one row per notch here too
		this.eventMode = 'static';
		this.on('wheel', (event) => this.move(0, event.deltaY > 0 ? 1 : -1));

		this.setItems(options.items ?? []);
		themeChanged.add(this.themeListener);
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}

	private drawMask(): void {
		this.mask_.clear().rect(0, 0, this.viewWidth, this.viewHeight).fill({ color: 0xffffff });
	}

	get visibleRows(): number {
		return Math.max(1, Math.floor(this.viewHeight / this.cellSize));
	}

	get rows(): number {
		return Math.max(1, Math.ceil(this.selection.length / this.columns));
	}

	get selectedIndex(): number {
		return this.selection.selectedIndex;
	}

	get selected(): IconGridItem | null {
		return this.selection.selected;
	}

	get length(): number {
		return this.selection.length;
	}

	setItems(items: IconGridItem[]): void {
		this.pickedUp = null;
		this.pressedIndex = null;

		for (const cell of this.cells) cell.destroy({ children: true });
		this.cells = [];
		this.cellsLayer.removeChildren();

		const t = theme();

		items.forEach((item, i) => {
			const row = Math.floor(i / this.columns);
			const col = i % this.columns;

			const cell = new Container();
			cell.x = this.columnX(col);
			cell.y = row * this.cellSize;
			cell.eventMode = 'static';
			cell.cursor = item.disabled ? 'default' : 'pointer';

			item.icon.x = Math.round((this.cellSize - item.icon.width) / 2);
			item.icon.y = Math.round((this.cellSize - item.icon.height) / 2);
			if (item.disabled) item.icon.alpha = 0.4;
			cell.addChild(item.icon);

			if ((item.quantity ?? 1) > 1) {
				const badge = new Label({ text: String(item.quantity), size: 10, color: t.color.textHighlight });
				badge.x = this.cellSize - badge.width - 2;
				badge.y = this.cellSize - badge.height - 1;
				cell.addChild(badge);
			}

			cell.on('pointerdown', () => {
				this.pressedIndex = i;
				this.pressTimer = 0;
			});
			cell.on('pointerup', () => this.releaseCell(i));
			cell.on('pointerupoutside', () => this.releaseCell(i));

			this.cells.push(cell);
			this.cellsLayer.addChild(cell);
		});

		this.selection.reset(items);
		this.scrollRow = 0;
		this.refresh();
	}

	private releaseCell(index: number): void {
		if (this.pressedIndex !== index) return;
		this.pressedIndex = null;
		//still under the long-press threshold when released - a tap, not a quickslot
		if (!this.selection.items[index]?.disabled) this.tapCell(index);
	}

	resize(width: number, height: number): void {
		this.viewWidth = width;
		this.viewHeight = height;
		this.drawMask();
		this.refresh();
	}

	/**
	 * A frame-driven long-press timer, the same shape as `WindowStack.update` - no raw
	 * `setTimeout`, so a test can drive it exactly by calling `update` rather than waiting on
	 * a real clock.
	 */
	update(dt: number): void {
		if (this.pressedIndex === null) return;

		this.pressTimer += dt;
		if (this.pressTimer < this.longPressDuration) return;

		const index = this.pressedIndex;
		this.pressedIndex = null; //fires once; releasing afterwards is not also a tap

		const item = this.selection.items[index];
		if (item && !item.disabled) this.onQuickslot?.(item, index);
	}

	/** first tap on a cell picks it up; a second tap on another swaps the two */
	tapCell(index: number): void {
		const items = this.selection.items;
		if (index < 0 || index >= items.length) return;

		if (this.pickedUp === null) {
			if (items[index].disabled) return;
			this.pickedUp = index;
			this.refresh();
			return;
		}

		const from = this.pickedUp;
		this.pickedUp = null;

		if (from !== index) {
			this.swapCells(from, index);
			this.onReorder?.(from, index);
		}
		this.refresh();
	}

	/**
	 * Swaps two cells' contents in place, rather than rebuilding through `setItems`.
	 *
	 * An icon is a `Container` the caller owns and hands in once; `setItems`'s teardown
	 * destroys a cell's children on the way out; rebuilding through it after a swap would
	 * destroy the very icons the swap means to keep. Moving each cell's children to the
	 * other cell sidesteps that - nothing is ever destroyed, so the icon and its quantity
	 * badge survive together, wherever the swap sends them.
	 */
	private swapCells(a: number, b: number): void {
		const items = this.selection.items;
		this.selection.swap(a, b);

		const cellA = this.cells[a];
		const cellB = this.cells[b];
		const childrenA = cellA.removeChildren();
		const childrenB = cellB.removeChildren();
		for (const child of childrenB) cellA.addChild(child);
		for (const child of childrenA) cellB.addChild(child);

		cellA.cursor = items[a].disabled ? 'default' : 'pointer';
		cellB.cursor = items[b].disabled ? 'default' : 'pointer';
	}

	/** cancels a pending pick-up without swapping anything - what `cancel` should do */
	cancelPickup(): void {
		this.pickedUp = null;
		this.refresh();
	}

	/**
	 * Moves the highlight by a row/column step, skipping disabled cells.
	 *
	 * Wraps at both ends of the grid, the same as `ListView.move`. `dx`/`dy` step by one cell
	 * each; a caller wanting arrow-key navigation passes `(±1, 0)` or `(0, ±1)`.
	 */
	move(dx: number, dy: number): boolean {
		const rows = this.rows;
		const columns = this.columns;
		return this.selection.step((from) => {
			const row = (Math.floor(from / columns) + dy + rows) % rows;
			const col = ((from % columns) + dx + columns) % columns;
			return row * columns + col;
		}, rows * columns);
	}

	select(index: number): void {
		this.selection.select(index);
	}

	confirm(): boolean {
		return this.selection.confirm(this.onSelect);
	}

	/** @returns true when the action was used */
	handleAction(action: Action): boolean {
		switch (action) {
			case 'up':
				return this.move(0, -1);
			case 'down':
				return this.move(0, 1);
			case 'left':
				return this.move(theme().direction === 'rtl' ? 1 : -1, 0);
			case 'right':
				return this.move(theme().direction === 'rtl' ? -1 : 1, 0);
			case 'confirm':
				return this.confirm();
			case 'cancel':
				if (this.pickedUp === null) return false;
				this.cancelPickup();
				return true;
			default:
				return false;
		}
	}

	/** the pixel rect a cell index occupies within `cellsLayer` */
	private cellRect(index: number): { x: number; y: number } {
		return {
			x: this.columnX(index % this.columns),
			y: Math.floor(index / this.columns) * this.cellSize,
		};
	}

	private refresh(): void {
		const visible = this.visibleRows;
		const index = this.selection.selectedIndex;
		const selectedRow = Math.floor(index / this.columns);
		if (selectedRow < this.scrollRow) {
			this.scrollRow = selectedRow;
		} else if (selectedRow >= this.scrollRow + visible) {
			this.scrollRow = selectedRow - visible + 1;
		}
		this.scrollRow = Math.max(0, Math.min(this.scrollRow, Math.max(0, this.rows - visible)));

		this.cellsLayer.y = -this.scrollRow * this.cellSize;

		const t = theme();
		this.pickupHighlight.clear();
		if (this.pickedUp !== null) {
			const { x, y } = this.cellRect(this.pickedUp);
			this.pickupHighlight
				.rect(x, y, this.cellSize, this.cellSize)
				.stroke({ color: t.color.textHighlight, width: 2 });
		}

		this.highlight.clear();
		if (this.selection.length > 0) {
			const { x, y } = this.cellRect(index);
			this.highlight.rect(x, y, this.cellSize, this.cellSize).fill({ color: t.color.selection });
		}
	}
}
