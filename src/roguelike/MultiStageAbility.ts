/**
 * An ability whose own use unfolds through named stages in sequence (windup, active, recovery)
 * rather than resolving instantly - the multi-stage subclass/ability shape a talent branch's
 * capstone move often needs, distinct from `AbilityCycle`'s cooldown-only view of "may I use
 * this yet". `mwg` tracks only which stage is current and when it should advance; what each
 * stage does (grant invulnerability, deal damage, open a window for a follow-up) stays the
 * game's own hook, fired from `advance`'s returned stage name.
 */
export interface AbilityStage {
	name: string;

	/** turns this stage lasts once entered */
	duration: number;
}

export class MultiStageAbility {
	private stages: readonly AbilityStage[];
	private index = -1;
	private remaining = 0;

	constructor(stages: readonly AbilityStage[]) {
		if (stages.length === 0) throw new Error('a multi-stage ability needs at least one stage');
		this.stages = stages;
	}

	/** whether the ability is currently mid-sequence */
	get active(): boolean {
		return this.index >= 0;
	}

	/** the currently active stage, or null when not in use */
	get stage(): AbilityStage | null {
		return this.index >= 0 ? this.stages[this.index] : null;
	}

	/** begins the ability at its first stage; a no-op, reporting false, while already active */
	start(): boolean {
		if (this.active) return false;
		this.index = 0;
		this.remaining = this.stages[0].duration;
		return true;
	}

	/**
	 * Advances one turn.
	 *
	 * @returns the newly entered stage's name the turn a stage changes, `'done'` the turn the
	 * last stage finishes, or null when nothing changed (still mid-stage, or never started)
	 */
	advance(): string | null {
		if (!this.active) return null;
		this.remaining--;
		if (this.remaining > 0) return null;

		this.index++;
		if (this.index >= this.stages.length) {
			this.index = -1;
			return 'done';
		}
		this.remaining = this.stages[this.index].duration;
		return this.stages[this.index].name;
	}

	/** ends the ability early - interrupted mid-windup, say */
	cancel(): void {
		this.index = -1;
		this.remaining = 0;
	}

	toJSON(): { index: number; remaining: number } {
		return { index: this.index, remaining: this.remaining };
	}

	static fromJSON(stages: readonly AbilityStage[], data: { index: number; remaining: number }): MultiStageAbility {
		const ability = new MultiStageAbility(stages);
		ability.index = data.index;
		ability.remaining = data.remaining;
		return ability;
	}
}
