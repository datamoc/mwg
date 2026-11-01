/**
 * One row of a `selectEntry` list.
 *
 * `value` is the game's own payload and comes back untouched, which is what lets a caller keep
 * its commands, items or destinations in their own shape rather than in an index.
 */
export interface SelectEntry<T> {
	/** what the presenter shows for this row */
	label: string;
	/** what the caller gets back when this row is chosen */
	value: T;
	/** a row that is shown but cannot be chosen, greyed out by the presenter */
	disabled?: boolean;
}

/** What a `SelectOptions.present` implementation asks for next. */
export type SelectAction =
	/** move the cursor to this index within the presented page */
	| { cursor: number }
	/** choose this index within the presented page */
	| { choose: number }
	/** show the next or previous page, keeping the cursor's position by index */
	| { page: 'next' | 'prev' }
	/** cancel the selection */
	| null;

/** One page of entries, as handed to a presenter by `selectEntry`. */
export interface SelectPage<T> {
	/** a slice of the original entries, in their original order and identity */
	entries: readonly SelectEntry<T>[];
	/** zero-based page number */
	pageIndex: number;
	/** how many pages the whole list has */
	pageCount: number;
	/** the cursor's index within `entries`, not within the whole list */
	cursor: number;
}

/** How `selectEntry` drives its presenter. */
export interface SelectOptions<T> {
	/**
	 * Shows one page and resolves to the next action. A presenter that draws a window, prints to a
	 * console or asks a socket reads the page and answers; it may be called again with the same page
	 * when a choice was refused, so it must not assume a call means progress.
	 */
	present: (page: SelectPage<T>) => Promise<SelectAction>;
	/** rows per page; a positive integer, 5 when omitted */
	pageSize?: number;
	/** the entry the cursor starts on, as an index into `entries`; the last entry when out of range */
	start?: number;
}

/**
 * A paged selection over a presenter, with no window, theme or renderer of its own.
 *
 * This is the seam a game whose dialogue is not a graphical `MessageBox` needs: `Window`/`ListView`
 * already own the on-screen case, while a text console, a remote client or a test drives this one
 * with plain data. Pagination, the cursor, disabled rows and cancellation all live here so every
 * such game does not reimplement them around its own presenter.
 *
 * The cursor is reported per page, because that is what a presenter draws; `start` is the one
 * index in whole-list coordinates. Choosing a disabled row does not cancel or throw: the page is
 * presented again with the cursor on that row, so a presenter that ignored the flag cannot choose
 * it by accident. A page or cursor outside the presented page is refused with an `Error`, since it
 * can only be a presenter bug.
 *
 * @example
 * ```ts
 * import { selectEntry } from '@datamoc/mwg/two-d/ui';
 *
 * const choice = await selectEntry(
 *   [
 *     { label: 'Attack', value: 'attack' },
 *     { label: 'Defend', value: 'defend' },
 *     { label: 'Flee', value: 'flee', disabled: true },
 *   ],
 *   {
 *     present: async (page) => {
 *       console.log(page.entries.map((entry) => entry.label).join(' / '));
 *       return { choose: 1 };
 *     },
 *   },
 * );
 * console.log(choice?.value); // 'defend'
 * ```
 */
export async function selectEntry<T>(
	entries: readonly SelectEntry<T>[],
	options: SelectOptions<T>,
): Promise<SelectEntry<T> | null> {
	if (entries.length === 0) return null;

	const pageSize = options.pageSize ?? 5;
	if (!Number.isInteger(pageSize) || pageSize < 1) {
		throw new Error(`selectEntry: pageSize must be a positive integer, got ${pageSize}`);
	}
	const start = options.start ?? 0;
	if (!Number.isInteger(start) || start < 0) {
		throw new Error(`selectEntry: start must be a non-negative integer, got ${start}`);
	}

	const pageCount = Math.ceil(entries.length / pageSize);
	let cursor = Math.min(start, entries.length - 1);

	while (true) {
		const pageIndex = Math.floor(cursor / pageSize);
		const pageStart = pageIndex * pageSize;
		const page = entries.slice(pageStart, pageStart + pageSize);
		const action = await options.present({ entries: page, pageIndex, pageCount, cursor: cursor - pageStart });

		if (action === null) return null;

		if ('page' in action) {
			const target = action.page === 'next' ? Math.min(pageIndex + 1, pageCount - 1) : Math.max(pageIndex - 1, 0);
			const local = cursor - pageStart;
			cursor = target * pageSize + Math.min(local, pageLength(entries.length, pageSize, target) - 1);
			continue;
		}

		if ('cursor' in action) {
			assertInPage(action.cursor, page.length, 'cursor');
			cursor = pageStart + action.cursor;
			continue;
		}

		assertInPage(action.choose, page.length, 'choose');
		const entry = page[action.choose];
		if (entry.disabled) {
			cursor = pageStart + action.choose;
			continue;
		}
		return entry;
	}
}

/** how many entries a page holds, the last page included */
function pageLength(count: number, pageSize: number, pageIndex: number): number {
	return Math.min(pageSize, count - pageIndex * pageSize);
}

function assertInPage(index: number, length: number, field: 'cursor' | 'choose'): void {
	if (!Number.isInteger(index) || index < 0 || index >= length) {
		throw new Error(`selectEntry: ${field} ${index} is outside a page of ${length} entries`);
	}
}
