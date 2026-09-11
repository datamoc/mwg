import { Signal } from '../../core/Signal.ts';

/** One tab: an id the caller's `rowsFor` understands, and the label a tab strip draws. */
export interface ListTab {
	id: string;
	label: string;

	/** a tab a player can see but not open */
	disabled?: boolean;
}

export interface TabbedListOptions<T> {
	/** the tabs, in display order; the first is selected at construction */
	tabs: readonly ListTab[];

	/** the rows of one tab before the query filter; the caller owns what a row is */
	rowsFor: (tabId: string) => readonly T[];

	/** how many rows make a page; 0 or omitted means every row is one page */
	pageSize?: number;

	/** the row's display text; defaults to `String(row)` */
	label?: (row: T) => string;

	/**
	 * Whether a row survives the current query. Defaults to the row's label containing the
	 * query, case-insensitively; an empty query keeps every row.
	 */
	filter?: (row: T, query: string) => boolean;

	/** a row a player can see but not choose; `move` skips it */
	disabled?: (row: T) => boolean;
}

/**
 * The model behind a tabbed, searchable, paged list - an inventory, journal, shop or codex -
 * kept apart from how it is drawn, the same split `SelectionModel` already draws for plain
 * lists. The caller supplies the tabs and the rows per tab (any type it likes, so no item
 * taxonomy is assumed), plus optionally how a row labels, filters and disables itself; this
 * owns the tab choice, the query, the selection, the page and the detail/close state.
 *
 * The page is derived from the selection rather than tracked beside it: a selection index
 * into the filtered rows decides which page is visible, so the two can never disagree and
 * `nextPage` is just a selection move of one page. `move` skips disabled rows.
 *
 * Rendering is the caller's: read `pageRows` and `selectedIndex` each frame, or listen to
 * `onChange`.
 *
 * @example
 * ```ts
 * import { TabbedList } from '@datamoc/mw_games/two-d/ui';
 *
 * const items = [
 *   { name: 'Sword', kind: 'weapon' },
 *   { name: 'Bread', kind: 'food' },
 *   { name: 'Shield', kind: 'armor' },
 * ];
 *
 * const list = new TabbedList<(typeof items)[number]>({
 *   tabs: [{ id: 'all', label: 'All' }, { id: 'weapon', label: 'Weapons' }],
 *   rowsFor: (tab) => (tab === 'all' ? items : items.filter((item) => item.kind === tab)),
 *   label: (item) => item.name,
 *   pageSize: 2,
 * });
 *
 * console.log(list.selected?.name); // 'Sword'
 * list.setQuery('sh'); // filter down to Shield; selection and page reset
 * console.log(list.rows.length, list.page); // 1 0
 * list.openDetail(); // true, with the current row
 * ```
 */
export class TabbedList<T> {
	/** fires whenever the tab, query, selection, page or detail state changes */
	readonly onChange = new Signal<void>();

	private readonly tabList: readonly ListTab[];
	private readonly rowsFor: (tabId: string) => readonly T[];
	private readonly pageSize: number;
	private readonly labelOf: (row: T) => string;
	private readonly filterOf: (row: T, query: string) => boolean;
	private readonly disabledOf: (row: T) => boolean;

	private currentTabIndex = 0;
	private currentQuery = '';
	private rows_: T[] = [];
	private currentSelectedIndex = 0;
	private detail = false;

	constructor(options: TabbedListOptions<T>) {
		if (options.tabs.length === 0) throw new Error('TabbedList needs at least one tab');
		this.tabList = [...options.tabs];
		this.rowsFor = options.rowsFor;
		this.pageSize = Math.max(0, Math.floor(options.pageSize ?? 0));
		this.labelOf = options.label ?? ((row) => String(row));
		this.filterOf =
			options.filter ??
			((row, query) => (query === '' ? true : this.labelOf(row).toLowerCase().includes(query.toLowerCase())));
		this.disabledOf = options.disabled ?? (() => false);
		this.recompute();
	}

	/** every tab, in display order, for a tab strip to draw */
	get tabs(): readonly ListTab[] {
		return this.tabList;
	}

	/** the currently open tab */
	get tab(): ListTab {
		return this.tabList[this.currentTabIndex];
	}

	get query(): string {
		return this.currentQuery;
	}

	/** the filtered rows of the current tab, across every page */
	get rows(): readonly T[] {
		return this.rows_;
	}

	/** how many pages `rows` fills; always at least 1, so an empty list is one empty page */
	get pageCount(): number {
		if (this.pageSize <= 0) return 1;
		return Math.max(1, Math.ceil(this.rows_.length / this.pageSize));
	}

