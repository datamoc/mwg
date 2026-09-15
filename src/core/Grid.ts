/**
 * Bounded-grid indexing: the row-major cell arithmetic and bounds check that every tile, board
 * and hex module ends up writing for itself.
 *
 * Free functions rather than a `Grid` class, deliberately. Every caller already holds a width
 * and height (a level, a board, a skirmish state), and several sit in loops hot enough that
 * allocating a wrapper per call would be the wrong trade. `mwg/roguelike`'s `Level` keeps its
 * own `index`/`inside`/`x`/`y` as one-line forwards to these, so its public shape is unchanged.
 *
 * Out-of-bounds policy is not part of this module either: `cellIndex` does the arithmetic and
 * nothing else, so a loop that has already proved its coordinates pays nothing, while a module
 * that wants to fail loudly (`board/Classics` throws) or to report `-1`
 * (`board/FogOfWar` does) keeps that decision in its own method. `cellInside` is the shared
 * check for callers that have not already proved it.
 *
 * @example
 * ```ts
 * import { cellInside, cellIndex, cellX, cellY, cellKey, cellFromKey } from '@datamoc/mw_games/core';
 *
 * // a 4x3 board, row-major: y * width + x
 * cellInside(4, 3, 3, 2);        // true, the far corner
 * cellInside(4, 3, 4, 0);        // false, one past the right edge
 * cellIndex(4, 2, 1);            // 6, the cell's slot in a flat array
 * cellX(4, 6);                   // 2, back from that index
 * cellY(4, 6);                   // 1
 *
 * const seen = new Set([cellKey(2, 1)]);   // '2,1', for a Map or a Set
 * cellFromKey('2,1');                      // { x: 2, y: 1 }
 * ```
 */

/**
 * True when `(x, y)` is inside a `width` x `height` grid.
 *
 * Both edges are inclusive of `0` and exclusive of `width`/`height`, so a cell exists if and
 * only if `0 <= x < width` and `0 <= y < height`.
 */
export function cellInside(width: number, height: number, x: number, y: number): boolean {
	return x >= 0 && y >= 0 && x < width && y < height;
}

/**
 * The row-major index of `(x, y)`: its position in a flat `width * height` array.
 *
 * Deliberately unchecked. Call `cellInside` when the coordinates are not already known to be
 * valid; an out-of-range `x` otherwise lands on a neighbouring row rather than failing, and a
 * negative one on the row before it.
 */
export function cellIndex(width: number, x: number, y: number): number {
	return y * width + x;
}

/** The `x` coordinate of a row-major `index` (`cellIndex`'s inverse). */
export function cellX(width: number, index: number): number {
	return index % width;
}

/** The `y` coordinate of a row-major `index` (`cellIndex`'s inverse). */
export function cellY(width: number, index: number): number {
	return Math.floor(index / width);
}

/**
 * A stable string key naming one cell, for `Map`/`Set` membership.
 *
 * `'x,y'` is the spelling consumers reach for anyway (the Wesnoth port keys its own `Map`s by
 * hand with it); taking it from the framework means a key written by one system is understood
 * by the next, which a pair of numbers in a string is otherwise not guaranteed to be. Negative
 * coordinates are included, since a grid view that scrolls can hand one out.
 */
export function cellKey(x: number, y: number): string {
	return `${x},${y}`;
}

/** The cell a `cellKey` names, or `null` when `key` is not one this module produced. */
export function cellFromKey(key: string): { x: number; y: number } | null {
	const match = /^(-?\d+),(-?\d+)$/.exec(key);
	if (!match) return null;
	return { x: Number(match[1]), y: Number(match[2]) };
}
