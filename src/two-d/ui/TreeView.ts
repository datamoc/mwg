import { Signal } from '../../core/Signal.ts';

export interface TreeNode<T = unknown> {
	/** stable across rebuilds: the id expansion state is kept by */
	id: string;
	label: string;
	children?: readonly TreeNode<T>[];
	disabled?: boolean;
	data?: T;
}

/** A tree node as the flattened view holds it: its depth and whether its children are showing. */
export interface TreeRow<T> {
	node: TreeNode<T>;
	depth: number;
	expanded: boolean;
	hasChildren: boolean;
}

export interface TreeViewOptions<T> {
	roots: readonly TreeNode<T>[];
	/** ids expanded from the start; everything else starts collapsed */
	expanded?: readonly string[];
	/** rows the highlight skips, the way `ListView` skips a disabled item */
	disabled?: (node: TreeNode<T>) => boolean;
}

/**
 * A collapsible tree, flattened to the rows a game draws - a skill tree, a nested options menu,
 * a directory of scenarios grouped by campaign.
 *
 * Renderer-free, like `TabbedList`. The visible rows are derived from the roots and the set of
 * expanded ids every time they are asked for, rather than kept in a parallel list that could go
 * stale. Two rules are worth naming: collapsing a branch that contains the highlight moves the
 * highlight to the branch itself, and `move` only ever walks the rows actually on screen, so a
 * collapsed child is unreachable without expanding it first.
 *
 * @example
 * ```ts
 * import { TreeView } from '@datamoc/mw_games/two-d/ui';
 *
 * const tree = new TreeView({
 *   roots: [{ id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1' }] }],
 * });
 * tree.expand('a');
 * console.log(tree.rows.map((row) => row.node.id)); // ['a', 'a1']
 * ```
 */
export class TreeView<T = unknown> {
	readonly onChange = new Signal<void>();

	private roots_: readonly TreeNode<T>[];
	private expanded = new Set<string>();
	private current = 0;
	private readonly disabledOf: (node: TreeNode<T>) => boolean;

	constructor(options: TreeViewOptions<T>) {
		this.roots_ = options.roots;
		for (const id of options.expanded ?? []) this.expanded.add(id);
		this.disabledOf = options.disabled ?? (() => false);
		this.current = this.firstEnabled();
	}

	get roots(): readonly TreeNode<T>[] {
		return this.roots_;
	}

	/** the rows on screen, in draw order: a collapsed node's children are absent */
	get rows(): readonly TreeRow<T>[] {
		const rows: TreeRow<T>[] = [];
		const walk = (nodes: readonly TreeNode<T>[], depth: number): void => {
			for (const node of nodes) {
				const hasChildren = (node.children?.length ?? 0) > 0;
				const isExpanded = hasChildren && this.expanded.has(node.id);
				rows.push({ node, depth, expanded: isExpanded, hasChildren });
				if (isExpanded) walk(node.children as readonly TreeNode<T>[], depth + 1);
			}
		};
		walk(this.roots_, 0);
		return rows;
	}

	get selectedIndex(): number {
		return this.current;
	}

	get selected(): TreeNode<T> | null {
		return this.rows[this.current]?.node ?? null;
	}

	isExpanded(id: string): boolean {
		return this.expanded.has(id);
	}

	expand(id: string): void {
		if (this.expanded.has(id)) return;
		this.expanded.add(id);
		this.onChange.dispatch();
	}

	collapse(id: string): void {
		if (!this.expanded.has(id)) return;
		//read the selection before closing, or a child index can already point past the shorter list
		const selectedId = this.rows[this.current]?.node.id;
		this.expanded.delete(id);
		//if the highlight was inside the branch that just closed, land it on the branch itself
		if (selectedId !== undefined && !this.rows.some((row) => row.node.id === selectedId)) {
			const index = this.rows.findIndex((row) => row.node.id === id);
			if (index >= 0) this.current = index;
		}
		this.onChange.dispatch();
	}

	toggle(id: string): void {
		if (this.expanded.has(id)) this.collapse(id);
		else this.expand(id);
	}

	expandAll(): void {
		const walk = (nodes: readonly TreeNode<T>[]): void => {
			for (const node of nodes) {
				if (node.children?.length) {
					this.expanded.add(node.id);
					walk(node.children);
				}
			}
		};
		walk(this.roots_);
		this.onChange.dispatch();
	}

	collapseAll(): void {
		this.expanded.clear();
		this.select(0);
		this.onChange.dispatch();
	}

	select(index: number): void {
		const row = this.rows[index];
		if (!row || this.disabledOf(row.node)) return;
		this.current = index;
		this.onChange.dispatch();
	}

	/** moves the highlight a visible row at a time, skipping disabled rows and stopping at the ends */
	move(delta: number): void {
		const count = this.rows.length;
		if (count === 0) return;
		let index = this.current;
		for (let tried = 0; tried < count; tried++) {
			index += delta;
			if (index < 0 || index >= count) return;
			if (!this.disabledOf(this.rows[index].node)) {
				this.current = index;
				this.onChange.dispatch();
				return;
			}
		}
	}

	private firstEnabled(): number {
		const index = this.rows.findIndex((row) => !this.disabledOf(row.node));
		return index === -1 ? 0 : index;
	}
}