	/** the page the selection is on, derived from it rather than tracked next to it */
	get page(): number {
		if (this.pageSize <= 0) return 0;
		return Math.floor(this.currentSelectedIndex / this.pageSize);
	}

	/** the rows the current page shows */
	get pageRows(): readonly T[] {
		if (this.pageSize <= 0) return this.rows_;
		const start = this.page * this.pageSize;
		return this.rows_.slice(start, start + this.pageSize);
	}

	/** the selection's index into `rows` (not into `pageRows`) */
	get selectedIndex(): number {
		return this.currentSelectedIndex;
	}

	get selected(): T | null {
		return this.rows_[this.currentSelectedIndex] ?? null;
	}

	/** whether the detail view has been opened for the current selection */
	get detailOpen(): boolean {
		return this.detail;
	}

	/** opens `id`'s tab; a disabled tab or an unknown id is ignored */
	selectTab(id: string): void {
		const index = this.tabList.findIndex((tab) => tab.id === id);
		if (index === -1 || this.tabList[index].disabled) return;
		if (index === this.currentTabIndex) return;
		this.currentTabIndex = index;
		this.recompute();
		this.emit();
	}

	/** moves to the next enabled tab, `delta` steps on (wrapping); skips disabled tabs */
	nextTab(delta = 1): void {
		if (delta === 0) return;
		const step = delta > 0 ? 1 : -1;
		let index = this.currentTabIndex;
		for (let moved = 0; moved < Math.abs(delta); moved++) {
			do {
				index = (index + step + this.tabList.length) % this.tabList.length;
			} while (this.tabList[index].disabled && index !== this.currentTabIndex);
		}
		if (index === this.currentTabIndex) return;
		this.currentTabIndex = index;
		this.recompute();
		this.emit();
	}

	/** replaces the query; the selection and page reset to the first row that survives it */
	setQuery(query: string): void {
		if (query === this.currentQuery) return;
		this.currentQuery = query;
		this.recompute();
		this.emit();
	}

	/** moves the selection `delta` rows, skipping disabled ones and clamping at both ends */
	move(delta: number): void {
		if (delta === 0 || this.rows_.length === 0) return;
		const step = delta > 0 ? 1 : -1;
		let index = this.currentSelectedIndex;
		for (let moved = 0; moved < Math.abs(delta); moved++) {
			let candidate = index;
			do {
				candidate += step;
			} while (candidate >= 0 && candidate < this.rows_.length && this.disabledOf(this.rows_[candidate]));
			if (candidate < 0 || candidate >= this.rows_.length) break;
			index = candidate;
		}
		if (index === this.currentSelectedIndex) return;
		this.currentSelectedIndex = index;
		this.emit();
	}

	/** jumps to a page by number, clamped; the selection moves to its first selectable row */
	setPage(page: number): void {
		const target = Math.max(0, Math.min(this.pageCount - 1, Math.floor(page)));
		if (this.pageSize <= 0) return;
		const first = this.firstSelectableOnPage(target);
		if (first === this.currentSelectedIndex) return;
		this.currentSelectedIndex = first;
		this.emit();
	}

	/** moves `delta` pages; the selection lands on the target page's first selectable row */
	nextPage(delta: number): void {
		this.setPage(this.page + delta);
	}

	/** opens the detail view for the current selection; false when there is nothing to open */
	openDetail(): boolean {
		if (this.selected === null || this.disabledOf(this.selected)) return false;
		if (!this.detail) {
			this.detail = true;
			this.emit();
		}
		return true;
	}

	closeDetail(): void {
		if (!this.detail) return;
		this.detail = false;
		this.emit();
	}

	/** the first row on `page` that is not disabled, or its first row when all are */
	private firstSelectableOnPage(page: number): number {
		const start = page * this.pageSize;
		const end = Math.min(this.rows_.length, start + this.pageSize);
		for (let i = start; i < end; i++) {
			if (!this.disabledOf(this.rows_[i])) return i;
		}
		return Math.min(start, Math.max(0, this.rows_.length - 1));
	}

	private firstSelectable(from: number): number {
		for (let i = from; i < this.rows_.length; i++) {
			if (!this.disabledOf(this.rows_[i])) return i;
		}
		return 0;
	}

	/** rebuilds the visible rows and parks the selection on the first selectable one */
	private recompute(): void {
		const all = this.rowsFor(this.tab.id);
		const filtered = all.filter((row) => this.filterOf(row, this.currentQuery));
		this.rows_ = filtered;
		this.currentSelectedIndex = filtered.length === 0 ? 0 : this.firstSelectable(0);
		this.detail = false;
	}

	private emit(): void {
		this.onChange.dispatch();
	}
}
