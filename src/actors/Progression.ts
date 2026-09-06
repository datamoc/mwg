/**
 * Levels, experience, and the growth curve between them.
 *
 * The curve is a small interface rather than a formula, so it is entirely replaceable: a
 * game that wants Pokémon-style fast/medium/slow curves, or a flat curve with no cap, or one
 * read from a spreadsheet, supplies its own `GrowthCurve` and everything else here still
 * works unchanged.
 */

export interface GrowthCurve {
	/** total experience needed to *reach* this level; level 1 should be 0 */
	experienceFor(level: number): number;

	/** the highest level the curve defines; levelling stops here */
	maxLevel: number;
}

/**
 * A curve reaching `maxLevel` at roughly `base * (level - 1) ^ power` total experience.
 *
 * @example
 * ```ts
 * import { powerCurve, Progression } from '@datamoc/mw_games/actors';
 *
 * const curve = powerCurve(100, 1.5, 50); // level 50 caps out around 100 * 49^1.5 experience
 * const progression = new Progression(curve);
 *
 * const levelsGained = progression.addExperience(250);
 * console.log(progression.level, progression.experienceToNext);
 * ```
 */
export function powerCurve(base: number, power: number, maxLevel: number): GrowthCurve {
	return {
		maxLevel,
		experienceFor: (level) => (level <= 1 ? 0 : Math.round(base * Math.pow(level - 1, power))),
	};
}

export class Progression {
	private curve: GrowthCurve;

	level: number;
	experience: number;

	constructor(curve: GrowthCurve, start: { level?: number; experience?: number } = {}) {
		this.curve = curve;
		this.level = start.level ?? 1;
		this.experience = start.experience ?? this.curve.experienceFor(this.level);
	}

	/** experience still needed for the next level; null once the curve's cap is reached */
	get experienceToNext(): number | null {
		if (this.level >= this.curve.maxLevel) return null;
		return this.curve.experienceFor(this.level + 1) - this.experience;
	}

	/** @returns how many levels were gained, 0 if none - a single large gain may span several */
	addExperience(amount: number): number {
		this.experience += amount;

		let gained = 0;
		while (this.level < this.curve.maxLevel && this.experience >= this.curve.experienceFor(this.level + 1)) {
			this.level++;
			gained++;
		}
		return gained;
	}

	/** level and experience; the curve itself is a definition, supplied fresh on load */
	toJSON(): { level: number; experience: number } {
		return { level: this.level, experience: this.experience };
	}

	static fromJSON(curve: GrowthCurve, data: { level: number; experience: number }): Progression {
		return new Progression(curve, data);
	}
}
