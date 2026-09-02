import type { StatBlock, Modifier } from '../actors/StatBlock.ts';

/**
 * A bounded, symmetric stage ladder over a `StatBlock` stat - the Swords Dance/Screech
 * shape, where a stat is boosted or lowered in discrete steps, capped at some number of
 * steps either direction, and reset entirely on switch-out. `StatBlock`'s own modifiers are
 * unbounded and unstructured by design (right for equipment, wrong for this), so this is the
 * seam that shape needed: `mwg` supplies the clamp and the one-modifier-per-stat bookkeeping,
 * a game supplies `multiplier` - there is no "official" stage-to-multiplier curve to default
 * to without copying a specific existing game's numbers.
 */
export interface StatStagesOptions {
	/** the furthest a stage can go, either direction (Infinity for no cap at all) */
	max: number;

	/** the multiplier a given stage (negative, zero, or positive) resolves to */
	multiplier: (stage: number) => number;
}

export class StatStages {
	private stats: StatBlock;
	private max: number;
	private multiplierFor: (stage: number) => number;

	private stages = new Map<string, number>();
	private modifiers = new Map<string, Modifier>();

	constructor(stats: StatBlock, options: StatStagesOptions) {
		this.stats = stats;
		this.max = options.max;
		this.multiplierFor = options.multiplier;
	}

	/** a stat's current stage; 0 for one never changed */
	get(stat: string): number {
		return this.stages.get(stat) ?? 0;
	}

	/**
	 * Raises (or, given a negative `delta`, lowers) `stat`'s stage, clamped to ±`max`.
	 *
	 * @returns the actual change applied - less than `delta` once clamping bites, and 0 for a
	 * stat already at its cap - so a game can tell "Attack won't go any higher!" from a real
	 * change
	 */
	change(stat: string, delta: number): number {
		const current = this.get(stat);
		const next = Math.max(-this.max, Math.min(this.max, current + delta));
		const applied = next - current;
		if (applied === 0) return 0;

		this.stages.set(stat, next);
		this.applyModifier(stat, next);
		return applied;
	}

	private applyModifier(stat: string, stage: number): void {
		const existing = this.modifiers.get(stat);
		if (existing) this.stats.removeModifier(existing);

		if (stage === 0) {
			this.modifiers.delete(stat);
			return;
		}

		const modifier: Modifier = { stat, op: 'multiply', value: this.multiplierFor(stage) };
		this.stats.addModifier(modifier);
		this.modifiers.set(stat, modifier);
	}

	/** resets every stage to 0, removing every modifier this applied - the switch-out rule */
	resetAll(): void {
		for (const modifier of this.modifiers.values()) this.stats.removeModifier(modifier);
		this.modifiers.clear();
		this.stages.clear();
	}
}
