/**
 * A per-run battle statistics breakdown by category and unit type - recruits, recalls,
 * advances, kills, deaths, damage dealt, damage taken - the shape Wesnoth's own
 * statistics dialog shows and a bare `core.PlayerStats<T>` cannot give a game for free,
 * since `T` there is an opaque summary the game must already know how to combine. Here
 * the categories and the per-unit-type breakdown are the primitive: a game records one
 * event at a time as it happens and reads either a category's total or its breakdown by
 * unit type, then folds `toJSON()` into a `core.RunHistory` entry or a `core.PlayerStats`
 * total the way any other run summary would.
 *
 * @example
 * ```ts
 * import { BattleStats } from '@datamoc/mw_games/battle';
 *
 * const stats = new BattleStats();
 * stats.record('kills', 'orc-grunt');
 * stats.record('kills', 'orc-grunt');
 * stats.record('damageDealt', 'elvish-archer', 12);
 *
 * console.log(stats.total('kills')); // 2
 * console.log(stats.breakdown('kills')); // [{ unitType: 'orc-grunt', count: 2 }]
 * ```
 */

export type BattleStatCategory =
	| 'recruits'
	| 'recalls'
	| 'advances'
	| 'kills'
	| 'deaths'
	| 'damageDealt'
	| 'damageTaken';

export class BattleStats {
	private counts = new Map<BattleStatCategory, Map<string, number>>();

	/** adds `amount` (default 1) to a category's count for one unit type */
	record(category: BattleStatCategory, unitType: string, amount = 1): void {
		const byType = this.counts.get(category) ?? new Map<string, number>();
		byType.set(unitType, (byType.get(unitType) ?? 0) + amount);
		this.counts.set(category, byType);
	}

	/** one category's count for one unit type; 0 for a combination nothing has recorded yet */
	forType(category: BattleStatCategory, unitType: string): number {
		return this.counts.get(category)?.get(unitType) ?? 0;
	}

	/** a category's total across every unit type */
	total(category: BattleStatCategory): number {
		const byType = this.counts.get(category);
		if (!byType) return 0;
		let sum = 0;
		for (const count of byType.values()) sum += count;
		return sum;
	}

	/** every unit type a category has recorded, with its count - the rows a stats screen breaks a category into */
	breakdown(category: BattleStatCategory): readonly { unitType: string; count: number }[] {
		const byType = this.counts.get(category);
		return byType ? [...byType.entries()].map(([unitType, count]) => ({ unitType, count })) : [];
	}

	toJSON(): { counts: [BattleStatCategory, [string, number][]][] } {
		return { counts: [...this.counts].map(([category, byType]) => [category, [...byType]]) };
	}

	static fromJSON(data: { counts: [BattleStatCategory, [string, number][]][] }): BattleStats {
		const stats = new BattleStats();
		for (const [category, entries] of data.counts) stats.counts.set(category, new Map(entries));
		return stats;
	}
}
