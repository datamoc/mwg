/**
 * Tiered specialization: level-gated tiers that grant points, offer a
 * mutually-exclusive branch choice, or offer a capstone choice.
 *
 * The shape a subclass system and an armor-ability slot share: most tiers just add
 * points a game spends elsewhere (through `SkillPoints`, typically), one tier asks the
 * player to commit to exactly one of several branches for the rest of the run, and a
 * late tier grants exactly one capstone. `mwg` names none of the options itself - a
 * game's own track definition does, the same way `QuestLog` takes quest definitions.
 *
 * Points are deliberately only a ledger here, not a spend rule: what a point buys is a
 * game's own design (a stat rank, a talent node), so spending stays game-side the way
 * `skillCheck` is a dice roll and nothing about who is rolling it.
 */

export type AdvancementTierKind = 'points' | 'branch' | 'capstone';

export interface AdvancementOption {
	id: string;

	/** shown in a choice UI; `mwg` never reads this itself */
	description?: string;
}

export interface AdvancementTier {
	/** the level at which this tier opens */
	threshold: number;

	kind: AdvancementTierKind;

	/** points tiers: how many ledger points opening this tier grants in total */
	points?: number;

	/** branch/capstone tiers: the mutually exclusive options, exactly one may be taken */
	options?: readonly AdvancementOption[];
}

export interface AdvancementTrack {
	tiers: readonly AdvancementTier[];
}

export class Advancement {
	private track: AdvancementTrack;

	/** how many tiers have had their points granted so far */
	private grantedTiers = 0;

	private balance = 0;
	private choices = new Map<number, string>();

	constructor(track: AdvancementTrack) {
		this.track = track;
	}

	/** unspent ledger points */
	get points(): number {
		return this.balance;
	}

	/** tier indices whose threshold the given level has reached, in order */
	openTiers(level: number): number[] {
		const out: number[] = [];
		this.track.tiers.forEach((tier, index) => {
			if (level >= tier.threshold) out.push(index);
		});
		return out;
	}

	/**
	 * Opens every tier up to `level`, granting each newly opened points tier's points.
	 *
	 * @returns how many points were granted - 0 when nothing new opened, so a game can
	 * tell "level up with no new tier" from a real unlock
	 */
	grant(level: number): number {
		let granted = 0;
		while (this.grantedTiers < this.track.tiers.length && level >= this.track.tiers[this.grantedTiers].threshold) {
			const tier = this.track.tiers[this.grantedTiers];
			if (tier.kind === 'points') {
				this.balance += tier.points ?? 0;
				granted += tier.points ?? 0;
			}
			this.grantedTiers++;
		}
		return granted;
	}

	/** spends ledger points; false, spending nothing, when the balance is short */
	spend(points: number): boolean {
		if (this.balance < points) return false;
		this.balance -= points;
		return true;
	}

	/**
	 * Takes one option of an open branch/capstone tier - permanently. Throws for a points
	 * tier, a tier that has not opened yet, an unknown option, or a tier already decided,
	 * so a game cannot accidentally offer a choice twice.
	 */
	choose(tierIndex: number, optionId: string, level: number): void {
		const tier = this.track.tiers[tierIndex];
		if (!tier) throw new Error(`no such advancement tier: ${tierIndex}`);
		if (tier.kind === 'points') throw new Error(`tier ${tierIndex} grants points, it has no choice`);
		if (level < tier.threshold) throw new Error(`tier ${tierIndex} has not opened yet`);
		if (this.choices.has(tierIndex)) throw new Error(`tier ${tierIndex} is already decided`);
		if (!(tier.options ?? []).some((option) => option.id === optionId)) {
			throw new Error(`tier ${tierIndex} has no option "${optionId}"`);
		}
		this.choices.set(tierIndex, optionId);
	}

	/** the option taken at a branch/capstone tier, or null when undecided */
	choice(tierIndex: number): string | null {
		return this.choices.get(tierIndex) ?? null;
	}

	toJSON(): { grantedTiers: number; balance: number; choices: [number, string][] } {
		return { grantedTiers: this.grantedTiers, balance: this.balance, choices: [...this.choices] };
	}

	/** rebuilds advancement from save data - the track itself is supplied fresh, the same as `QuestLog` definitions */
	static fromJSON(
		track: AdvancementTrack,
		data: { grantedTiers: number; balance: number; choices: [number, string][] }
	): Advancement {
		const advancement = new Advancement(track);
		advancement.grantedTiers = data.grantedTiers;
		advancement.balance = data.balance;
		for (const [tier, option] of data.choices) advancement.choices.set(tier, option);
		return advancement;
	}
}
