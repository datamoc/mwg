import type { StatBlock } from './StatBlock.ts';

export interface SkillPointsOptions {
	/** the highest rank a stat can be raised to via `spend`; uncapped if omitted */
	cap?: (stat: string) => number;

	/** points one more rank of `stat` costs, given the rank being bought (1 for the first
	 * point spent into it, 2 for the second, and so on); a flat 1 per rank if omitted */
	cost?: (stat: string, rank: number) => number;
}

/**
 * The seam `StatBlock` and `Progression` never had: a levelling curve already tells a game
 * how many levels it just gained, and a stat block already holds any named stat a game
 * invents - `lockpicking` exactly as well as `strength` - but nothing turns "gained a level"
 * into "has a point to spend", or spends one with the usual rules a skill spend wants (a
 * cap, a cost that rises the more of a stat is already bought).
 *
 * Deliberately not a wrapper around `Progression` itself: a game grants points from
 * levelling (`grant(levelsGained)` after `Progression.addExperience` returns a positive
 * number), from a quest reward, from a trainer NPC, or all three - this only tracks the
 * ledger and the spend rule, the same way `skillCheck` is a dice roll and nothing about who
 * is rolling it.
 *
 * @example
 * ```ts
 * import { SkillPoints, StatBlock } from '@datamoc/mw_games/actors';
 *
 * const stats = new StatBlock({ base: { lockpicking: 0 } });
 * const points = new SkillPoints(stats, { cap: () => 10, cost: (_stat, rank) => rank });
 *
 * points.grant(3); // e.g. after Progression.addExperience returned levelsGained
 * if (points.canSpend('lockpicking')) points.spend('lockpicking');
 *
 * console.log(stats.base('lockpicking'), points.points);
 * ```
 */
export class SkillPoints {
	private stats: StatBlock;
	private capFor: (stat: string) => number;
	private costFor: (stat: string, rank: number) => number;

	private available = 0;

	constructor(stats: StatBlock, options: SkillPointsOptions = {}) {
		this.stats = stats;
		this.capFor = options.cap ?? (() => Infinity);
		this.costFor = options.cost ?? (() => 1);
	}

	/** points not yet spent */
	get points(): number {
		return this.available;
	}

	/** adds points to the ledger - typically levels gained times however many a level grants */
	grant(points: number): void {
		this.available += points;
	}

	/** whether `stat` could be raised one more rank right now - affordable, and under its cap */
	canSpend(stat: string): boolean {
		return this.nextRankCost(stat) !== null;
	}

	/**
	 * Raises `stat`'s base value by one rank, spending whatever that rank costs.
	 *
	 * @returns false, spending nothing, if the rank is capped or not affordable
	 */
	spend(stat: string): boolean {
		const cost = this.nextRankCost(stat);
		if (cost === null) return false;

		const rank = this.stats.base(stat);
		this.available -= cost;
		this.stats.setBase(stat, rank + 1);
		return true;
	}

	/** the cost of `stat`'s next rank, or `null` if it is capped or unaffordable - computes
	 * the cost callback exactly once, so `canSpend` and `spend` never call it twice between
	 * them for the same decision */
	private nextRankCost(stat: string): number | null {
		const rank = this.stats.base(stat);
		if (rank >= this.capFor(stat)) return null;

		const cost = this.costFor(stat, rank + 1);
		return this.available >= cost ? cost : null;
	}

	/**
	 * The unspent ledger, and only that.
	 *
	 * Spent points are already saved: `spend` raises a stat's *base* value on the `StatBlock`,
	 * so restoring that block restores every rank ever bought. Recording them a second time
	 * here would be state kept in two places, which is exactly the kind of pair that drifts
	 * the first time one path forgets to update the other.
	 */
	toJSON(): { points: number } {
		return { points: this.available };
	}

	static fromJSON(stats: StatBlock, options: SkillPointsOptions, data: { points: number }): SkillPoints {
		const ledger = new SkillPoints(stats, options);
		ledger.available = data.points;
		return ledger;
	}
}
