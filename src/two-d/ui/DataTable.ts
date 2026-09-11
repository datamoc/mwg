import { Signal } from '../../core/Signal.ts';

export interface TableColumn<T> {
	/** the key a sort reads when the column has no `compare` */
	key: string;
	/** the header caption; a game may still draw its own */
	label?: string;
	width?: number;
	align?: 'left' | 'right' | 'center';
	/** how to sort this column; `row[key]` compared generically when omitted */
	compare?: (a: T, b: T) => number;
}

export interface DataTableOptions<T> {
	columns: readonly TableColumn<T>[];
	rows?: readonly T[];
	/** rows per page; 0 or omitted means one page, no paging */
	pageSize?: number;
	/** rows the highlight skips, the way `ListView` skips a disabled item */
	disabled?: (row: T) => boolean;
}

/**
 * A columned table with a highlighted row, a sort order and paging - the roster or inventory grid
 * that wants headers and a stable sort, where `ListView` is a flat one-column list.
 *
 * Renderer-free, like `TabbedList`: it holds the columns, the rows, the sort, the highlight and
 * the current page, and a game draws the cells. The page is *derived* from the highlighted row
 * rather than tracked beside it, so the two can never disagree; `setPage` is the only thing that
 * moves the highlight on its own, and it lands on the first selectable row of that page.
 *
 * @example
 * ```ts
 * import { DataTable } from '@datamoc/mw_games/two-d/ui';
 *
 * const roster = new DataTable({
 *   columns: [{ key: 'name' }, { key: 'level' }],
 *   rows: [{ name: 'Ash', level: 3 }, { name: 'Bo', level: 1 }],
 * });
 * roster.sortBy('level');
 * console.log(roster.rows[0].name); // 'Bo'
 * ```
 */
export class DataTable<T> {
	readonly onChange = new Signal<void>();

	private columns_: TableColumn<T>[];
	private rows_: T[];
	private pageSize_: number;
	private current = 0;
	private sortKey_: string | null = null;
	private ascending = true;
	private readonly disabledOf: (row: T) => boolean;

	constructor(options: DataTableOptions<T>) {
		this.columns_ = [...options.columns];
		this.rows_ = [...(options.rows ?? [])];
		this.pageSize_ = options.pageSize ?? 0;
		this.disabledOf = options.disabled ?? (() => false);
		this.current = this.firstEnabled();
	}

	get columns(): readonly TableColumn<T>[] {
		return this.columns_;
	}

	get rows(): readonly T[] {
		return this.rows_;
	}

	get pageSize(): number {
		return this.pageSize_;
	}

	get sortKey(): string | null {
		return this.sortKey_;
	}

	get sortAscending(): boolean {
		return this.ascending;
	}

	get selectedIndex(): number {
		return this.current;
	}

	get selected(): T | null {
		return this.rows_[this.current] ?? null;
	}

	/** the page the highlighted row is on, 0 when there is no paging */
	get page(): number {
		return this.pageSize_ > 0 ? Math.floor(this.current / this.pageSize_) : 0;
	}

	/** how many pages there are; at least one, so an empty table still has a page 0 */
	get pageCount(): number {
		return this.pageSize_ > 0 ? Math.max(1, Math.ceil(this.rows_.length / this.pageSize_)) : 1;
	}

	get pageRows(): readonly T[] {
		if (this.pageSize_ <= 0) return this.rows_;
		const start = this.page * this.pageSize_;
		return this.rows_.slice(start, start + this.pageSize_);
	}

	setRows(rows: readonly T[]): void {
		this.rows_ = [...rows];
		this.current = this.firstEnabled();
		this.onChange.dispatch();
	}

	setColumns(columns: readonly TableColumn<T>[]): void {
		this.columns_ = [...columns];
		if (this.sortKey_ && !this.columns_.some((column) => column.key === this.sortKey_)) this.sortKey_ = null;
		this.onChange.dispatch();
	}

	setPageSize(size: number): void {
		this.pageSize_ = Math.max(0, size);
		this.onChange.dispatch();
	}

	/**
	 * Sorts by a column, ascending the first time and toggling on a repeat of the same key.
	 * The highlight returns to the first selectable row, since the row it pointed at moved.
	 */
	sortBy(key: string): void {
		const column = this.columns_.find((candidate) => candidate.key === key);
		if (!column) return;
		if (this.sortKey_ === key) this.ascending = !this.ascending;
		else {
			this.sortKey_ = key;
			this.ascending = true;
		}
		const compare = column.compare ?? ((a: T, b: T) => genericCompare(valueAt(a, key), valueAt(b, key)));
		this.rows_.sort((a, b) => (this.ascending ? 1 : -1) * compare(a, b));
		this.current = this.firstEnabled();
		this.onChange.dispatch();
	}

	select(index: number): void {
		if (index < 0 || index >= this.rows_.length || this.disabledOf(this.rows_[index])) return;
		this.current = index;
		this.onChange.dispatch();
	}

	/** moves the highlight a row at a time, skipping disabled rows and stopping at the ends */
	move(delta: number): void {
		const count = this.rows_.length;
		if (count === 0) return;
		let index = this.current;
		for (let tried = 0; tried < count; tried++) {
			index += delta;
			if (index < 0 || index >= count) return;
			if (!this.disabledOf(this.rows_[index])) {
				this.current = index;
				this.onChange.dispatch();
				return;
			}
		}
	}

	/** moves to a page and highlights its first selectable row */
	setPage(page: number): void {
		if (this.pageSize_ <= 0) return;
		const target = Math.max(0, Math.min(this.pageCount - 1, page));
		const start = target * this.pageSize_;
		const end = Math.min(start + this.pageSize_, this.rows_.length);
		for (let index = start; index < end; index++) {
			if (!this.disabledOf(this.rows_[index])) {
				this.current = index;
				this.onChange.dispatch();
				return;
			}
		}
	}

	nextPage(delta = 1): void {
		this.setPage(this.page + delta);
	}

	private firstEnabled(): number {
		const index = this.rows_.findIndex((row) => !this.disabledOf(row));
		return index === -1 ? 0 : index;
	}
}

function valueAt(row: unknown, key: string): unknown {
	return row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined;
}

function genericCompare(a: unknown, b: unknown): number {
	if (a === b) return 0;
	if (a === undefined) return -1;
	if (b === undefined) return 1;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	return String(a).localeCompare(String(b));
}
