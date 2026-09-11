/**
 * Achievements: named milestones unlocked by counters crossing a target - monsters
 * slain, gold collected, floors descended, runs won.
 *
 * The shape every badge/achievement list shares: a definition names a counter and the
 * value that earns it, the game increments counters as things happen, and unlocking is
 * derived (a counter at or past its target), never stored separately - so a counter
 * can only ever move one way and an unlocked achievement can never disagree with the
 * count behind it. Descriptions are display text `mwg` never reads; persistence is the
 * usual definitions-fresh, progress-saved split (`QuestLog`'s own convention).
 *
 * An achievement can also name several criteria instead of one - Wesnoth's own
 * "sub-achievements" shape, such as "recruit one of every unit type" being six counters
 * that must each reach 1 - and it unlocks only once every one of them has. A single
 * `counter`/`target` is shorthand for a one-criterion achievement; both forms share the
 * same unlock, progress and save code, since a one-element criteria list behaves
 * identically to the shorthand.
 *
 * @example
 * ```ts
 * import { Achievements } from '@datamoc/mw_games/core';
 *
 * const achievements = new Achievements();
 * achievements.define({ id: 'first-blood', counter: 'kills', target: 1 });
 * achievements.define({ id: 'slayer', counter: 'kills', target: 100 });
 * achievements.define({
 * 	id: 'diverse-army',
 * 	criteria: [
 * 		{ counter: 'recruited-archer', target: 1 },
 * 		{ counter: 'recruited-knight', target: 1 },
 * 	],
 * });
 *
 * const unlocked = achievements.increment('kills', 1);
 * console.log(unlocked); // ['first-blood']
 *
 * // later, a UI drains and announces whatever unlocked since it last checked
 * const toast = achievements.drainNew();
 * ```
 */

export interface AchievementCriterion {
	/** the counter this criterion watches, incremented by the game as things happen */
	counter: string;

	/** the counter value that satisfies this criterion */
	target: number;
}

export interface AchievementDef {
	id: string;

	/** shorthand for a single-criterion achievement; mutually exclusive with `criteria` */
	counter?: string;

	/** shorthand for a single-criterion achievement; mutually exclusive with `criteria` */
	target?: number;

	/** every criterion here must be met before this achievement unlocks; mutually exclusive with `counter`/`target` */
	criteria?: AchievementCriterion[];

	/** shown on an achievement screen; `mwg` never reads this itself */
	description?: string;
}

function criteriaOf(definition: AchievementDef): readonly AchievementCriterion[] {
	if (definition.criteria) return definition.criteria;
	if (definition.counter === undefined || definition.target === undefined) {
		throw new Error(`achievement "${definition.id}" needs either counter/target or criteria`);
	}
	return [{ counter: definition.counter, target: definition.target }];
}

export class Achievements {
	private definitions = new Map<string, AchievementDef>();
	private counts = new Map<string, number>();

	/** every achievement id unlocked since the last `drainNew` call, oldest first */
	private fresh: string[] = [];

	define(definition: AchievementDef): void {
		this.definitions.set(definition.id, definition);
	}

	/** the current value of a counter; 0 for one nothing has touched yet */
	count(counter: string): number {
		return this.counts.get(counter) ?? 0;
	}

	/**
	 * Adds to a counter, unlocking whatever that newly earns - a multi-criteria achievement
	 * unlocks only on the increment that leaves every one of its criteria met.
	 *
	 * @returns the ids unlocked by exactly this increment, so a game can announce each
	 * one once ("Achievement unlocked: ...") rather than re-scanning everything
	 */
	increment(counter: string, amount = 1): string[] {
		const before = this.count(counter);
		this.counts.set(counter, before + amount);

		const earned: string[] = [];
		for (const definition of this.definitions.values()) {
			const criteria = criteriaOf(definition);
			if (!criteria.some((criterion) => criterion.counter === counter)) continue;
			const wasMet = criteria.every((criterion) =>
				criterion.counter === counter ? before >= criterion.target : this.count(criterion.counter) >= criterion.target,
			);
			if (wasMet) continue;
			const nowMet = criteria.every((criterion) => this.count(criterion.counter) >= criterion.target);
			if (nowMet) {
				earned.push(definition.id);
				this.fresh.push(definition.id);
			}
		}
		return earned;
	}

	/** whether every one of an achievement's criteria has reached its target - throws for an unknown id */
	unlocked(id: string): boolean {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`no such achievement: "${id}"`);
		return criteriaOf(definition).every((criterion) => this.count(criterion.counter) >= criterion.target);
	}

	/**
	 * Progress towards a single-criterion achievement: current count and target - throws for
	 * an unknown id or a multi-criteria one (use `subProgress` there instead).
	 */
	progress(id: string): { count: number; target: number } {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`no such achievement: "${id}"`);
		const criteria = criteriaOf(definition);
		if (criteria.length !== 1) throw new Error(`achievement "${id}" has several criteria - use subProgress`);
		return { count: this.count(criteria[0].counter), target: criteria[0].target };
	}

	/** progress towards each of an achievement's criteria, in definition order - throws for an unknown id */
	subProgress(id: string): readonly { counter: string; count: number; target: number; met: boolean }[] {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`no such achievement: "${id}"`);
		return criteriaOf(definition).map((criterion) => {
			const count = this.count(criterion.counter);
			return { counter: criterion.counter, count, target: criterion.target, met: count >= criterion.target };
		});
	}

	/** every id unlocked but not yet announced, clearing the queue as it reads */
	drainNew(): string[] {
		const out = this.fresh;
		this.fresh = [];
		return out;
	}

	toJSON(): { counts: [string, number][] } {
		return { counts: [...this.counts] };
	}

	/** rebuilds achievements from save data - definitions are supplied fresh, the same as `QuestLog` */
	static fromJSON(definitions: AchievementDef[], data: { counts: [string, number][] }): Achievements {
		const achievements = new Achievements();
		for (const definition of definitions) achievements.define(definition);
		for (const [counter, count] of data.counts) achievements.counts.set(counter, count);
		//a loaded game announces nothing: whatever was earned was earned before the save
		return achievements;
	}
}
