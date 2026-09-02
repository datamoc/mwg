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
 */

export interface AchievementDef {
	id: string;

	/** the counter this watches, incremented by the game as things happen */
	counter: string;

	/** the counter value that earns this */
	target: number;

	/** shown on an achievement screen; `mwg` never reads this itself */
	description?: string;
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
	 * Adds to a counter, unlocking whatever that newly earns.
	 *
	 * @returns the ids unlocked by exactly this increment, so a game can announce each
	 * one once ("Achievement unlocked: ...") rather than re-scanning everything
	 */
	increment(counter: string, amount = 1): string[] {
		const before = this.count(counter);
		this.counts.set(counter, before + amount);

		const earned: string[] = [];
		for (const definition of this.definitions.values()) {
			if (definition.counter !== counter) continue;
			if (before < definition.target && before + amount >= definition.target) {
				earned.push(definition.id);
				this.fresh.push(definition.id);
			}
		}
		return earned;
	}

	/** whether an achievement's counter has reached its target - throws for an unknown id */
	unlocked(id: string): boolean {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`no such achievement: "${id}"`);
		return this.count(definition.counter) >= definition.target;
	}

	/** progress towards an achievement: current count and target - throws for an unknown id */
	progress(id: string): { count: number; target: number } {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`no such achievement: "${id}"`);
		return { count: this.count(definition.counter), target: definition.target };
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
