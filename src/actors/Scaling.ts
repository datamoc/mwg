import type { Modifier, ModifierOp } from './StatBlock.ts';

/**
 * Level-scaled item modifiers: the shape passive gear whose bonus grows with its own
 * upgrade level shares, without any one game's scaling curve.
 *
 * A ring that grants +1 evasion per level and a weapon that hastes 5% per level are the
 * same thing here: each entry names a stat, an op, a value at level 0, and a per-level
 * increment, resolved to plain `Modifier`s for a given level. `mwg` picks no curve
 * beyond linear - anything fancier (diminishing returns, breakpoints) is a game's own
 * `from` function on a derived stat, not a framework formula.
 */

export interface LevelScale {
	stat: string;
	op: ModifierOp;

	/** the modifier value at level 0 */
	base: number;

	/** added once per level above 0 */
	perLevel: number;
}

/** resolves every scale entry at `level`: value = base + perLevel * level */
export function scaledModifiers(level: number, scales: readonly LevelScale[]): Modifier[] {
	return scales.map((scale) => ({
		stat: scale.stat,
		op: scale.op,
		value: scale.base + scale.perLevel * level,
	}));
}
