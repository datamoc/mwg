import type { MwlWorld } from './runtime.ts';

/**
 * Wesnoth's default: the share of a side's gold that survives into the next scenario, unless
 * `[endlevel] carryover_percentage` says otherwise. Its engine carries the winner's gold at 80%,
 * which is the number this mirrors rather than one invented here.
 */
export const MWL_DEFAULT_CARRYOVER_PERCENTAGE = 80;

/**
 * Which side an ending scenario hands on.
 *
 * Two identities, because the world has two: `[side]` declares an `id`, and that is how
 * `world.sides` and `world.gold` key it, while units carry the side's *number* in `unit.side`.
 * Unifying those is a change to the world model rather than to carry-over, so it is recorded as
 * its own roadmap item and this type is honest about the pair in the meantime.
 */
export interface MwlSideRef {
	/** the id `[side]` declared, the key `world.sides` and `world.gold` use */
	readonly id: string;
	/** the number that side's units carry in `unit.side` */
	readonly unitSide: number;
}

/** What `[endlevel]` says when a scenario ends. */
export interface MwlEndLevel {
	readonly result: 'victory' | 'defeat';

	/** `bonus`: gold added on top of the share, not a share of it */
	readonly bonus?: number;

	/** `carryover_percentage`: the share of the side's gold kept, 80 when unset */
	readonly carryoverPercentage?: number;

	/** `carryover_add`: add the share to the next scenario's gold rather than take the larger of them */
	readonly carryoverAdd?: boolean;

	/** `next_scenario`: where the campaign goes instead of the authored chain, null to end it */
	readonly nextScenario?: string | null;
}

/** What one scenario hands to the next. Plain data, so it survives a save. */
export interface MwlCarryover {
	readonly result: 'victory' | 'defeat';

	/** the gold handed on: the side's share, plus the bonus */
	readonly gold: number;

	/** whether the share is added to the next scenario's gold or taken as a floor under it */
	readonly add: boolean;

	/** ids of the side's units still standing, which become the recall list */
	readonly recall: readonly string[];

	/** where the campaign goes next; null ends it */
	readonly nextScenario: string | null;
}

/**
 * Works out what a finished scenario hands on: `bonus` plus `carryover_percentage` of the side's
 * gold, the units of that side still standing, and where the campaign goes next.
 *
 * A side of `null` is a scenario that ended without one (no `[side]`, nothing human-controlled):
 * the result and the next scenario are still recorded, with no gold and nobody to recall.
 *
 * @example
 * ```ts
 * import { endLevelCarryover, carryoverIntoScenario } from '@datamoc/mw_games/mwl';
 *
 * const world = {
 *   variables: {},
 *   gold: { '1': 200 },
 *   sides: { '1': { gold: 0, income: 2, controller: 'human' } },
 *   units: { hero: { hp: 30, x: 1, y: 1, alive: true, side: 1 } },
 *   maps: {},
 *   turn: 1,
 *   status: 'playing' as const,
 * };
 *
 * const carried = endLevelCarryover(world, { id: '1', unitSide: 1 }, {
 *   result: 'victory',
 *   bonus: 50,
 *   nextScenario: 'siege',
 * });
 *
 * console.log(carried.gold); // 210 - 50 bonus plus 80% of 200
 * console.log(carried.recall); // ['hero'] - still standing, so it comes back
 * console.log(carryoverIntoScenario(carried, 100)); // 210 - the larger of the two, not the sum
 * ```
 */
export function endLevelCarryover(world: MwlWorld, side: MwlSideRef | null, end: MwlEndLevel): MwlCarryover {
	const percentage = end.carryoverPercentage ?? MWL_DEFAULT_CARRYOVER_PERCENTAGE;
	const held = side ? (world.gold[side.id] ?? world.sides[side.id]?.gold ?? 0) : 0;

	return {
		result: end.result,
		gold: Math.floor((held * percentage) / 100) + (end.bonus ?? 0),
		add: end.carryoverAdd ?? false,
		recall: side
			? Object.entries(world.units)
					.filter(([, unit]) => unit.alive && unit.side === side.unitSide)
					.map(([id]) => id)
					.sort()
			: [],
		nextScenario: end.nextScenario ?? null,
	};
}

/**
 * What the next scenario starts with, given what it declares and what was carried: the two added
 * when the ending asked for that (`carryover_add`), and otherwise the larger of them, so a share
 * never drags a side below the gold its own scenario gives it.
 */
export function carryoverIntoScenario(carryover: MwlCarryover, declaredGold: number): number {
	return carryover.add ? declaredGold + carryover.gold : Math.max(declaredGold, carryover.gold);
}
