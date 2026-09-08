/**
 * The selection contract `ListView` and `IconGrid` share, owned once.
 *
 * Both widgets are a flat list of items with `disabled` entries skipped, a highlight that
 * wraps at both ends, tap/click-to-select plus confirm, and an `onHighlight` fired whenever
 * the highlight lands somewhere new. The two used to implement each half separately and had
 * already diverged in small ways; the shape that differs (1-D rows vs 2-D cells, how the
 * highlight is drawn, what wraps where) stays in the widgets, while everything both do the
 * same way lives here: first-enabled index on reset, guarded `select`, `confirm`, and the
 * bounded skip-disabled stepping loop both `move` methods are.
 *
 * The stepping math itself is the caller's: `advance` maps one candidate to the next
 * (a 1-D modular step for a list, a row/column wrap for a grid), threading through each
 * attempt so a blocked neighbour keeps walking, and may land out of range on a ragged
 * last row, which counts as a missed step rather than a stop.
 * `onChange` is where the widget redraws (its own `refresh`); `onHighlight` is forwarded
 * so games keep setting the widget's own callback.
 */
export interface SelectionHooks<T> {
	onChange: () => void;
	onHighlight: (item: T, index: number) => void;
}

export class SelectionModel<T extends { disabled?: boolean }> {
	private hooks: SelectionHooks<T>;
	private list: T[] = [];
	private current = 0;

	constructor(hooks: SelectionHooks<T>) {
		this.hooks = hooks;
	}

	get items(): readonly T[] {
		return this.list;
	}

	get selectedIndex(): number {
		return this.current;
	}

	get selected(): T | null {
		return this.list[this.current] ?? null;
	}

	get length(): number {
		return this.list.length;
	}

	/** points at the first selectable entry (index 0 when nothing is), without notifying */
	reset(items: T[]): void {
		this.list = items;
		this.current = items.findIndex((item) => !item.disabled);
		if (this.current === -1) this.current = 0;
	}

	/** swaps two entries in place, the way grid reordering does; the highlight is untouched */
	swap(a: number, b: number): void {
		[this.list[a], this.list[b]] = [this.list[b], this.list[a]];
	}

	private land(index: number): void {
		this.current = index;
		this.hooks.onChange();
		const item = this.list[index];
		if (item) this.hooks.onHighlight(item, index);
	}

	select(index: number): void {
		if (index < 0 || index >= this.list.length || this.list[index].disabled) return;
		this.land(index);
	}

	confirm(onSelect: ((item: T, index: number) => void) | null): boolean {
		const item = this.selected;
		if (!item || item.disabled) return false;
		onSelect?.(item, this.current);
		return true;
	}

	/**
	 * Steps from the current index with `advance`, skipping disabled and out-of-range
	 * landings. Each attempt starts from the previous candidate (not the selection), so a
	 * blocked neighbour keeps walking rather than retrying the same cell. Tries at most
	 * `maxSteps` candidates, so an all-disabled set terminates. Returns false when there
	 * is nothing selectable to move to.
	 */
	step(advance: (from: number, count: number) => number, maxSteps: number): boolean {
		if (this.list.length === 0) return false;
		let from = this.current;
		for (let tried = 0; tried < maxSteps; tried++) {
			const next = advance(from, this.list.length);
			from = next;
			if (next < 0 || next >= this.list.length) continue;
			if (!this.list[next].disabled) {
				this.land(next);
				return true;
			}
		}
		return false;
	}
}
