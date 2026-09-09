/**
 * Custom actions/reactions to changes in any object's state - HP dropping past a
 * threshold, a durability hitting zero, a quest flag flipping true - watched declaratively
 * instead of as a branch cascade of `if` checks scattered through game code.
 *
 * A `ReactionRule` pairs a `when` predicate over some state with an `action` the framework
 * calls the moment that predicate turns true; `check()` runs every rule against a fresh
 * reading, edge-triggered so a condition that stays true never re-fires on every call.
 * Rules make no assumption about what shape they watch - an actor's `StatBlock` values, a
 * plain object's own fields (an item's durability, a door's open flag), whatever the game
 * passes to `check`, so the same table works for a character or an inanimate object alike.
 * A `once: true` rule (a bond breaking, a boss entering phase two) fires a single time ever
 * and then retires; the default is edge-triggered, firing again each time the condition
 * leaves and returns, the shape a recurring low-health warning needs.
 *
 * @example
 * ```ts
 * import { ReactionTable } from '@datamoc/mw_games/core';
 *
 * const reactions = new ReactionTable<{ hp: number; maxHp: number }>([
 *   { id: 'critical', when: (s) => s.hp / s.maxHp <= 0.25, action: () => console.log('low hp!') },
 *   { id: 'shattered', when: (s) => s.hp <= 0, action: () => console.log('broke'), once: true },
 * ]);
 *
 * reactions.check({ hp: 40, maxHp: 100 }); // ['critical'] - fires once, not every call after
 * reactions.check({ hp: 38, maxHp: 100 }); // [] - still true, already fired
 * reactions.check({ hp: 90, maxHp: 100 }); // [] - condition left; 'critical' may fire again later
 * ```
 */

export interface ReactionRule<TState> {
	id: string;
	when: (state: Readonly<TState>) => boolean;
	action: (state: Readonly<TState>) => void;

	/** fires once ever, then is never checked again - a boss entering phase two, a bond broken */
	once?: boolean;
}

export class ReactionTable<TState> {
	private rules: ReactionRule<TState>[];
	private active = new Set<string>();
	private spent = new Set<string>();

	constructor(rules: ReactionRule<TState>[] = []) {
		this.rules = [...rules];
	}

	add(rule: ReactionRule<TState>): void {
		this.rules.push(rule);
	}

	/** drops a rule and forgets it was ever active, so a rule id can be reused later */
	remove(id: string): void {
		this.rules = this.rules.filter((rule) => rule.id !== id);
		this.active.delete(id);
	}

	/**
	 * Evaluates every rule against `state`, firing whichever just turned true.
	 *
	 * @returns the ids that fired on exactly this call, in rule order - empty when nothing
	 * newly crossed, so a game can react ("play this sound", "show this toast") to each
	 * rule exactly once per crossing rather than re-deriving what changed itself
	 */
	check(state: Readonly<TState>): string[] {
		const firedNow: string[] = [];
		for (const rule of this.rules) {
			if (rule.once && this.spent.has(rule.id)) continue;

			const isTrue = rule.when(state);
			if (isTrue && !this.active.has(rule.id)) {
				rule.action(state);
				firedNow.push(rule.id);
				if (rule.once) this.spent.add(rule.id);
			}

			if (isTrue) this.active.add(rule.id);
			else this.active.delete(rule.id);
		}
		return firedNow;
	}

	/** whether a rule fired and has not since left its condition (an edge-triggered rule) */
	isActive(id: string): boolean {
		return this.active.has(id);
	}

	/** clears every active/spent rule, as if `check` had never been called */
	reset(): void {
		this.active.clear();
		this.spent.clear();
	}

	toJSON(): { active: string[]; spent: string[] } {
		return { active: [...this.active], spent: [...this.spent] };
	}

	/** rebuilds a table from save data - rules are supplied fresh, the same as `Achievements` */
	static fromJSON<TState>(
		rules: ReactionRule<TState>[],
		data: { active: string[]; spent: string[] },
	): ReactionTable<TState> {
		const table = new ReactionTable<TState>(rules);
		for (const id of data.active) table.active.add(id);
		for (const id of data.spent) table.spent.add(id);
		return table;
	}
}
