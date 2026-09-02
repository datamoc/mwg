import * as Random from '../core/Random.ts';

/**
 * A skill checked against a difficulty.
 *
 * The default mechanic - a proficiency plus a die roll, compared against a target number -
 * is deliberately the simplest one that exists, because it is a shape every game recognises
 * and every game also wants to replace with its own dice. Pass `roll` to use anything else;
 * the default draws from `mwg/core`'s seeded RNG, so a check replays the same way from a
 * save file.
 *
 * @returns true if the check succeeds
 */
export function skillCheck(
	value: number,
	difficulty: number,
	roll: () => number = () => Random.range(1, 20)
): boolean {
	return value + roll() >= difficulty;
}
