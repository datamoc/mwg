/**
 * `value` restricted to `[min, max]`.
 *
 * @example
 * ```ts
 * import { clamp } from '@datamoc/mw_games/core';
 *
 * clamp(15, 0, 10); // 10
 * clamp(-5, 0, 10); // 0
 * clamp(5, 0, 10); // 5
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}
