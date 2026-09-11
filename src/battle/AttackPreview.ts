export interface PreviewCombatant {
	hp: number;
	maxHp?: number;
	name?: string;
}

export interface AttackPreviewOptions {
	attacker: PreviewCombatant;
	defender: PreviewCombatant;
	/** damage per strike, from the game's own formula - `mwg` supplies none */
	damage: number;
	strikes: number;
	/** chance to hit, 0 to 1; 1 (always hits) when omitted */
	chanceToHit?: number;
	/** which strikes land; every strike when omitted, for the maximum-damage preview */
	hits?: readonly boolean[];
	/** seconds between strikes in the animation; 0 when there is no animation */
	strikeDuration?: number;
}

/** One moment of the attack animation: the board after `strike` strikes. */
export interface AttackFrame {
	strike: number;
	time: number;
	attackerHp: number;
	defenderHp: number;
	/** hp taken off the defender by the strikes so far */
	defenderDamage: number;
}

/**
 * The numbers an attack dialog shows and animates: the attacker and defender's hp over the course
 * of a blow, plus the totals the labels print.
 *
 * It deliberately computes no damage of its own - this framework supplies no damage formula, so a
 * game hands in the per-strike `damage` exactly as its own rules worked it out. What the preview
 * adds is the part a dialog needs and a formula does not: the *timeline* (one frame per strike,
 * `sampleAt` the animation's own clock) and the two totals (the maximum, `damage * strikes`, and
 * the expected value once `chanceToHit` is weighed). Which strikes actually land is `hits`, so a
 * preview can show the maximum by default or a known outcome a replay already rolled.
 *
 * @example
 * ```ts
 * import { AttackPreview } from '@datamoc/mw_games/battle';
 *
 * const preview = new AttackPreview({
 *   attacker: { hp: 20 },
 *   defender: { hp: 12 },
 *   damage: 4,
 *   strikes: 3,
 *   chanceToHit: 0.6,
 *   strikeDuration: 0.2,
 * });
 * console.log(preview.totalDamage); // 12
 * console.log(preview.sampleAt(0.25).defenderHp); // 8, after the second strike
 * ```
 */
export class AttackPreview {
	readonly frames: readonly AttackFrame[];
	readonly totalDamage: number;
	readonly expectedDamage: number;
	readonly chanceToHit: number;
	private readonly strikeDuration: number;
	private readonly defenderHp0: number;

	constructor(options: AttackPreviewOptions) {
		this.chanceToHit = clamp01(options.chanceToHit ?? 1);
		this.strikeDuration = Math.max(0, options.strikeDuration ?? 0);
		this.totalDamage = Math.max(0, options.damage) * Math.max(0, options.strikes);
		this.expectedDamage = this.totalDamage * this.chanceToHit;
		this.defenderHp0 = options.defender.hp;

		const frames: AttackFrame[] = [];
		let defenderHp = options.defender.hp;
		for (let strike = 0; strike <= options.strikes; strike++) {
			if (strike > 0 && (options.hits?.[strike - 1] ?? true)) defenderHp -= Math.max(0, options.damage);
			frames.push({
				strike,
				time: strike * this.strikeDuration,
				attackerHp: options.attacker.hp,
				defenderHp: Math.max(0, defenderHp),
				defenderDamage: this.defenderHp0 - Math.max(0, defenderHp),
			});
		}
		this.frames = frames;
	}

	/** how long the animation runs, in seconds */
	get duration(): number {
		return this.strikeDuration * (this.frames.length - 1);
	}

	/** whether the defender would be at 0 hp once every landing strike has been shown */
	get defenderKilled(): boolean {
		return this.frames[this.frames.length - 1].defenderHp === 0;
	}

	/** the frame the animation shows at `time`, clamped to its own start and end */
	sampleAt(time: number): AttackFrame {
		const last = this.frames.length - 1;
		if (this.strikeDuration <= 0) return this.frames[last];
		//compare frame times rather than dividing, so a float strike duration does not land on the
		//frame before the one its time names (0.4 / 0.2 can read just under 2)
		let index = 0;
		for (let frame = 0; frame <= last; frame++) {
			if (this.frames[frame].time <= time + 1e-9) index = frame;
			else break;
		}
		return this.frames[index];
	}
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
