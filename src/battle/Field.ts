/**
 * Named conditions the battle itself carries - weather, terrain, a screen like Reflect -
 * rather than any one creature's own `StatBlock`. Every modifier-shaped thing `mwg/actors`
 * has (equipment, buffs, status effects) is scoped to one creature; this is the one place a
 * condition can apply to everyone without a game copying it onto every combatant's own
 * stat block by hand. Deliberately just a named, optionally-timed flag set - it does
 * nothing on its own, the same way `mwg` supplies no move-damage formula: a game reads
 * `field.has('rain')` itself wherever a formula needs to know.
 *
 * @example
 * ```ts
 * import { Field } from '@datamoc/mw_games/battle';
 *
 * const field = new Field();
 * field.set({ id: 'rain', duration: 5 });
 *
 * if (field.has('rain')) console.log('water moves are boosted');
 * field.advance(); // one round passes; duration counts down, expiring at 0
 * ```
 */
export interface FieldCondition {
	id: string;
	/** rounds remaining; omit for indefinite, cleared only by an explicit `clear` */
	duration?: number;
}

export class Field {
	private conditions = new Map<string, FieldCondition>();

	set(condition: FieldCondition): void {
		this.conditions.set(condition.id, { ...condition });
	}

	has(id: string): boolean {
		return this.conditions.has(id);
	}

	get(id: string): FieldCondition | undefined {
		return this.conditions.get(id);
	}

	clear(id: string): void {
		this.conditions.delete(id);
	}

	get active(): readonly FieldCondition[] {
		return [...this.conditions.values()];
	}

	/** ticks every timed condition down by `rounds`, clearing any that just ran out */
	advance(rounds = 1): void {
		for (const [id, condition] of this.conditions) {
			if (condition.duration === undefined) continue;

			condition.duration -= rounds;
			if (condition.duration <= 0) this.conditions.delete(id);
		}
	}
}
