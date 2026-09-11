export type Anchor =
	'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'fill';

export interface LayoutRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface AnchorSpec {
	/** which corner or edge to sit against; `center` when omitted */
	anchor?: Anchor;
	/** extra offset after anchoring, positive right and down */
	offsetX?: number;
	offsetY?: number;
	/** 0..1 position across the bounds, overriding the named anchor's own alignment */
	alignX?: number;
	alignY?: number;
	/** the placed size; the content's own size when omitted */
	width?: number;
	height?: number;
	/** shrinks the bounds on every side before anchoring */
	margin?: number;
}

/**
 * The horizontal (0, 0.5, 1) and vertical alignment a named anchor implies.
 *
 * @example
 * ```ts
 * import { anchorAlign } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(anchorAlign('bottom-right')); // { x: 1, y: 1 }
 * ```
 */
export function anchorAlign(anchor: Anchor): { x: number; y: number } {
	switch (anchor) {
		case 'top':
		case 'bottom':
			return { x: 0.5, y: anchor === 'top' ? 0 : 1 };
		case 'left':
		case 'right':
			return { x: anchor === 'left' ? 0 : 1, y: 0.5 };
		case 'top-left':
			return { x: 0, y: 0 };
		case 'top-right':
			return { x: 1, y: 0 };
		case 'bottom-left':
			return { x: 0, y: 1 };
		case 'bottom-right':
			return { x: 1, y: 1 };
		case 'fill':
		case 'center':
		default:
			return { x: 0.5, y: 0.5 };
	}
}

/**
 * Places a `size`-shaped child against the bounds - the anchor half of a data-driven shell, the
 * part GUI2 spells as `[cell]` anchoring a widget inside its slot.
 *
 * A `fill` anchor takes the bounds (minus margins) whole; every other anchor lines the child up on
 * the named edge and then applies the offsets, so `{ anchor: 'bottom-right', offsetX: -8 }` pins a
 * button eight pixels in from the bottom-right corner.
 *
 * @example
 * ```ts
 * import { resolveAnchor } from '@datamoc/mw_games/two-d/ui';
 *
 * const bounds = { x: 0, y: 0, width: 800, height: 600 };
 * console.log(resolveAnchor({ anchor: 'bottom-right', width: 100, height: 30, margin: 10 }, bounds));
 * // { x: 690, y: 560, width: 100, height: 30 }
 * ```
 */
export function resolveAnchor(
	spec: AnchorSpec,
	bounds: LayoutRect,
	size: { width: number; height: number } = { width: 0, height: 0 },
): LayoutRect {
	const margin = spec.margin ?? 0;
	const left = bounds.x + margin;
	const top = bounds.y + margin;
	const usableWidth = Math.max(0, bounds.width - margin * 2);
	const usableHeight = Math.max(0, bounds.height - margin * 2);

	if (spec.anchor === 'fill') {
		const x = left + (spec.offsetX ?? 0);
		const y = top + (spec.offsetY ?? 0);
		return {
			x,
			y,
			width: spec.width ?? Math.max(0, left + usableWidth - x),
			height: spec.height ?? Math.max(0, top + usableHeight - y),
		};
	}

	const align = anchorAlign(spec.anchor ?? 'center');
	const alignX = spec.alignX ?? align.x;
	const alignY = spec.alignY ?? align.y;
	const width = spec.width ?? size.width;
	const height = spec.height ?? size.height;
	return {
		x: left + alignX * Math.max(0, usableWidth - width) + (spec.offsetX ?? 0),
		y: top + alignY * Math.max(0, usableHeight - height) + (spec.offsetY ?? 0),
		width,
		height,
	};
}

export interface GridTrack {
	/** a fixed size, in pixels */
	size?: number;
	/** share of what is left after the fixed tracks; a track with neither is 0 */
	grow?: number;
}

export interface GridSpec {
	columns: readonly GridTrack[];
	rows: readonly GridTrack[];
	/** space between tracks, in pixels */
	gap?: number;
}

