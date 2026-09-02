/**
 * A phased boss fight: HP-fraction thresholds that fire enter-once hooks, plus a
 * cooldown rotation for the boss's abilities.
 *
 * The shape every multi-stage boss shares, whether it teleports at half health, enrages
 * at a third, or summons adds at each bracket: the fight is a ladder of phases entered
 * top-down, and each turn the boss ticks its abilities and uses whatever is ready. `mwg`
 * tracks the ladder and the timers; what a phase *does* (relocate, spawn, change the
 * arena) and what an ability *is* stay the game's own code, fired from the hooks and
 * picks this returns.
 */

export class BossPhases {
	private thresholds: readonly number[];
	private current = 0;

	/**
	 * @param thresholds HP fractions that open a new phase, highest first (e.g.
	 * `[0.66, 0.33]` for a three-stage fight) - descending order is required, since a
	 * lower bracket must never open before a higher one
	 */
	constructor(thresholds: readonly number[] = []) {
		for (let i = 1; i < thresholds.length; i++) {
			if (thresholds[i] >= thresholds[i - 1]) {
				throw new Error('boss phase thresholds must descend');
			}
		}
		this.thresholds = thresholds;
	}

	/** which phase the fight is in: the count of thresholds at or above `hpFraction` */
	get phase(): number {
		return this.current;
	}

	/**
	 * Moves the fight to whatever phase `hpFraction` belongs in.
	 *
	 * @returns the newly entered phase indices, in order - empty when nothing changed, so
	 * a game fires each phase's enter-hook exactly once; a single massive hit can enter
	 * several at once, and all of them are reported
	 */
	update(hpFraction: number): number[] {
		let phase = 0;
		while (phase < this.thresholds.length && hpFraction <= this.thresholds[phase]) phase++;

		const entered: number[] = [];
		while (this.current < phase) {
			this.current++;
			entered.push(this.current);
		}
		return entered;
	}

	/** restarts the fight at phase 0, for a rematch or a reused boss object */
	reset(): void {
		this.current = 0;
	}

	toJSON(): { phase: number } {
		return { phase: this.current };
	}

	static fromJSON(thresholds: readonly number[], data: { phase: number }): BossPhases {
		const phases = new BossPhases(thresholds);
		phases.current = data.phase;
		return phases;
	}
}

/**
 * One ability per named slot, each with its own cooldown in turns: `tick()` counts every
 * cooldown down by one turn, `ready()` lists whatever may fire now, and `use(id)` spends
 * one - resetting its full cooldown - reporting whether it was actually ready, so a game
 * can tell "fired" from "still waiting" without tracking the counters itself.
 */
export class AbilityCycle {
	private cooldowns: ReadonlyMap<string, number>;
	private remaining = new Map<string, number>();

	constructor(cooldowns: Record<string, number>) {
		this.cooldowns = new Map(Object.entries(cooldowns));
	}

	/** counts every cooling-down ability one turn closer to ready */
	tick(): void {
		for (const [id, left] of this.remaining) {
			if (left <= 1) this.remaining.delete(id);
			else this.remaining.set(id, left - 1);
		}
	}

	/** ids that may fire right now, in definition order */
	ready(): string[] {
		const out: string[] = [];
		for (const id of this.cooldowns.keys()) {
			if (!this.remaining.has(id)) out.push(id);
		}
		return out;
	}

	/**
	 * Fires `id`, resetting its full cooldown.
	 *
	 * @returns false, changing nothing, for an unknown id or one still cooling down
	 */
	use(id: string): boolean {
		const cooldown = this.cooldowns.get(id);
		if (cooldown === undefined || this.remaining.has(id)) return false;
		if (cooldown > 0) this.remaining.set(id, cooldown);
		return true;
	}

	toJSON(): { remaining: [string, number][] } {
		return { remaining: [...this.remaining] };
	}

	static fromJSON(cooldowns: Record<string, number>, data: { remaining: [string, number][] }): AbilityCycle {
		const cycle = new AbilityCycle(cooldowns);
		for (const [id, left] of data.remaining) cycle.remaining.set(id, left);
		return cycle;
	}
}
