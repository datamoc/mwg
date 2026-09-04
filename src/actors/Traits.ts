import { StatBlock, type Modifier } from './StatBlock.ts';
import * as Random from '../core/Random.ts';

/**
 * One entry in a shared pool a creature or unit can draw from at creation - "born strong",
 * "nocturnal", "unlucky". Distinct from `actors.Affix` (item-side, one per item, weight-picked
 * at generation) and `StatusEffect` (temporary, expires): a trait is permanent once assigned,
 * never chosen by the player, and belongs to the creature rather than anything it carries.
 */
export interface TraitDef {
	name: string;
	modifiers: readonly Omit<Modifier, 'source'>[];

	/** shown in a character sheet; `mwg` never reads this itself */
	description?: string;
}

/** an assigned trait's modifiers can be found again later via `removeModifiersFrom` */
export interface AssignedTrait {
	trait: TraitDef;
	source: symbol;
}

/**
 * Draws `count` distinct traits at random from `pool` and applies their modifiers to `stats`
 * permanently - no clock, no trigger, nothing removes them automatically. Each trait gets its
 * own `source` symbol so a game that genuinely needs to strip one later still can, via
 * `StatBlock.removeModifiersFrom`, even though nothing here ever calls that itself.
 *
 * @param count clamped to `pool.length` - asking for more traits than exist in the pool
 * assigns every one of them rather than throwing
 */
export function assignTraits(stats: StatBlock, pool: readonly TraitDef[], count: number): AssignedTrait[] {
	const picked = Random.shuffle([...pool]).slice(0, Math.min(count, pool.length));
	return picked.map((trait) => {
		const source = Symbol(`trait:${trait.name}`);
		for (const modifier of trait.modifiers) stats.addModifier({ ...modifier, source });
		return { trait, source };
	});
}
