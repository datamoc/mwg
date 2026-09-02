import { StatBlock } from '../actors/StatBlock.ts';
import { Progression, powerCurve, type GrowthCurve } from '../actors/Progression.ts';

/**
 * A species, defined as data - `mwg` supplies no type chart and no species of its own;
 * copying any particular game's would be both wrong and useless to anyone else.
 */
export interface Species {
	id: string;
	types: readonly string[];

	/** stats at level 1; how they scale with level is `deriveStats` below, the game's own rule */
	baseStats: Record<string, number>;

	growth?: GrowthCurve;
}

export interface CreatureOptions {
	species: Species;
	level?: number;

	/**
	 * Turns a species' base stats and a level into this individual's actual stats - the
	 * "per-individual stats derived from" species data the capability spec promises.
	 * Without one, stats are simply the species' base stats at every level.
	 */
	deriveStats?: (base: Readonly<Record<string, number>>, level: number) => Record<string, number>;
}

/** the growth curve a creature gets if its species names none: a modest, capped default */
const DEFAULT_GROWTH = powerCurve(20, 2, 100);

/**
 * One individual: a species, a level and experience (via `mwg/actors`' `Progression`), and
 * a `StatBlock` so it can carry the same equipment modifiers any other actor can. Reuses
 * both rather than reimplementing them, since a creature's stats are not a different shape
 * from a character's - a level and a growth curve, feeding a `StatBlock`.
 */
export class Creature {
	readonly species: Species;
	readonly stats: StatBlock;
	readonly progression: Progression;
	private deriveStats?: CreatureOptions['deriveStats'];

	constructor(options: CreatureOptions) {
		this.species = options.species;
		this.deriveStats = options.deriveStats;
		this.progression = new Progression(options.species.growth ?? DEFAULT_GROWTH, {
			level: options.level ?? 1,
		});
		this.stats = new StatBlock({ base: this.computeBase() });
	}

	/** recomputes base stats for the current level - call after a level gained mid-battle */
	refreshStats(): void {
		const base = this.computeBase();
		for (const [name, value] of Object.entries(base)) this.stats.setBase(name, value);
	}

	private computeBase(): Record<string, number> {
		const level = this.progression.level;
		return this.deriveStats ? this.deriveStats(this.species.baseStats, level) : { ...this.species.baseStats };
	}
}