/**
 * A column/row grid whose tracks are `size` or `grow`, the data-driven counterpart to GUI2's
 * `[grid]`. Fixed tracks take their size; the rest of the space is divided between the `grow`
 * tracks in proportion to their weight, so a sidebar can be `size: 200` and the content
 * `grow: 1` without either side knowing the window's width.
 *
 * @example
 * ```ts
 * import { Grid } from '@datamoc/mw_games/two-d/ui';
 *
 * const grid = new Grid({ columns: [{ size: 200 }, { grow: 1 }], rows: [{ grow: 1 }], gap: 8 });
 * const cell = grid.rect(0, 1, { x: 0, y: 0, width: 800, height: 600 });
 * console.log(cell); // the content column: x 208, width 592
 * ```
 */
export class Grid {
	private spec: GridSpec;

	constructor(spec: GridSpec) {
		this.spec = spec;
	}

	get columns(): readonly GridTrack[] {
		return this.spec.columns;
	}

	get rows(): readonly GridTrack[] {
		return this.spec.rows;
	}

	/** the resolved pixel width of each column for a given total width */
	columnSizes(totalWidth: number): number[] {
		return resolveTracks(this.spec.columns, totalWidth, this.gap);
	}

	/** the resolved pixel height of each row for a given total height */
	rowSizes(totalHeight: number): number[] {
		return resolveTracks(this.spec.rows, totalHeight, this.gap);
	}

	/**
	 * The rectangle of a cell, spanning `columnSpan` columns and `rowSpan` rows. Out-of-range cells
	 * resolve to a zero-sized rect at the far edge rather than throwing, so a caller walking a
	 * changing table never has to bounds-check first.
	 */
	rect(
		row: number,
		column: number,
		bounds: LayoutRect,
		options: { rowSpan?: number; columnSpan?: number } = {},
	): LayoutRect {
		const columns = this.columnSizes(bounds.width);
		const rows = this.rowSizes(bounds.height);
		const columnSpan = options.columnSpan ?? 1;
		const rowSpan = options.rowSpan ?? 1;

		const x = bounds.x + offsetOf(columns, column, this.gap);
		const y = bounds.y + offsetOf(rows, row, this.gap);
		return {
			x,
			y,
			width: spanOf(columns, column, columnSpan, this.gap),
			height: spanOf(rows, row, rowSpan, this.gap),
		};
	}

	private get gap(): number {
		return this.spec.gap ?? 0;
	}
}

function resolveTracks(tracks: readonly GridTrack[], total: number, gap: number): number[] {
	const gaps = gap * Math.max(0, tracks.length - 1);
	const available = Math.max(0, total - gaps);
	const fixed = tracks.reduce((sum, track) => sum + (track.size ?? 0), 0);
	const growTotal = tracks.reduce((sum, track) => sum + (track.grow ?? 0), 0);
	const remaining = Math.max(0, available - fixed);
	let assigned = 0;
	return tracks.map((track, index) => {
		if (track.size !== undefined) return track.size;
		if (!track.grow || growTotal === 0) return 0;
		//give the last grow track whatever rounding is left, so the tracks always fill the space
		const isLast = index === lastGrowIndex(tracks);
		const size = isLast ? remaining - assigned : Math.floor((remaining * track.grow) / growTotal);
		assigned += size;
		return size;
	});
}

function lastGrowIndex(tracks: readonly GridTrack[]): number {
	for (let index = tracks.length - 1; index >= 0; index--) if (tracks[index].grow) return index;
	return -1;
}

function offsetOf(sizes: readonly number[], index: number, gap: number): number {
	let offset = 0;
	for (let i = 0; i < index && i < sizes.length; i++) offset += sizes[i] + gap;
	return offset;
}

function spanOf(sizes: readonly number[], index: number, span: number, gap: number): number {
	let width = 0;
	for (let i = index; i < index + span && i < sizes.length; i++) {
		width += sizes[i];
		if (i > index) width += gap;
	}
	return Math.max(0, width);
}
