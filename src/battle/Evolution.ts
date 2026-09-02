/**
 * Capture, experience, levelling and evolution as replaceable rules.
 *
 * Experience and levelling are `mwg/actors`' `Progression`, unchanged - a creature is not a
 * different shape from a character. Capture has no shape here at all: it is entirely a
 * game's own formula (a ball's catch rate, a chance based on remaining HP, whatever), so
 * `mwg` supplies nothing for it beyond not getting in the way. Evolution is the one piece
 * worth a shared shape, since "check an ordered list of conditions" is the same problem
 * `mwg/rpg`'s event pages already solve.
 */

export interface EvolutionRule<S> {
	at: (level: number) => boolean;
	into: S;
}

/**
 * The last rule whose condition holds at this level, or null when none does - the same
 * "ordered low to high, most-specific-that-matches wins" convention `mwg/rpg`'s event pages
 * use, so a chain authored `[16 -> adult, 32 -> elder]` reaches "elder" at level 40 rather
 * than getting stuck on the first threshold it ever crossed.
 */
export function checkEvolution<S>(rules: readonly EvolutionRule<S>[], level: number): S | null {
	let match: S | null = null;
	for (const rule of rules) {
		if (rule.at(level)) match = rule.into;
	}
	return match;
}
